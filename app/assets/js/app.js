"use strict";
/* Navigation, actions, gestes, évènements envoyés par Android, démarrage. */

const view = $("#view");

/* ---------- affichage ---------- */
function routeHTML() {
  const r = ST.route;
  if (r === "planning") return vuePlanning();
  if (r === "fichiers") return vueFichiers();
  if (r === "claude") return vueClaude();
  if (r === "reglages") return vueReglages();
  if (r === "corbeille") return vueCorbeille();
  if (r === "aide") return vueAide();
  if (r.startsWith("n:")) {
    const p = r.slice(2).split("@");
    return vueNoeud(p[0], p[1] && DATE_RE.test(p[1]) ? p[1] : "");
  }
  return vueAccueil();
}
const ONGLETS = ["accueil", "planning", "fichiers", "claude"];
const mouvementReduit = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
const vibrer = (type = "leger") => { if (A) natif("vibrer", type); };
/* ---------- mouvement ----------
   Seulement transform et opacity, animés par le compositeur (Web Animations) : l'animation reste fluide
   même pendant que la page suivante se dessine, et l'écran est demandé à 120 Hz côté Android. */
const EASE = "cubic-bezier(.2,.9,.25,1)";
let animVue = null;
/** Fait entrer un contenu en glissant depuis un côté (sens 1 : depuis la droite, -1 : depuis la gauche, 0 : fondu). */
function entree(el, sens, part, duree) {
  if (!el || mouvementReduit() || typeof el.animate !== "function") return null;
  const dx = sens ? Math.round(sens * (window.innerWidth || 400) * (part || 0.1)) : 0;
  try {
    return el.animate(dx ? [{transform: `translate3d(${dx}px,0,0)`, opacity: 0.2}, {transform: "translate3d(0,0,0)", opacity: 1}] : [{opacity: 0.2}, {opacity: 1}],
      {duration: duree || (dx ? 230 : 160), easing: EASE});
  } catch (e) { return null; }
}
/** Change d'écran : le nouveau contenu remplace l'ancien tout de suite et entre en glissant. */
function avecTransition(sens, maj) {
  if (animVue) { try { animVue.cancel(); } catch (e) { /* rien */ } animVue = null; }
  maj();
  if (ST.glisse) return;
  animVue = entree(view, {avant: 1, droite: 1, arriere: -1, gauche: -1}[sens] || 0, 0.08);
}
function marquerVu(cle) {
  if (!D.config.vu || typeof D.config.vu !== "object") D.config.vu = {};
  if (D.config.vu[cle]) return;
  D.config.vu[cle] = true;
  ecrire();
}
function majChrome() {
  const tab = ONGLETS.includes(ST.route) ? ST.route : ST.tab;
  $$(".tab").forEach(t => { if (t.dataset.tab === tab) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
  const pend = remarquesEnAttente().length, b = $("#claude-badge");
  b.hidden = !pend;
  b.textContent = pend > 9 ? "9+" : String(pend);
  const pastille = $(".tab-pill");
  if (pastille) pastille.style.transform = `translateX(${Math.max(0, ONGLETS.indexOf(tab)) * 100}%)`;
  const fab = $("#fab");
  fab.hidden = ["accueil", "planning", "claude", "reglages", "corbeille", "aide"].includes(ST.route);
  majDock();
}
/* ---------- barre du pouce (au-dessus des onglets) : recherche et + sur l'accueil, affichage du planning ---------- */
function dockAccueil() {
  return `<div class="dock-in"><label class="dock-search"><span class="search-ico">${ICON.search}</span><input id="q" type="search" placeholder="Chercher dans le tableau" value="${esc(ST.q)}" autocomplete="off" enterkeyhint="search" aria-label="Chercher dans tout le tableau"></label><button class="dock-add" type="button" data-act="fab" aria-label="Ajouter">${ICON.plus}</button></div>`;
}
function dockPlanning() {
  return `<div class="dock-in"><div class="seg dock-seg" role="group" aria-label="Affichage">${["jour", "semaine", "mois", "liste"].map(x => `<button type="button" data-act="pl-vue" data-v="${x}" aria-pressed="${x === PL.vue}">${VUE_LABEL[x]}</button>`).join("")}</div><button class="dock-auj" type="button" data-act="pl-auj">Auj.</button><button class="dock-add" type="button" data-act="fab" aria-label="Nouvel événement">${ICON.plus}</button></div>`;
}
function majDock() {
  const d = $("#dock");
  if (!d) return;
  const r = ST.route === "accueil" || ST.route === "planning" ? ST.route : "";
  document.documentElement.classList.toggle("avec-dock", !!r);
  if (!r) { d.hidden = true; d.dataset.r = ""; return; }
  if (d.dataset.r !== r) { d.dataset.r = r; d.innerHTML = r === "accueil" ? dockAccueil() : dockPlanning(); }
  d.hidden = false;
  if (r === "planning") {
    $$('#dock [data-act="pl-vue"]').forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === PL.vue)));
    const t = today(), j = PL.jour;
    const ici = PL.vue === "liste" || (PL.vue === "jour" ? j === t : PL.vue === "mois" ? j.slice(0, 7) === t.slice(0, 7) : mondayOf(j) === mondayOf(t));
    const b = $('#dock [data-act="pl-auj"]');
    if (b) b.classList.toggle("ici", ici);
  }
}
function appliquerMain() {
  document.documentElement.dataset.main = D.config.main === "droite" ? "droite" : "gauche";
}
function render() {
  const ae = document.activeElement;
  let fid = null, sel = null;
  if (ae && ae.id && view.contains(ae)) {
    fid = ae.id;
    try { if (typeof ae.selectionStart === "number") sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { /* champ sans sélection */ }
  }
  let html;
  try { html = routeHTML(); } catch (e) { noterErreur("affichage " + ST.route + " : " + (e && e.message)); html = ecranErreur(e); }
  creaFinir();
  view.innerHTML = html;
  if (fid) {
    const el = document.getElementById(fid);
    if (el) { try { el.focus({preventScroll: true}); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* rien */ } }
  }
  majChrome();
  if (ST.route === "planning") { brancherGrille(); plDefiler(); }
  if (ST.route === "reglages") majChampsRappel(view, "p");
}

/* ---------- navigation ---------- */
function go(r) {
  if (!r) r = "accueil";
  if (ONGLETS.includes(r)) { allerOnglet(r); return; }
  if (r === ST.route) { render(); return; }
  avecTransition("avant", () => {
    ST.pile.push({r: ST.route, y: window.scrollY});
    if (ST.pile.length > 40) ST.pile.shift();
    ST.route = r;
    render();
    window.scrollTo(0, 0);
  });
}
function remplacerRoute(r) { ST.route = r; }
/** retouche : l'utilisateur a touché l'onglet où il est déjà → on remonte en haut. */
function allerOnglet(t, retouche) {
  if (retouche && t === ST.route && !ST.pile.length) {
    if (window.scrollY > 4) window.scrollTo({top: 0, behavior: mouvementReduit() ? "auto" : "smooth"});
    else if (t === "planning" && PL.jour !== today()) plAujourdhui();
    return;
  }
  const avant = ONGLETS.indexOf(ONGLETS.includes(ST.route) ? ST.route : ST.tab), apres = ONGLETS.indexOf(t);
  const sens = apres > avant ? "droite" : apres < avant ? "gauche" : "fondu";
  avecTransition(sens, () => {
    ST.pile = [];
    ST.tab = t;
    ST.route = t;
    if (t === "planning") PL.defiler = true;
    render();
    window.scrollTo(0, 0);
  });
}
function retour() {
  if (!$("#sheet").hidden && !$("#sheet").classList.contains("ferme")) { fermerFeuille(); return true; }
  if (!$("#viewer").hidden && !$("#viewer").classList.contains("ferme")) { fermerVisionneuse(); return true; }
  if (ST.pile.length) {
    const p = ST.pile.pop();
    avecTransition("arriere", () => { ST.route = p.r; render(); window.scrollTo(0, p.y || 0); });
    return true;
  }
  if (ST.route.startsWith("n:")) {
    const n = S.N.get(ST.route.slice(2).split("@")[0]);
    const p = n ? parentOf(n) : "root";
    avecTransition("arriere", () => { ST.route = p === "root" ? ST.tab : "n:" + p; render(); window.scrollTo(0, 0); });
    return true;
  }
  if (!ONGLETS.includes(ST.route)) { avecTransition("arriere", () => { ST.route = ST.tab; render(); window.scrollTo(0, 0); }); return true; }
  if (ST.route !== "accueil") { allerOnglet("accueil"); return true; }
  return false;
}
window.tableauRetour = retour;

/* ---------- messages ---------- */
let toastTimer = null;
function cacherToast() { $("#toast").hidden = true; }
function toast(msg, action) {
  $("#toast-msg").textContent = msg;
  const b = $("#toast-act");
  if (action) { b.hidden = false; b.textContent = action.label; b.onclick = () => { cacherToast(); action.fn(); }; }
  else { b.hidden = true; b.onclick = null; }
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(cacherToast, action ? 7000 : 3500);
}
/** Premier toucher : « Confirmer ? » ; second toucher dans les 4 s : l'action. */
function armOr(btn, fn) {
  if (btn.dataset.armed === "1") { btn.dataset.armed = ""; fn(); return; }
  const old = btn.innerHTML;
  btn.dataset.armed = "1";
  btn.textContent = "Confirmer ?";
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.innerHTML = old; } }, 4000);
}
function copierTexte(t, msg) {
  if (A) { natif("copier", t); if (msg) toast(msg); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => { if (msg) toast(msg); }, () => toast("Copie impossible ici."));
  else toast("Copie impossible ici.");
}
const seulementAndroid = () => { toast("Disponible dans l’appli Android."); };

/* ---------- actions sur les éléments ---------- */
function fab() {
  if (ST.route === "planning") {
    const t = today();
    let d = PL.jour;
    if (PL.vue === "semaine" && mondayOf(PL.jour) === mondayOf(t)) d = t;
    if (PL.vue === "mois") d = PL.jour.slice(0, 7) === t.slice(0, 7) ? t : firstOfMonth(PL.jour);
    if (PL.vue === "liste") d = t;
    nouvelEvenement(d);
    return;
  }
  if (ST.route.startsWith("n:")) {
    const n = S.N.get(ST.route.slice(2).split("@")[0]);
    if (n) { feuilleAjout(n.type === "dossier" ? n.id : parentOf(n)); return; }
  }
  feuilleAjout();
}
function toggleTache(id, bouton) {
  const n = D.nodes[id];
  if (!n) return;
  const fait = n.statut !== "fait";
  D.nodes[id] = Object.assign({}, n, {statut: fait ? "fait" : "a-faire"}, tampon());
  if (fait) vibrer("confirme");
  if (bouton && bouton.classList.contains("check") && fait && !mouvementReduit()) {
    bouton.classList.add("on", "pop");
    const ligne = bouton.closest(".row");
    if (ligne) ligne.classList.add("is-done");
    setTimeout(() => sauver(), 280);
  } else sauver();
}
function epingler(id) {
  const n = D.nodes[id];
  if (!n) return;
  const v = n.epingle !== true;
  D.nodes[id] = Object.assign({}, n, {epingle: v}, tampon());
  sauver(v ? "Épinglé sur l’accueil" : "Retiré de l’accueil");
}
function cocherCase(id, ligne) {
  const n = D.nodes[id];
  if (!n) return;
  D.nodes[id] = Object.assign({}, n, {texte: basculerCase(str(n.texte), ligne)}, tampon());
  sauver();
}
function supprimerOccurrence(id, date) {
  const n = D.nodes[id];
  if (!n || !n.repete) return;
  const r = Object.assign({}, n.repete);
  r.sauf = (Array.isArray(r.sauf) ? r.sauf : []).concat([date]);
  D.nodes[id] = Object.assign({}, n, {repete: r}, tampon());
  retour();
  sauver({text: "Supprimé le " + F_DM.format(pd(date)), action: {label: "Annuler", fn: () => {
    const m = D.nodes[id];
    if (!m || !m.repete) return;
    const rr = Object.assign({}, m.repete);
    rr.sauf = (rr.sauf || []).filter(x => x !== date);
    D.nodes[id] = Object.assign({}, m, {repete: rr});
    sauver("Rétabli");
  }}});
}
function demanderClaude(id) {
  ST.draftCible = id;
  allerOnglet("claude");
  setTimeout(() => { const ta = $("#rem-texte"); if (ta) ta.focus(); }, 80);
}
function corbeilleNoeud(id) {
  const n = S.N.get(id);
  if (!n || !D.nodes[id]) return;
  D.nodes[id] = Object.assign({}, D.nodes[id], {corbeille: true}, tampon());
  fermerFeuille();
  const cur = ST.route.startsWith("n:") ? ST.route.slice(2).split("@")[0] : "";
  if (cur && (cur === id || chain(cur).some(x => x.id === id))) {
    const p = parentOf(n);
    ST.route = ST.pile.length ? ST.pile.pop().r : (p === "root" ? ST.tab : "n:" + p);
  }
  sauver({text: "« " + (n.titre || "Sans titre") + " » est dans la corbeille", action: {label: "Annuler", fn: () => restaurerNoeud(id)}});
}
function restaurerNoeud(id) {
  const n = D.nodes[id];
  if (!n) return;
  D.nodes[id] = Object.assign({}, n, {corbeille: false}, tampon());
  sauver("Restauré");
}
function purgerNoeud(id, silencieux) {
  const ids = [id, ...collectDesc(id, new Set())];
  const fids = [...S.F.values()].filter(f => ids.includes(f.parent)).map(f => f.id);
  for (const x of ids) delete D.nodes[x];
  supprimerFichiersDefinitivement(fids);
  if (!silencieux) sauver(ids.length > 1 ? `Supprimé définitivement (${plural(ids.length, "élément")})` : "Supprimé définitivement");
}
function fichierCorbeille(fid) {
  const f = D.fichiers[fid];
  if (!f) return;
  D.fichiers[fid] = Object.assign({}, f, {corbeille: true}, tampon());
  fermerVisionneuse();
  sauver({text: "Fichier mis à la corbeille", action: {label: "Annuler", fn: () => restaurerFichier(fid)}});
}
function restaurerFichier(fid) {
  const f = D.fichiers[fid];
  if (!f) return;
  const parent = f.parent && S.vis.has(f.parent) ? f.parent : "";
  D.fichiers[fid] = Object.assign({}, f, {corbeille: false, parent}, tampon());
  sauver("Fichier restauré");
}
function purgerFichier(fid) { supprimerFichiersDefinitivement([fid]); sauver("Fichier supprimé définitivement"); }
function viderCorbeille() {
  for (const n of [...S.N.values()].filter(x => x.corbeille)) if (D.nodes[n.id]) purgerNoeud(n.id, true);
  supprimerFichiersDefinitivement([...S.F.values()].filter(f => f.corbeille).map(f => f.id));
  sauver("Corbeille vidée");
}

/* ---------- Claude ---------- */
function ajouterRemarque() {
  const texte = val("rem-texte").trim();
  if (!texte && !ST.draftFichiers.length) { toast("Écris d’abord ta demande."); const ta = $("#rem-texte"); if (ta) ta.focus(); return; }
  const cible = ST.draftCible && S.N.has(ST.draftCible) ? ST.draftCible : "";
  D.remarques[newId("r")] = {texte: texte || "Voir les fichiers joints.", cible, cibleChemin: cible ? pathLabel(cible) : "", fichiers: ST.draftFichiers.slice(), statut: "en-attente", reponse: "", cree: maintenantIso(), traitee: "", envoyee: ""};
  ST.draftR = ""; ST.draftCible = ""; ST.draftFichiers = [];
  sauver("Demande ajoutée. Envoie-la à Claude juste en dessous.");
}
function delRemarque(id) { delete D.remarques[id]; sauver("Demande retirée"); }
function marquerEnvoi() {
  const now = maintenantIso();
  for (const r of remarquesEnAttente()) D.remarques[r.id] = Object.assign({}, D.remarques[r.id], {envoyee: now});
  D.config.dernierEnvoi = now;
  natif("attendreClaude", String(Date.now() + 3 * 3600e3));
  ecrire();
  reindexer();
  render();
}
function envoyerClaude() {
  const joints = fichiersAEnvoyer();
  const texte = exportTexte(joints);
  if (A) natif("partager", texte, JSON.stringify(joints.map(f => ({fichier: f.fichier, nom: f.nom}))));
  else copierTexte(texte, "Copié. Colle-le dans ta conversation avec Claude.");
  marquerEnvoi();
}
function copierExport() {
  copierTexte(exportTexte(fichiersAEnvoyer()), "Copié. Colle-le dans ta conversation avec Claude.");
  marquerEnvoi();
}
function envoyerFichierClaude(fid) {
  const f = S.F.get(fid);
  if (!f) return;
  if (!A) { seulementAndroid(); return; }
  const ou = f.parent && S.N.has(f.parent) ? pathLabel(f.parent) : "Non rangés";
  natif("partager", `Fichier « ${f.nom} » de mon Tableau (id ${f.id}), rangé dans ${ou}.`, JSON.stringify([{fichier: f.fichier, nom: f.nom}]));
  natif("attendreClaude", String(Date.now() + 3 * 3600e3));
}
function ouvrirAvec(fid) {
  const f = S.F.get(fid);
  if (!f) return;
  if (!A) { seulementAndroid(); return; }
  natif("ouvrirAvec", f.fichier, f.nom);
}
function montrerErrImp(m) {
  ST.impErr = m;
  const e = $("#imp-err");
  if (e) { e.textContent = m; e.hidden = !m; }
}
function collerCode() {
  const t = A ? str(natif("coller")) : "";
  if (!t.trim()) { toast("Rien à coller. Appuie longuement dans la case pour coller."); return; }
  ST.draftImp = t;
  ST.impErr = "";
  render();
  verifierCode();
}
function verifierCode() {
  const ta = $("#imp-texte");
  if (ta) ST.draftImp = ta.value;
  const texte = ST.draftImp.trim();
  if (!texte) { montrerErrImp("Colle d’abord le code que Claude t’a donné."); return; }
  let p;
  try { p = analyserCode(texte); } catch (err) { montrerErrImp(err.message); return; }
  montrerErrImp("");
  feuilleApercu(p);
}
function appliquerCode() {
  const p = ST.apercu;
  if (!p) return;
  const avant = JSON.stringify(D);
  let resume;
  try { resume = p.kind === "full" ? restaurerComplet(p.obj) : appliquerChangements(p.obj); } catch (err) {
    D = JSON.parse(avant);
    fermerFeuille();
    montrerErrImp(err.message);
    return;
  }
  ST.draftImp = ""; ST.impErr = ""; ST.apercu = null;
  fermerFeuille();
  natif("attendreClaude", "0");
  sauver({text: resume, action: {label: "Annuler", fn: () => { D = JSON.parse(avant); sauver("Mise à jour annulée"); }}});
}
function envoyerPlantage() {
  const p = str(natif("dernierPlantage"));
  const t = "Rapport de plantage du Tableau " + (INFOS.version || "") + " :\n\n" + p + "\n\nErreurs de la page :\n" + ERREURS.map(e => e.t + " " + e.m).join("\n");
  natif("partager", t, "[]");
  natif("effacerPlantage");
  ERREURS = [];
  lsSet("tableau.erreurs", "[]");
  setTimeout(render, 300);
}

/* ---------- réglages ---------- */
function testerRappel(o) {
  if (!A) { seulementAndroid(); return; }
  const op = o || rappelDefaut();
  const etat = str(natif("etatNotifications"));
  if (etat === "a-demander") { ST.testApresPermission = op; natif("demanderNotifications"); return; }
  if (etat === "bloque") { toast("Les notifications sont bloquées pour Tableau.", {label: "Autoriser", fn: () => natif("reglagesNotifications")}); return; }
  natif("testerRappel", JSON.stringify({mode: op.mode, duree: op.duree}));
  toast("Essai dans 5 secondes : " + resumeOptsRappel(op).toLowerCase());
}
const lireOptsChamps = p => ({mode: radio(p + "-rmode") || "sonnerie", duree: num(val(p + "-rduree")) || 0, fois: num(val(p + "-rfois")) || 1, ecart: num(val(p + "-recart")) || 10});
function enregistrerRappelDefaut() {
  D.config.rappelDefaut = lireOptsChamps("p");
  ecrire();
  majChampsRappel(view, "p");
  programmerRappels();
  toast("Enregistré");
}
function sauvegarder() {
  if (!A) { seulementAndroid(); return; }
  natif("sauvegarder", "Tableau-sauvegarde-" + today() + ".zip");
}
function remplirRythme() {
  const debut = val("ry-debut"), fin = val("ry-fin");
  const ne = Math.max(0, parseInt(val("ry-ecole"), 10) || 0), nt = Math.max(0, parseInt(val("ry-entreprise"), 10) || 0);
  const premier = val("ry-premier") || "ecole";
  const err = m => { const e = $("#ry-err"); if (e) { e.textContent = m; e.hidden = false; } };
  if (!DATE_RE.test(debut) || !DATE_RE.test(fin)) return err("Choisis les deux dates.");
  if (fin < debut) return err("La date de fin est avant le début.");
  if (ne + nt === 0) return err("Indique au moins une semaine d’école ou d’entreprise.");
  const motif = [];
  const ordre = premier === "ecole" ? [["ecole", ne], ["entreprise", nt]] : [["entreprise", nt], ["ecole", ne]];
  for (const [ty, k] of ordre) for (let i = 0; i < k; i++) motif.push(ty);
  let n = 0;
  for (let l = mondayOf(debut), i = 0; l <= fin && i < 260; l = addDays(l, 7), i++) { D.semaines[l] = motif[i % motif.length]; n++; }
  sauver(plural(n, "semaine remplie", "semaines remplies"));
}
function enregistrerSemaine() {
  const l = ST.edit && ST.edit.semaine;
  if (!l) return;
  const t = radio("sem-type");
  if (t) D.semaines[l] = t; else delete D.semaines[l];
  fermerFeuille();
  sauver(t ? "Semaine " + SEMAINES[t].toLowerCase() : "Semaine sans type");
}
function enregistrerFichier() {
  const fid = ST.edit && ST.edit.fichier;
  const f = fid && D.fichiers[fid];
  if (!f) return;
  const nom = val("fi-nom").trim();
  if (!nom) { erreurFeuille("Donne-lui un nom.", "fi-nom"); return; }
  const parent = val("fi-parent");
  D.fichiers[fid] = Object.assign({}, f, {nom, parent}, tampon());
  const ouvert = !$("#viewer").hidden;
  fermerFeuille();
  sauver("Rangé dans " + (parent ? pathLabel(parent) : "Non rangés"));
  if (ouvert) ouvrirVisionneuse(fid);
}

/* ---------- partage depuis une autre appli ---------- */
function recevoirPartage(d) {
  const texte = str(d.texte);
  const liste = Array.isArray(d.fichiers) ? d.fichiers : [];
  if (texte.includes("tableau-changes") && !liste.length) {
    ST.draftImp = texte;
    ST.impErr = "";
    fermerVisionneuse();
    allerOnglet("claude");
    try { feuilleApercu(analyserCode(texte)); } catch (err) { montrerErrImp(err.message); }
    return;
  }
  const ids = liste.length ? ajouterFichiers(liste, "") : [];
  if (ids.length) { ecrire(); reindexer(); render(); }
  const errs = Array.isArray(d.erreurs) ? d.erreurs : [];
  if (errs.length) toast(str(errs[0]));
  if (!ids.length && !texte.trim()) return;
  fermerVisionneuse();
  feuillePartage({ids, texte});
}
function validerPartage() {
  const p = ST.partage;
  if (!p) return;
  const dans = val("pa-dans");
  if (p.ids.length) {
    for (const id of p.ids) if (D.fichiers[id]) D.fichiers[id] = Object.assign({}, D.fichiers[id], {parent: dans}, tampon());
    fermerFeuille();
    ST.partage = null;
    sauver({text: (p.ids.length > 1 ? p.ids.length + " fichiers rangés" : "Rangé") + " dans " + (dans ? pathLabel(dans) : "Non rangés"), action: dans ? {label: "Voir", fn: () => go("n:" + dans)} : null});
    return;
  }
  if (!dans || dans === "root") { erreurFeuille("Choisis un dossier.", "pa-dans"); return; }
  const now = maintenantIso(), id = newId("n");
  D.nodes[id] = Object.assign(blankNode(now), {parent: dans, type: "note", titre: val("pa-titre").trim() || "Note", texte: p.texte, majPar: "nathan"});
  fermerFeuille();
  ST.partage = null;
  sauver({text: "Note créée dans " + pathLabel(dans), action: {label: "Voir", fn: () => go("n:" + id)}});
}
function partageVersDemande() {
  const p = ST.partage;
  if (!p) return;
  ST.draftFichiers = ST.draftFichiers.concat(p.ids.filter(id => !ST.draftFichiers.includes(id)));
  if (p.texte) ST.draftR = (ST.draftR ? ST.draftR + "\n" : "") + p.texte;
  fermerFeuille();
  ST.partage = null;
  allerOnglet("claude");
}
function recevoirFichiers(d) {
  const liste = Array.isArray(d.fichiers) ? d.fichiers : [], errs = Array.isArray(d.erreurs) ? d.erreurs : [];
  ST.natif = null;
  if (!liste.length) { if (errs.length) toast(str(errs[0])); return; }
  const ctx = d.ctx || "noeud";
  let parent = "";
  if (ctx === "noeud") parent = S.N.has(str(d.cible)) ? str(d.cible) : "";
  else if (ctx === "remarque") parent = ST.draftCible && S.N.has(ST.draftCible) ? ST.draftCible : "";
  const ids = ajouterFichiers(liste, parent);
  if (ctx === "remarque") ST.draftFichiers.push(...ids);
  const ou = ctx === "remarque" ? "à ta demande" : "dans " + (parent ? pathLabel(parent) : "Non rangés");
  const msg = (ids.length > 1 ? ids.length + " fichiers ajoutés " : "Ajouté ") + ou + (errs.length ? " · " + plural(errs.length, "refusé") : "");
  sauver({text: msg, action: ids.length === 1 && ctx !== "remarque" ? {label: "Voir", fn: () => ouvrirVisionneuse(ids[0])} : null});
}

/* ---------- évènements envoyés par Android ---------- */
window.Native = {
  recevoir(type, json) {
    let d = {};
    try { d = JSON.parse(json || "{}") || {}; } catch (e) { d = {}; }
    try {
      if (type === "fichiers") recevoirFichiers(d);
      else if (type === "partage") recevoirPartage(d);
      else if (type === "sauvegarde") {
        if (d.ok) { D.config.derniereSauvegarde = maintenantIso(); sauver("Sauvegarde enregistrée" + (d.fichiers ? " avec " + plural(d.fichiers, "fichier") : "")); }
        else toast(str(d.message) || "La sauvegarde a échoué.");
      } else if (type === "restauration") {
        if (d.ok) { charger(); ST.pile = []; ST.route = "accueil"; ST.tab = "accueil"; render(); programmerRappels(); toast("Sauvegarde restaurée"); }
        else toast(str(d.message) || "La restauration a échoué.");
      } else if (type === "presse-papiers") {
        const texte = str(d.texte);
        let p = null;
        try { p = analyserCode(texte); } catch (e) { p = null; }
        // Seulement une réponse de Claude : le texte envoyé par l'appli elle-même contient aussi le mot « tableau-changes ».
        if (p && p.kind === "changes") { ST.draftImp = texte; toast("La réponse de Claude est dans le presse-papiers", {label: "Voir", fn: () => { allerOnglet("claude"); feuilleApercu(p); }}); }
      } else if (type === "notif") {
        if (d.etat === "oui" && ST.testApresPermission) { const op = ST.testApresPermission; ST.testApresPermission = null; natif("testerRappel", JSON.stringify({mode: op.mode, duree: op.duree})); toast("Essai dans 5 secondes : " + resumeOptsRappel(op).toLowerCase()); }
        else if (d.etat === "oui") toast("Notifications autorisées");
        else if (d.etat === "bloque") toast("Notifications refusées : les rappels ne sonneront pas.");
        if (ST.route === "reglages") render();
        programmerRappels();
      } else if (type === "maj") recevoirMaj(d);
      else if (type === "maj-progres") progresMaj(d);
      else if (type === "maj-pret") majTelechargee(d);
      else if (type === "aller") {
        const id = str(d.id);
        if (S.N.has(id)) { fermerFeuille(); fermerVisionneuse(); go("n:" + id); }
      }
    } catch (e) { noterErreur("évènement " + type + " : " + (e && e.message)); }
  }
};

/* ---------- gestes et clics ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-go],[data-act],[data-occ],[data-voir],[data-tab],[data-tab-go]");
  if (!t) return;
  if (t.dataset.tab) { e.preventDefault(); fermerFeuille(); fermerVisionneuse(); allerOnglet(t.dataset.tab, true); return; }
  if (t.dataset.tabGo) { e.preventDefault(); fermerFeuille(); allerOnglet(t.dataset.tabGo); return; }
  if (t.hasAttribute("data-go")) {
    e.preventDefault();
    if (!$("#sheet").hidden) fermerFeuille();
    if (!$("#viewer").hidden) fermerVisionneuse();
    go(t.getAttribute("data-go"));
    return;
  }
  if (t.dataset.occ) {
    const [id, date] = t.dataset.occ.split("@");
    const n = S.N.get(id);
    go("n:" + id + (n && n.repete && date ? "@" + date : ""));
    return;
  }
  if (t.dataset.voir) { ouvrirVisionneuse(t.dataset.voir); return; }
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case "retour": retour(); break;
    case "fab": fab(); break;
    case "fermer": fermerFeuille(); break;
    case "ajout": choisirAjout(t.dataset.quoi); break;
    case "ajout-ici": feuilleAjout(id); break;
    case "ajout-section": ouvrirEditeur({type: "dossier", parent: "root"}); break;
    case "nouvel-evenement": nouvelEvenement(t.dataset.date, t.dataset.heure); break;
    case "modifier": ouvrirEditeur({id, occDate: t.dataset.date || ""}); break;
    case "toggle": toggleTache(id, t); break;
    case "epingler": epingler(id); break;
    case "md-case": cocherCase(id, Number(t.dataset.ligne)); break;
    case "choisir": { const ctx = t.dataset.ctx || "noeud"; choisirFichiers(t.dataset.mode, ctx === "remarque" ? "" : id, ctx); break; }
    case "sauf-jour": armOr(t, () => supprimerOccurrence(id, t.dataset.date)); break;
    case "demander": demanderClaude(id); break;
    case "itineraire": if (A) natif("ouvrirLien", "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(t.dataset.lieu || "")); else seulementAndroid(); break;
    case "eval-ajout": feuilleEval(id); break;
    case "eval": feuilleEval(id, t.dataset.eval); break;
    case "eval-suppr": armOr(t, () => enregistrerEval(true)); break;
    case "semaine": if (t.classList.contains("mo-alt")) marquerVu("mois-bande"); feuilleSemaine(t.dataset.lundi); break;
    case "nouveautes-ok": D.config.nouveautesVues = VERSION_NOUVEAUTES; sauver(); break;
    case "nouveautes-voir": D.config.nouveautesVues = VERSION_NOUVEAUTES; ecrire(); go("aide"); break;
    case "nouveautes-revoir": feuilleNouveautes(); break;
    case "astuces-revoir": D.config.vu = {}; sauver("Les astuces s’afficheront de nouveau"); break;
    case "astuce-ok": {
      marquerVu(t.dataset.cle);
      const a = t.closest(".astuce");
      if (a) { a.classList.add("vue"); setTimeout(() => a.remove(), 220); }
      break;
    }
    case "ffiltre": {
      // Retoucher le filtre actif l'enlève.
      ST.ffiltre = ST.ffiltre === t.dataset.v ? "tout" : t.dataset.v;
      $$('[data-act="ffiltre"]').forEach(c => c.setAttribute("aria-pressed", String(c.dataset.v === ST.ffiltre)));
      const fb = $("#f-body");
      if (fb) fb.innerHTML = corpsFichiers();
      break;
    }
    case "pl-filtre": {
      // Retoucher le filtre actif l'enlève.
      PL.filtre = PL.filtre === id ? "" : id;
      vibrer();
      $$('[data-act="pl-filtre"]').forEach(c => c.setAttribute("aria-pressed", String(c.dataset.id === PL.filtre)));
      majCorpsPlanning();
      entree($("#pl-body"), 0);
      break;
    }
    case "pl-auj": plAujourdhui(); break;
    case "pl-prec": plDeplacer(-1); break;
    case "pl-suiv": plDeplacer(1); break;
    case "pl-vue": plVue(t.dataset.v); break;
    case "pl-jour": PL.jour = t.dataset.date; majCorpsPlanning(); break;
    case "aller-jour": PL.jour = t.dataset.date; PL.vue = "jour"; PL.defiler = true; allerOnglet("planning"); break;
    case "trajet": feuilleTrajet(t.dataset.date); break;
    case "prop-revision": feuilleRevision(id); break;
    case "prop-examen": feuillePlanExamen(id); break;
    case "prop-autre": autreMoment(id); break;
    case "prop-jamais": marquerProposition(id, "non"); fermerFeuille(); sauver("D’accord, plus de proposition pour celui-ci"); break;
    case "prop-ignorer": {
      marquerProposition(id, "non");
      const n = S.N.get(id);
      sauver({text: "Masqué", action: {label: "Annuler", fn: () => { delete D.config.propositions[id]; sauver(); }}});
      if (n) vibrer();
      break;
    }
    case "maj-verifier": verifierMaj(true); break;
    case "maj-telecharger": telechargerMaj(); break;
    case "maj-installer": installerMaj(); break;
    case "maj-plus-tard": plusTardMaj(); break;
    case "maj-autoriser": autoriserMaj(); break;
    case "voir-nouveau": ST.toutNouveau = !ST.toutNouveau; { const hb = $("#home-body"); if (hb) hb.innerHTML = corpsAccueil(); } break;
    case "pl-ouvrir-jour": PL.jour = t.dataset.date; if (PL.vue === "jour") render(); else plVue("jour"); break;
    case "pl-creneau": if (e.target === t) { marquerVu("grille-creneau"); plCreneau(t, e.clientY); } break;
    case "vw-fermer": fermerVisionneuse(); break;
    case "vw-zoom": zoomVisionneuse(); break;
    case "f-claude": envoyerFichierClaude(id); break;
    case "ouvrir-avec": ouvrirAvec(id); break;
    case "f-ranger": feuilleFichier(id); break;
    case "f-corbeille": fichierCorbeille(id); break;
    case "joindre-tableau": feuilleChoixFichiers(); break;
    case "choix-f": {
      const i = ST.choixFichiers.indexOf(id);
      if (i >= 0) ST.choixFichiers.splice(i, 1); else ST.choixFichiers.push(id);
      t.classList.toggle("sel", i < 0);
      t.setAttribute("aria-pressed", String(i < 0));
      const ok = $("#choix-ok");
      if (ok) ok.textContent = "Joindre (" + ST.choixFichiers.length + ")";
      break;
    }
    case "choix-ok": ST.draftFichiers = ST.choixFichiers.slice(); fermerFeuille(); render(); break;
    case "draft-retirer": ST.draftFichiers = ST.draftFichiers.filter(x => x !== id); render(); break;
    case "rem-del": armOr(t, () => delRemarque(id)); break;
    case "envoyer-claude": envoyerClaude(); break;
    case "copier-export": copierExport(); break;
    case "coller-code": collerCode(); break;
    case "verifier-code": verifierCode(); break;
    case "appliquer-code": appliquerCode(); break;
    case "plantage-envoyer": envoyerPlantage(); break;
    case "plantage-effacer": natif("effacerPlantage"); render(); break;
    case "notif-autoriser": natif("demanderNotifications"); break;
    case "notif-reglages": natif("reglagesNotifications"); break;
    case "notif-test": testerRappel(lireOptsChamps("p")); break;
    case "essai-rappel": testerRappel(lireOptsChamps("e")); break;
    case "sauvegarder": sauvegarder(); break;
    case "restaurer": if (!A) seulementAndroid(); else armOr(t, () => natif("restaurer")); break;
    case "semaines-effacer": armOr(t, () => { D.semaines = {}; sauver("Rythme effacé"); }); break;
    case "restore": restaurerNoeud(id); break;
    case "purge": armOr(t, () => purgerNoeud(id)); break;
    case "f-restore": restaurerFichier(id); break;
    case "f-purge": armOr(t, () => purgerFichier(id)); break;
    case "vider-corbeille": armOr(t, viderCorbeille); break;
    case "corbeille-noeud": corbeilleNoeud(id); break;
    case "partage-demande": partageVersDemande(); break;
  }
});
document.addEventListener("dblclick", e => {
  if (e.target.closest(".vw-img,.vw-page")) zoomVisionneuse(e.clientX, e.clientY);
});
document.addEventListener("input", e => {
  const id = e.target.id;
  if (id === "q") { ST.q = e.target.value; const hb = $("#home-body"); if (hb) hb.innerHTML = corpsAccueil(); }
  else if (id === "fq") { ST.fq = e.target.value; const fb = $("#f-body"); if (fb) fb.innerHTML = corpsFichiers(); }
  else if (id === "rem-texte") ST.draftR = e.target.value;
  else if (id === "imp-texte") ST.draftImp = e.target.value;
});
document.addEventListener("change", e => {
  const el = e.target, id = el.id;
  if (id === "rem-cible") ST.draftCible = el.value;
  else if (id === "e-journee") { remplirRappels(); majEditeur(); }
  else if (id === "e-repete" || id === "e-rappel" || id === "e-rfois" || el.name === "e-rmode") majEditeur();
  else if (id === "p-rduree" || id === "p-rfois" || id === "p-recart" || el.name === "p-rmode") enregistrerRappelDefaut();
  else if (/^e-j[1-7]$/.test(id) && ST.edit) ST.edit.joursTouches = true;
  else if (id === "e-date" && ST.edit && !ST.edit.joursTouches && DATE_RE.test(el.value) && $("#e-j1")) {
    const j = isoDow(el.value);
    for (let k = 1; k <= 7; k++) { const c = $("#e-j" + k); if (c) c.checked = k === j; }
  }
  else if (el.name === "e-portee") {
    const d = $("#e-date");
    if (d) d.value = el.value === "jour" ? (d.dataset.jour || d.value) : (d.dataset.serie || d.value);
    majEditeur();
  }
  else if (id === "e-type" && ST.edit && ST.edit.id) {
    const reprise = {titre: val("e-titre"), texte: val("e-texte")};
    if ($("#e-date")) reprise.date = val("e-date");
    ouvrirEditeur({id: ST.edit.id, type: el.value, reprise, occDate: ST.edit.occDate});
  } else if (id === "r-prenom") { D.config.prenom = el.value.trim(); sauver("Prénom enregistré"); }
  else if (id === "r-debut") { D.config.debutJour = Number(el.value) || 7; sauver("Enregistré"); }
  else if (id === "r-weekend") { D.config.weekend = el.value; sauver("Enregistré"); }
  else if (id === "r-rappels") { D.config.rappels = el.checked; sauver(el.checked ? "Rappels activés" : "Rappels désactivés"); }
  else if (el.name === "prop-duree") majCreneaux(Number(el.value) || 45);
  else if (el.name === "pe-duree") majPlan(Number(el.value) || 60);
  else if (el.name === "r-main") { D.config.main = el.value === "droite" ? "droite" : "gauche"; appliquerMain(); sauver(el.value === "droite" ? "Boutons côté main droite" : "Boutons côté main gauche"); }
  else if (id === "r-maj-auto") { const c = reglagesMaj(); c.auto = el.checked; enregistrerMaj(c); toast(el.checked ? "Vérification automatique activée" : "Plus de vérification automatique"); }
  else if (id === "r-proposer") { D.config.proposer = el.checked; sauver(el.checked ? "Propositions activées" : "Plus de propositions"); }
  else if (id.startsWith("r-traj-")) {
    const tr = reglagesTrajets();
    if (id === "r-traj-actif") tr.actif = el.checked;
    else if (id === "r-traj-rappel") tr.rappel = el.checked;
    else if (id === "r-traj-aller") tr.aller = Number(el.value) || TRAJETS_DEFAUT.aller;
    else if (id === "r-traj-retour") tr.retour = Number(el.value) || TRAJETS_DEFAUT.retour;
    else if (id === "r-traj-ville") tr.ville = el.value;
    else if (id === "r-traj-domicile") tr.domicile = el.value;
    else if (id === "r-traj-desc") tr.description = el.value;
    else if (id === "r-traj-lieux") tr.lieux = el.value.split(/[,;]/);
    D.config.trajets = reglagesTrajetsDe(tr);
    sauver("Trajets enregistrés");
  }
});
document.addEventListener("submit", e => {
  const id = e.target.id;
  e.preventDefault();
  if (id === "f-edit") enregistrerEditeur();
  else if (id === "f-eval") enregistrerEval(false);
  else if (id === "f-semaine") enregistrerSemaine();
  else if (id === "f-fichier") enregistrerFichier();
  else if (id === "f-partage") validerPartage();
  else if (id === "rem-form") ajouterRemarque();
  else if (id === "imp-form") verifierCode();
  else if (id === "f-rythme") remplirRythme();
  else if (id === "f-revision") enregistrerRevision();
  else if (id === "f-plan") enregistrerPlan();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { if (!$("#sheet").hidden) fermerFeuille(); else if (!$("#viewer").hidden) fermerVisionneuse(); }
  if (e.key === "Enter" && (e.target.id === "q" || e.target.id === "fq")) e.target.blur();
});
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") fermerFeuille(); });
// Seulement le champ de recherche (un bouton qui prend le focus ne doit rien déplacer sous le doigt).
const champDock = el => !!(el && el.matches && el.matches(".dock input"));
document.addEventListener("focusin", e => { if (champDock(e.target)) document.documentElement.classList.add("saisie"); });
document.addEventListener("focusout", e => { if (champDock(e.target)) setTimeout(() => { if (!champDock(document.activeElement)) document.documentElement.classList.remove("saisie"); }, 60); });

/* ---------- gestes : glisser entre onglets, revenir, changer de période ----------
   Sur la barre des onglets, glisser change toujours d'onglet (même dans le planning, où glisser sur la grille change de période). */
let geste = null, gesteImage = 0;
function modeGeste(cible) {
  if (!$("#sheet").hidden || !$("#viewer").hidden) return null;
  if (cible.closest(".tabbar")) return "barre";
  if (cible.closest(".fstrip,.chips.scroll,input,textarea,select,.dock,.astuce,.wk7")) return null;
  if (ST.route === "planning") return cible.closest("#pl-body") && PL.vue !== "liste" ? "periode" : "onglet";
  if (ONGLETS.includes(ST.route)) return "onglet";
  return "retour";
}
/** Onglet affiché, ou celui d'où l'on vient quand on est dans un dossier, un élément ou les paramètres. */
const ongletCourant = () => ONGLETS.indexOf(ONGLETS.includes(ST.route) ? ST.route : ST.tab);
/** La pastille des onglets suit le doigt pendant le glissement. */
function pastilleSuit(g) {
  const p = $(".tab-pill");
  if (!p) return;
  const W = window.innerWidth || 400, pos = Math.max(0, Math.min(ONGLETS.length - 1, ongletCourant() - g.d / W));
  p.style.transition = "none";
  p.style.transform = `translateX(${pos * 100}%)`;
}
function pastilleLache() {
  const p = $(".tab-pill");
  if (p) p.style.transition = "";
  majChrome();
}
// Après un appui long dans le planning ou un glissement sur la barre : pas de clic parasite.
document.addEventListener("click", e => {
  if (ST.sansClicJusqua && Date.now() < ST.sansClicJusqua) { e.preventDefault(); e.stopPropagation(); }
}, true);
function lacher(el) {
  if (!el) return;
  el.style.transform = "";
  el.style.opacity = "";
  el.style.willChange = "";
}
/** Le doigt n'est pas allé assez loin : le contenu revient en place. */
function revenir(el, d, op) {
  lacher(el);
  if (!el || !d || mouvementReduit() || typeof el.animate !== "function") return;
  try { el.animate([{transform: `translate3d(${d}px,0,0)`, opacity: op}, {transform: "translate3d(0,0,0)", opacity: 1}], {duration: 200, easing: EASE}); } catch (e) { /* rien */ }
}
document.addEventListener("touchstart", e => {
  geste = null;
  if (e.touches.length !== 1) return;
  const mode = modeGeste(e.target);
  if (!mode) return;
  const p = e.touches[0];
  geste = {mode, x: p.clientX, y: p.clientY, t: Date.now(), dx: 0, d: 0, op: 1, verrou: false, el: mode === "periode" ? $("#pl-body") : view};
}, {passive: true});
document.addEventListener("touchmove", e => {
  if (!geste || e.touches.length !== 1) return;
  const p = e.touches[0], dx = p.clientX - geste.x, dy = p.clientY - geste.y;
  if (!geste.verrou) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      geste.verrou = true;
      if (animVue) { try { animVue.cancel(); } catch (x) { /* rien */ } animVue = null; }
      if (geste.el) geste.el.style.willChange = "transform";
    } else if (Math.abs(dy) > 12) { geste = null; return; }
    else return;
  }
  geste.dx = dx;
  let d = dx;
  if (geste.mode === "retour" && d < 0) d *= 0.2;
  if (geste.mode === "onglet" || geste.mode === "barre") {
    const i = ongletCourant();
    if ((i <= 0 && d > 0) || (i >= ONGLETS.length - 1 && d < 0)) d *= 0.25;
  }
  geste.d = d;
  geste.op = Math.max(0.45, 1 - Math.abs(d) / ((window.innerWidth || 400) * 1.4));
  if (!gesteImage) gesteImage = requestAnimationFrame(() => {
    gesteImage = 0;
    const g = geste;
    if (!g || !g.el) return;
    g.el.style.transform = `translate3d(${g.d}px,0,0)`;
    g.el.style.opacity = String(g.op);
    if (g.mode === "onglet" || g.mode === "barre") pastilleSuit(g);
  });
}, {passive: true});
document.addEventListener("touchend", () => {
  const g = geste;
  geste = null;
  if (gesteImage) { cancelAnimationFrame(gesteImage); gesteImage = 0; }
  if (!g || !g.verrou) return;
  if (g.mode === "barre") ST.sansClicJusqua = Date.now() + 400;
  const W = window.innerWidth || 400, dt = Math.max(1, Date.now() - g.t), v = Math.abs(g.dx) / dt;
  const assez = Math.abs(g.dx) > W * (g.mode === "barre" ? 0.18 : 0.24) || (Math.abs(g.dx) > 40 && v > 0.45);
  const dir = g.dx < 0 ? 1 : -1;
  if (g.mode === "onglet" || g.mode === "barre") pastilleLache();
  if (!assez) { revenir(g.el, g.d, g.op); return; }
  if (g.mode === "periode") { vibrer(); lacher(g.el); plDeplacer(dir, 0.3); return; }
  if (g.mode === "retour") {
    if (dir !== -1) { revenir(g.el, g.d, g.op); return; }
    vibrer();
    lacher(g.el);
    ST.glisse = true;
    try { retour(); } finally { ST.glisse = false; }
    animVue = entree(view, -1, 0.3);
    return;
  }
  const j = ongletCourant() + dir;
  if (j < 0 || j >= ONGLETS.length) { revenir(g.el, g.d, g.op); return; }
  vibrer();
  marquerVu("glisser");
  lacher(g.el);
  ST.glisse = true;
  try { allerOnglet(ONGLETS[j]); } finally { ST.glisse = false; }
  animVue = entree(view, dir, 0.3);
}, {passive: true});
document.addEventListener("touchcancel", () => {
  const g = geste;
  geste = null;
  if (!g) return;
  if (g.el) revenir(g.el, g.d, g.op);
  if (g.mode === "onglet" || g.mode === "barre") pastilleLache();
}, {passive: true});

/* ---------- choix qu'on peut retirer en les retouchant ---------- */
document.addEventListener("pointerdown", e => {
  const lab = e.target.closest("[data-deselect] label");
  const r = lab && lab.querySelector('input[type="radio"]');
  if (r) r.dataset.etait = r.checked ? "1" : "";
}, true);
document.addEventListener("click", e => {
  const r = e.target.closest('[data-deselect] input[type="radio"]');
  if (!r || r.dataset.etait !== "1") return;
  r.dataset.etait = "";
  r.checked = false;
  const vide = $$(`input[type="radio"][name="${r.name}"]`).find(x => x.value === "");
  if (vide) vide.checked = true;
  r.dispatchEvent(new Event("change", {bubbles: true}));
}, true);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (ST.route === "accueil" || ST.route === "planning") render();
  reprendreMaj();
  verifierMajAuto();
});

/* ---------- démarrage ---------- */
function init() {
  $$("[data-icon]").forEach(el => { el.innerHTML = ICON[el.dataset.icon] || ""; });
  $("#fab").innerHTML = ICON.plus;
  charger();
  appliquerMain();
  let pack = null;
  try { pack = appliquerPacks(); if (pack.ids.length) reindexer(); } catch (e) { noterErreur("ajouts : " + (e && e.message)); }
  render();
  natif("pret");
  programmerRappels();
  setTimeout(verifierMajAuto, 2500);
  if (pack && pack.ajouts) {
    const avant = pack.avant, ids = pack.ids;
    const msg = pack.ajouts >= 4 ? "Claude a ajouté " + plural(pack.ajouts, "élément") : "Claude a ajouté : " + pack.titres.join(", ");
    setTimeout(() => toast(msg, {label: "Annuler", fn: () => {
      D = JSON.parse(avant);
      if (!D.config.packs || typeof D.config.packs !== "object") D.config.packs = {};
      for (const id of ids) D.config.packs[id] = "annule";
      sauver("Ajouts retirés");
    }}), 400);
  }
}
init();
