"use strict";
/* Fenêtres qui montent du bas (ajout, éditeurs, choix) et visionneuse de fichiers. */

let feuilleTimer = null, vwTimer = null;
function deverrouiller() {
  if ($("#sheet").hidden && $("#viewer").hidden) document.documentElement.classList.remove("locked");
}
function ouvrirFeuille(html, nom, focus) {
  clearTimeout(feuilleTimer);
  const w = $("#sheet"), s = $("#sheet-in");
  w.classList.remove("ferme");
  s.innerHTML = html;
  w.hidden = false;
  document.documentElement.classList.add("locked");
  s.scrollTop = 0;
  ST.feuille = nom || "feuille";
  if (focus) setTimeout(() => { const el = $(focus); if (el) { try { el.focus(); } catch (e) { /* rien */ } } }, 260);
}
/** Ferme la feuille en la faisant redescendre. */
function fermerFeuille() {
  const w = $("#sheet");
  ST.feuille = null;
  ST.edit = null;
  if (w.hidden || w.classList.contains("ferme")) return;
  const fin = () => { w.hidden = true; w.classList.remove("ferme"); $("#sheet-in").innerHTML = ""; deverrouiller(); };
  if (mouvementReduit()) { fin(); return; }
  w.classList.add("ferme");
  clearTimeout(feuilleTimer);
  feuilleTimer = setTimeout(fin, 190);
}
const tete = titre => `<div class="sheet-head"><span class="grip" aria-hidden="true"></span><h2 class="sheet-title">${esc(titre)}</h2><button type="button" class="icon-btn sheet-x" data-act="fermer" aria-label="Fermer">${ICON.x}</button></div>`;
/** Boutons du bas de la feuille (zone du pouce) : action principale + annuler. */
const pied = (ok, annuler = "Annuler", type = "submit", act = "") => `<div class="sheet-actions">${ok ? `<button type="${type}" class="btn primary"${act ? ` data-act="${act}"` : ""}>${esc(ok)}</button>` : ""}<button type="button" class="btn" data-act="fermer">${esc(annuler)}</button></div>`;
const formFeuille = (id, titre, corps, ok, annuler) => `<form id="${id}" novalidate>${tete(titre)}<div class="sheet-body">${corps}</div>${pied(ok, annuler)}</form>`;
const val = id => { const el = document.getElementById(id); return el ? String(el.value) : ""; };
const coche = id => { const el = document.getElementById(id); return !!(el && el.checked); };
const radio = name => { const r = document.querySelector(`input[name="${name}"]:checked`); return r ? r.value : ""; };
function erreurFeuille(msg, focusId) {
  const e = $("#sheet-err");
  if (e) { e.textContent = msg; e.hidden = false; }
  if (focusId) { const el = document.getElementById(focusId); if (el) { try { el.focus(); } catch (x) { /* rien */ } } }
}
function optionsDossiers(selection, o = {}) {
  const excl = o.excl || new Set();
  let h = o.racine ? `<option value="root"${selection === "root" ? " selected" : ""}>Tout en haut (nouvelle section)</option>` : "";
  if (o.nonRange) h += `<option value=""${selection === "" ? " selected" : ""}>Non rangé</option>`;
  const liste = o.tout
    ? [...S.vis].filter(id => !excl.has(id)).map(id => ({id, label: pathLabel(id) + (S.N.get(id).type !== "dossier" ? " (" + TYPE_LABEL[S.N.get(id).type].toLowerCase() + ")" : "")})).sort((a, b) => a.label.localeCompare(b.label, "fr", {sensitivity: "base"}))
    : dossiersVisibles(excl);
  return h + liste.map(f => `<option value="${esc(f.id)}"${f.id === selection ? " selected" : ""}>${esc(f.label)}</option>`).join("");
}
const premierDossier = () => { const t = visKids("root").find(n => n.type === "dossier"); return t ? t.id : "root"; };
function dossierCourant() {
  const r = ST.route;
  if (r.startsWith("n:")) {
    const n = S.N.get(r.slice(2).split("@")[0]);
    if (n && S.vis.has(n.id)) return n.type === "dossier" ? n.id : parentOf(n);
  }
  return ST.dernierDossier && S.vis.has(ST.dernierDossier) ? ST.dernierDossier : premierDossier();
}
/** Agenda proposé pour un nouvel événement : le dernier utilisé, sinon Planning › École. */
function dossierEvenements() {
  const da = str(D.config.dernierAgenda);
  if (da && S.vis.has(da) && S.N.get(da).type === "dossier") return da;
  const pl = visKids("root").find(n => n.type === "dossier" && norm(n.titre) === "planning");
  if (pl) {
    const subs = visKids(pl.id).filter(k => k.type === "dossier");
    const ecole = subs.find(k => norm(k.titre) === "ecole");
    return (ecole || subs[0] || pl).id;
  }
  return dossierCourant();
}
const prochaineHeure = () => fromMin(Math.min(22 * 60, (Math.floor(nowMin() / 60) + 1) * 60));

/* ---------- ajouter ---------- */
function feuilleAjout(cible) {
  const dans = cible && S.N.has(cible) ? cible : dossierCourant();
  const tuiles = [["evenement", ICON.evenement, "Événement"], ["tache", ICON.tache, "Tâche"], ["note", ICON.note, "Note"], ["photo", ICON.photo, "Photo"], ["galerie", ICON.galerie, "Image"], ["fichiers", ICON.fichier, "PDF ou fichier"]];
  ouvrirFeuille(`${tete("Ajouter")}<div class="sheet-body">
    <div class="field"><label for="a-dans">Dans</label><select id="a-dans">${optionsDossiers(dans)}</select></div>
    <div class="add-grid">${tuiles.map(([q, ic, l]) => `<button class="add-tile" type="button" data-act="ajout" data-quoi="${q}">${ic}<span>${l}</span></button>`).join("")}</div>
    <div><button class="btn ghost" type="button" data-act="ajout" data-quoi="dossier">${ICON.dossier}<span>Nouveau dossier ici</span></button></div></div>${pied("", "Annuler")}`, "ajout");
}
function choisirAjout(quoi) {
  const dans = val("a-dans") || dossierCourant();
  if (quoi === "photo" || quoi === "galerie" || quoi === "fichiers") { fermerFeuille(); choisirFichiers(quoi, dans, "noeud"); return; }
  if (quoi === "evenement") { ouvrirEditeur({type: "evenement", parent: dans, date: ST.route === "planning" ? PL.jour : today(), heure: prochaineHeure()}); return; }
  ouvrirEditeur({type: quoi, parent: dans});
}
function choisirFichiers(mode, cible, ctx) {
  if (!A) { toast("L’ajout de fichiers se fait dans l’appli Android."); return; }
  ST.natif = {mode, cible, ctx};
  natif("choisir", mode, cible || "", ctx || "noeud");
}
function nouvelEvenement(date, heure, fin) {
  const d = date || (ST.route === "planning" ? PL.jour : today());
  const o = {type: "evenement", parent: dossierEvenements(), date: d, heure: heure || (d === today() ? prochaineHeure() : "09:00")};
  if (fin && HEURE_RE.test(fin) && fin > o.heure) o.fin = fin;
  ouvrirEditeur(o);
}

/* ---------- éditeur d'élément ---------- */
const REP_OPTIONS = [["", "Ne se répète pas"], ["jour", "Tous les jours"], ["ouvres", "Du lundi au vendredi"], ["semaine", "Chaque semaine"], ["2semaines", "Une semaine sur deux"], ["mois", "Chaque mois"]];
const RAPPELS_HEURE = [["", "Aucun"], ["0", "À l’heure"], ["10", "10 min avant"], ["15", "15 min avant"], ["30", "30 min avant"], ["60", "1 h avant"], ["120", "2 h avant"], ["1440", "La veille"]];
const RAPPELS_JOUR = [["", "Aucun"], ["0", "Le jour même à 8 h"], ["1440", "La veille à 8 h"]];
function codeRepetition(r) {
  if (!r) return "";
  if (r.freq === "jour") return "jour";
  if (r.freq === "mois") return "mois";
  if (r.jours.join() === "1,2,3,4,5" && r.intervalle === 1) return "ouvres";
  return r.intervalle === 2 ? "2semaines" : "semaine";
}
/** opts : {id} pour modifier, ou {type, parent, date, heure} pour créer ; {occDate} si ouvert depuis une occurrence. */
function ouvrirEditeur(opts) {
  const ex = opts.id ? S.N.get(opts.id) : null;
  if (opts.id && !ex) return;
  const type = opts.type || (ex ? ex.type : "note");
  const v = ex ? Object.assign({}, ex, opts.reprise || {}, {type}) : Object.assign({titre: "", texte: "", info: "", date: "", heure: "", fin: "", dateFin: "", lieu: "", statut: "a-faire", couleur: "", rappel: null, repete: null, epingle: false, parent: "root"}, opts);
  if (!ex && type === "evenement" && v.heure && !v.fin) v.fin = fromMin(Math.min(23 * 60 + 59, toMin(v.heure) + 60));
  if (!ex && type === "evenement" && v.rappel == null && v.heure) v.rappel = 30;
  ST.edit = {id: ex ? ex.id : null, type, occDate: opts.occDate || ""};
  const titreF = ex ? "Modifier" : {evenement: "Nouvel événement", tache: "Nouvelle tâche", note: "Nouvelle note", dossier: "Nouveau dossier"}[type];
  const parent = ex ? parentOf(ex) : (v.parent || "root");
  let b = "";
  if (ex && ex.repete && opts.occDate && type === "evenement") {
    b += `<fieldset class="field"><legend class="lbl">Modifier</legend><div class="seg seg2"><label><input type="radio" name="e-portee" value="serie" id="e-portee-s" checked><span>Toute la série</span></label><label><input type="radio" name="e-portee" value="jour" id="e-portee-j"><span>Le ${esc(F_DM.format(pd(opts.occDate)))} seulement</span></label></div></fieldset>`;
  }
  b += `<div class="field"><label for="e-titre">${type === "dossier" ? "Nom du dossier" : "Titre"}</label><input type="text" id="e-titre" value="${esc(v.titre)}" maxlength="160" autocomplete="off" enterkeyhint="done"${type === "evenement" ? ' placeholder="Ex. : Cours de thermique"' : ""}><p class="err" id="sheet-err" hidden></p></div>`;
  if (type === "evenement") {
    const journee = ex ? !ex.heure : !v.heure;
    const rep = codeRepetition(v.repete);
    const joursRep = v.repete && v.repete.jours.length ? v.repete.jours : [isoDow(v.date || today())];
    b += `<label class="switch" for="e-journee"><span>Toute la journée</span><input type="checkbox" id="e-journee"${journee ? " checked" : ""}></label>
      <div class="row2"><div class="field"><label for="e-date">Date</label><input type="date" id="e-date" value="${esc(v.date || today())}" data-serie="${esc(v.date || "")}" data-jour="${esc(opts.occDate || "")}"></div>
      <div class="field" data-si="journee"><label for="e-datefin">Jusqu’au (plusieurs jours)</label><input type="date" id="e-datefin" value="${esc(v.dateFin)}"></div></div>
      <div class="row2" data-si="horaire"><div class="field"><label for="e-heure">Début</label><input type="time" id="e-heure" value="${esc(v.heure)}"></div><div class="field"><label for="e-fin">Fin</label><input type="time" id="e-fin" value="${esc(v.fin)}"></div></div>
      <div class="field" data-si="rep-choix"><label for="e-repete">Répétition</label><select id="e-repete">${REP_OPTIONS.map(([k, l]) => `<option value="${k}"${k === rep ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="sub-fields" data-si="rep">
        <fieldset class="field" data-si="rep-jours"><legend class="lbl">Les jours</legend><div class="days">${JOURS_LETTRE.map((x, i) => `<label><input type="checkbox" id="e-j${i + 1}" value="${i + 1}"${joursRep.includes(i + 1) ? " checked" : ""}><span>${x}</span></label>`).join("")}</div></fieldset>
        <div class="row2"><div class="field"><label for="e-semaines">Seulement les semaines</label><select id="e-semaines"><option value="">Toutes</option><option value="ecole"${v.repete && v.repete.semaines === "ecole" ? " selected" : ""}>d’école</option><option value="entreprise"${v.repete && v.repete.semaines === "entreprise" ? " selected" : ""}>en entreprise</option></select></div>
        <div class="field"><label for="e-jusqua">Jusqu’au</label><input type="date" id="e-jusqua" value="${esc(v.repete ? v.repete.jusqua : "")}"></div></div>
        ${astuce("semaines-editeur", "Les semaines d’école et d’entreprise se règlent dans le planning ou dans Paramètres. Une semaine sans type compte pour les deux.")}
      </div>
      <div class="field"><label for="e-rappel">Rappel</label><select id="e-rappel"></select></div>
      <div class="sub-fields" data-si="rappel-opts">${champsRappel("e", ex ? optsRappel(v) : rappelDefaut())}<div><button class="btn sm" type="button" data-act="essai-rappel">${ICON.cloche}<span>Essayer ce rappel</span></button></div></div>
      <div class="field"><label for="e-lieu">Lieu</label><input type="text" id="e-lieu" value="${esc(v.lieu)}" maxlength="120" autocomplete="off" placeholder="Ex. : bâtiment 36, salle 2"></div>`;
  }
  if (type === "tache") {
    b += `<div class="row2"><div class="field"><label for="e-date">Échéance</label><input type="date" id="e-date" value="${esc(v.date)}"></div>
      <div class="field"><label for="e-rappel">Rappel</label><select id="e-rappel">${RAPPELS_JOUR.map(([k, l]) => `<option value="${k}"${String(v.rappel == null ? "" : v.rappel) === k ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
      <div class="sub-fields" data-si="rappel-opts">${champsRappel("e", ex ? optsRappel(v) : rappelDefaut())}</div>
      <fieldset class="field"><legend class="lbl">Statut</legend><div class="seg seg3">${[["a-faire", "À faire"], ["en-cours", "En cours"], ["fait", "Fait"]].map(([k, l]) => `<label><input type="radio" name="e-statut" value="${k}" id="e-st-${k}"${(v.statut || "a-faire") === k ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>`;
  }
  if (type === "dossier") {
    const racine = parent === "root";
    b += `<div class="field"><label for="e-info">Infos courtes</label><input type="text" id="e-info" value="${esc(v.info)}" maxlength="80" autocomplete="off" placeholder="Ex. : 3 ECTS · 21 h"><p class="hint">Mets le nombre d’ECTS d’une matière (« 3 ECTS ») pour y suivre tes notes et ta moyenne.</p></div>
      <fieldset class="field"><legend class="lbl">Couleur${racine ? " de la section" : " (sinon celle du dossier parent)"}</legend><div class="wires"${racine ? "" : " data-deselect"}>${racine ? "" : `<label><input type="radio" name="e-couleur" value="" id="e-c-aucune"${!v.couleur ? " checked" : ""}><span class="wire" style="background:none;border-style:dashed;border-color:var(--rule-strong)"></span><span>Héritée</span></label>`}${WIRES.map(w => `<label><input type="radio" name="e-couleur" value="${w}" id="e-c-${w}"${v.couleur === w || (racine && !v.couleur && w === "gris") ? " checked" : ""}><span class="wire c-${w}"></span><span>${WIRE_LABEL[w]}</span></label>`).join("")}</div></fieldset>`;
  }
  const excl = new Set();
  if (ex && type === "dossier") { excl.add(ex.id); collectDesc(ex.id, excl); }
  b += `<div class="field"><label for="e-parent">${type === "evenement" ? "Agenda (dossier)" : "Rangé dans"}</label><select id="e-parent">${optionsDossiers(parent, {racine: type === "dossier", excl})}</select></div>`;
  const lblTexte = {dossier: "Description", note: "Contenu", tache: "Détails", evenement: "Notes"}[type];
  const ph = {dossier: "À quoi sert ce dossier (facultatif)", note: "Notes de cours, idées, liens… « - [ ] » pour une case à cocher.", tache: "Ce qu’il faut faire, consignes… « - [ ] » pour une sous-tâche.", evenement: "Salle, jury, ce qu’il faut préparer…"}[type];
  b += `<div class="field"><label for="e-texte">${lblTexte}</label><textarea id="e-texte" rows="${type === "note" ? 9 : 4}"${type === "note" ? ' class="grand"' : ""} placeholder="${esc(ph)}">${esc(v.texte)}</textarea></div>`;
  if (type !== "dossier") b += `<label class="switch" for="e-epingle"><span>Épingler sur l’accueil</span><input type="checkbox" id="e-epingle"${v.epingle ? " checked" : ""}></label>`;
  if (ex && type !== "dossier") b += `<div class="field"><label for="e-type">Transformer en</label><select id="e-type">${["note", "tache", "evenement"].map(t => `<option value="${t}"${t === type ? " selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}</select></div>`;
  if (ex) b += `<div class="sheet-foot"><button type="button" class="btn danger" data-act="corbeille-noeud" data-id="${esc(ex.id)}">${ICON.corbeille}<span>Mettre à la corbeille</span></button></div>`;
  ouvrirFeuille(formFeuille("f-edit", titreF, b, ex ? "Enregistrer" : "Ajouter"), "editeur", ex ? null : "#e-titre");
  if (type === "evenement") remplirRappels(v.rappel);
  majEditeur();
}
function remplirRappels(courant) {
  const sel = $("#e-rappel");
  if (!sel) return;
  const journee = coche("e-journee");
  const opts = journee ? RAPPELS_JOUR : RAPPELS_HEURE;
  const c = courant === undefined ? sel.value : (courant == null ? "" : String(courant));
  sel.innerHTML = opts.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  sel.value = opts.some(([k]) => k === c) ? c : (journee ? "" : "30");
  if (courant === null) sel.value = "";
}
function majEditeur() {
  if (!ST.edit) return;
  const form = $("#f-edit");
  if (!form) return;
  const ro = form.querySelector('[data-si="rappel-opts"]');
  if (ro) ro.hidden = !$("#e-rappel") || val("e-rappel") === "";
  majChampsRappel(form, "e");
  if (ST.edit.type !== "evenement") return;
  const journee = coche("e-journee"), jourSeul = radio("e-portee") === "jour";
  const rep = jourSeul ? "" : val("e-repete");
  const regles = {journee: !journee || !!rep, horaire: journee, "rep-choix": jourSeul, rep: !rep, "rep-jours": !(rep === "semaine" || rep === "2semaines")};
  $$("#f-edit [data-si]").forEach(el => { if (el.dataset.si in regles) el.hidden = regles[el.dataset.si]; });
}
function lireOptsRappel() {
  if (!document.querySelector('input[name="e-rmode"]')) return {};
  return {rappelMode: radio("e-rmode") || "", rappelDuree: num(val("e-rduree")), rappelFois: num(val("e-rfois")), rappelEcart: num(val("e-recart"))};
}
function lireRepetition(date) {
  const rep = val("e-repete");
  if (!rep) return null;
  const ancien = ST.edit && ST.edit.id && D.nodes[ST.edit.id] && D.nodes[ST.edit.id].repete;
  const r = {freq: "semaine", intervalle: 1, jours: [], jusqua: val("e-jusqua"), sauf: ancien && Array.isArray(ancien.sauf) ? ancien.sauf : [], semaines: val("e-semaines")};
  if (rep === "jour") r.freq = "jour";
  else if (rep === "mois") r.freq = "mois";
  else if (rep === "ouvres") r.jours = [1, 2, 3, 4, 5];
  else {
    r.intervalle = rep === "2semaines" ? 2 : 1;
    r.jours = [1, 2, 3, 4, 5, 6, 7].filter(i => coche("e-j" + i));
    if (!r.jours.length) r.jours = [isoDow(date)];
  }
  return r;
}
function enregistrerEditeur() {
  const ed = ST.edit;
  if (!ed) return;
  const type = ed.type, titre = val("e-titre").trim();
  if (!titre) { erreurFeuille(type === "dossier" ? "Donne un nom au dossier." : "Donne-lui un titre.", "e-titre"); return; }
  const parent = val("e-parent") || "root";
  if (type !== "dossier" && parent === "root") { erreurFeuille("Choisis le dossier où le ranger.", "e-parent"); return; }
  const now = maintenantIso();
  const rec = {parent, type, titre, texte: val("e-texte").replace(/\s+$/, ""), maj: now, majPar: "nathan"};
  if ($("#e-epingle")) rec.epingle = coche("e-epingle");
  if (type === "evenement") {
    const journee = coche("e-journee"), date = val("e-date");
    if (!DATE_RE.test(date)) { erreurFeuille("Choisis une date.", "e-date"); return; }
    const heure = journee ? "" : val("e-heure"), fin = journee ? "" : val("e-fin");
    if (!journee && !heure) { erreurFeuille("Indique l’heure de début, ou coche « Toute la journée ».", "e-heure"); return; }
    if (heure && fin && fin <= heure) { erreurFeuille("L’heure de fin doit être après le début.", "e-fin"); return; }
    const repete = lireRepetition(date);
    const dateFin = journee && !repete ? val("e-datefin") : "";
    if (dateFin && dateFin < date) { erreurFeuille("La date de fin est avant la date de début.", "e-datefin"); return; }
    if (repete && repete.jusqua && repete.jusqua < date) { erreurFeuille("La fin de la répétition est avant la première date.", "e-jusqua"); return; }
    Object.assign(rec, {date, heure, fin, dateFin, lieu: val("e-lieu").trim(), repete, rappel: cleanRappel(val("e-rappel")), statut: ""}, lireOptsRappel());
    D.config.dernierAgenda = parent;
  } else if (type === "tache") {
    Object.assign(rec, {date: val("e-date"), statut: radio("e-statut") || "a-faire", rappel: cleanRappel(val("e-rappel")), heure: "", fin: "", repete: null}, lireOptsRappel());
  } else if (type === "dossier") {
    Object.assign(rec, {info: val("e-info").trim(), couleur: radio("e-couleur")});
    if (parent === "root" && !rec.couleur) rec.couleur = "gris";
  } else {
    Object.assign(rec, {date: "", heure: "", fin: "", repete: null, rappel: null, statut: ""});
  }
  // Une seule occurrence d'une série : exception dans la série + événement isolé.
  if (ed.id && ed.occDate && radio("e-portee") === "jour") {
    const serie = D.nodes[ed.id];
    const r = Object.assign({}, serie.repete || {});
    r.sauf = (Array.isArray(r.sauf) ? r.sauf : []).concat([ed.occDate]);
    D.nodes[ed.id] = Object.assign({}, serie, {repete: r, maj: now, majPar: "nathan"});
    const nid = newId("n");
    D.nodes[nid] = Object.assign(blankNode(now), rec, {repete: null, dateFin: "", cree: now});
    fermerFeuille();
    remplacerRoute("n:" + nid + "@" + rec.date);
    sauver("Modifié pour ce jour-là seulement");
    verifierNotifs(rec);
    return;
  }
  const nouveau = !ed.id, id = ed.id || newId(type === "dossier" ? "d" : "n");
  const ancien = D.nodes[id];
  if (nouveau || !ancien || str(ancien.parent) !== parent) {
    const freres = visKids(parent).filter(s => s.id !== id);
    rec.ordre = freres.some(s => s.ordre) ? Math.max(...freres.map(s => s.ordre)) + 1 : 0;
  }
  D.nodes[id] = nouveau ? Object.assign(blankNode(now), rec, {cree: now}) : Object.assign({}, ancien, rec);
  fermerFeuille();
  if (nouveau) {
    const ici = ST.route === "n:" + parent || (parent === "root" && ST.route === "accueil") || (ST.route === "planning" && type === "evenement");
    sauver({text: "Ajouté dans " + (parent === "root" ? "l’accueil" : pathLabel(parent)), action: ici ? null : {label: "Voir", fn: () => go(type === "dossier" ? "n:" + id : (type === "evenement" ? "n:" + id : "n:" + parent))}});
    if (type === "evenement" || type === "tache") proposerApresAjout(id);
  } else sauver("Enregistré");
  verifierNotifs(rec);
}
/** Si un rappel vient d'être réglé, propose d'autoriser les notifications. */
function verifierNotifs(rec) {
  if (rec.rappel == null || !A || D.config.rappels === false) return;
  const etat = str(natif("etatNotifications"));
  if (etat === "a-demander") natif("demanderNotifications");
  else if (etat === "bloque") toast("Les notifications sont bloquées : le rappel ne sonnera pas.", {label: "Autoriser", fn: () => natif("reglagesNotifications")});
}

/* ---------- notes de matière ---------- */
function feuilleEval(nid, eid) {
  const n = S.N.get(nid);
  if (!n) return;
  const e = eid ? n.evaluations.find(x => x.id === eid) : null;
  ST.edit = {eval: true, id: nid, eid: e ? e.id : null};
  ouvrirFeuille(`<form id="f-eval" novalidate>${tete(e ? "Modifier la note" : "Nouvelle note")}<div class="sheet-body">
    <p class="muted" style="margin:0">${esc(n.titre)}</p>
    <div class="field"><label for="ev-titre">Évaluation</label><input type="text" id="ev-titre" value="${esc(e ? e.titre : "")}" maxlength="80" placeholder="Ex. : Partiel, TD 2, Oral" autocomplete="off"><p class="err" id="sheet-err" hidden></p></div>
    <div class="row3"><div class="field"><label for="ev-note">Note</label><input type="number" id="ev-note" inputmode="decimal" step="0.01" min="0" value="${e ? e.note : ""}"></div>
    <div class="field"><label for="ev-sur">Sur</label><input type="number" id="ev-sur" inputmode="decimal" step="1" min="1" value="${e ? e.sur : 20}"></div>
    <div class="field"><label for="ev-coef">Coef</label><input type="number" id="ev-coef" inputmode="decimal" step="0.5" min="0" value="${e ? e.coef : 1}"></div></div>
    <div class="field"><label for="ev-date">Date</label><input type="date" id="ev-date" value="${esc(e ? e.date : today())}"></div>
    ${e ? `<div class="sheet-foot"><button type="button" class="btn danger" data-act="eval-suppr">${ICON.corbeille}<span>Supprimer cette note</span></button></div>` : ""}
  </div>${pied("Enregistrer")}</form>`, "eval", e ? null : "#ev-titre");
}
function enregistrerEval(supprimer) {
  const ed = ST.edit;
  if (!ed || !ed.eval) return;
  const n = D.nodes[ed.id];
  if (!n) return;
  let liste = cleanEvals(n.evaluations);
  if (supprimer) liste = liste.filter(x => x.id !== ed.eid);
  else {
    const note = num(val("ev-note")), sur = num(val("ev-sur")) || 20, coef = num(val("ev-coef"));
    if (note == null) { erreurFeuille("Indique la note.", "ev-note"); return; }
    if (note < 0 || note > sur) { erreurFeuille("La note doit être entre 0 et " + fmtNombre(sur, 0) + ".", "ev-note"); return; }
    const e = {id: ed.eid || newId("e"), titre: val("ev-titre").trim() || "Évaluation", note, sur, coef: coef == null ? 1 : coef, date: val("ev-date")};
    const i = liste.findIndex(x => x.id === e.id);
    if (i >= 0) liste[i] = e; else liste.push(e);
    liste.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }
  D.nodes[ed.id] = Object.assign({}, n, {evaluations: liste}, tampon());
  fermerFeuille();
  sauver(supprimer ? "Note supprimée" : "Note enregistrée");
}

/* ---------- semaine d'alternance ---------- */
function feuilleSemaine(lundi) {
  const t = str(D.semaines[lundi]);
  ST.edit = {semaine: lundi};
  ouvrirFeuille(`<form id="f-semaine" novalidate>${tete("Semaine " + isoWeek(pd(lundi)))}<div class="sheet-body">
    <p class="muted" style="margin:0">Du ${esc(jourLong(lundi).toLowerCase())} au ${esc(F_HEAD.format(pd(addDays(lundi, 6))))}</p>
    <div class="choix-list" data-deselect>${[["ecole", "À l’école"], ["entreprise", "En entreprise"], ["conges", "En congés"], ["examens", "Examens"], ["", "Non défini"]].map(([k, l]) => `<label class="${k ? "s-" + k : ""}"><input type="radio" name="sem-type" value="${k}" id="sem-${k || "aucun"}"${t === k ? " checked" : ""}><i></i>${l}</label>`).join("")}</div>
    <p class="hint">Pour remplir toute l’année d’un coup : Paramètres › Rythme d’alternance. Touche encore la case choisie pour la retirer.</p></div>${pied("Enregistrer")}</form>`, "semaine");
}

/* ---------- fichiers ---------- */
function feuilleFichier(fid) {
  const f = S.F.get(fid);
  if (!f) return;
  ST.edit = {fichier: fid};
  ouvrirFeuille(`<form id="f-fichier" novalidate>${tete("Ranger le fichier")}<div class="sheet-body">
    <div class="field"><label for="fi-nom">Nom</label><input type="text" id="fi-nom" value="${esc(f.nom)}" maxlength="120" autocomplete="off"><p class="err" id="sheet-err" hidden></p></div>
    <div class="field"><label for="fi-parent">Rangé dans</label><select id="fi-parent">${optionsDossiers(f.parent, {nonRange: true, tout: true})}</select></div>
    <p class="hint">${esc(fmtTaille(f.taille))}${f.pages ? " · " + plural(f.pages, "page") : ""}${f.w && f.h && estImage(f) ? " · " + f.w + " × " + f.h + " px" : ""} · ajouté ${esc(fmtStamp(f.ajoute))}</p>
  </div>${pied("Enregistrer")}</form>`, "fichier");
}
function feuilleChoixFichiers() {
  const fs = [...S.F.values()].filter(fichierVisible).sort((a, b) => b.ajoute.localeCompare(a.ajoute));
  ST.choixFichiers = ST.draftFichiers.slice();
  if (!fs.length) { toast("Aucun fichier dans le tableau pour l’instant."); return; }
  ouvrirFeuille(`${tete("Joindre du tableau")}<div class="sheet-body"><p class="muted" style="margin:0">Touche les fichiers à envoyer à Claude avec ta demande.</p><div class="fgrid" id="choix-grille">${fs.map(f => tuile(f, {choix: true})).join("")}</div></div><div class="sheet-actions"><button class="btn primary" type="button" data-act="choix-ok" id="choix-ok">Joindre (${ST.choixFichiers.length})</button><button type="button" class="btn" data-act="fermer">Annuler</button></div>`, "choix");
}

/* ---------- partage reçu d'une autre appli ---------- */
function feuillePartage(d) {
  const ids = d.ids || [];
  const fs = ids.map(id => S.F.get(id)).filter(Boolean);
  const texte = str(d.texte).trim();
  ST.partage = {ids, texte};
  const dest = dossierCourant();
  let b = "";
  if (fs.length) {
    b += `<div class="fstrip">${fs.map(f => tuile(f, {statique: true})).join("")}</div>
      <div class="field"><label for="pa-dans">Ranger dans</label><select id="pa-dans">${optionsDossiers(dest, {tout: true})}</select></div>`;
    if (texte) b += `<p class="hint">Texte reçu avec : « ${esc(texte.slice(0, 140))}${texte.length > 140 ? "…" : ""} »</p>`;
    ST.partage.pied = `<div class="sheet-actions"><button class="btn primary" type="submit">Ranger ici</button><button class="btn" type="button" data-act="partage-demande">Pour Claude</button></div>`;
  } else {
    const premiere = texte.split("\n").find(l => l.trim()) || "Note";
    b += `<div class="intro" style="margin:0;white-space:pre-wrap">${esc(texte.slice(0, 600))}${texte.length > 600 ? "…" : ""}</div>
      <div class="field"><label for="pa-titre">Titre de la note</label><input type="text" id="pa-titre" value="${esc(premiere.slice(0, 80))}" maxlength="160" autocomplete="off"></div>
      <div class="field"><label for="pa-dans">Ranger dans</label><select id="pa-dans">${optionsDossiers(dest)}</select></div>
`;
    ST.partage.pied = `<div class="sheet-actions"><button class="btn primary" type="submit">Créer la note</button><button class="btn" type="button" data-act="partage-demande">Pour Claude</button></div>`;
  }
  ouvrirFeuille(`<form id="f-partage" novalidate>${tete(fs.length ? (fs.length > 1 ? fs.length + " fichiers reçus" : "Fichier reçu") : "Texte reçu")}<div class="sheet-body">${b}</div>${ST.partage.pied}</form>`, "partage");
}

/* ---------- réponse de Claude : aperçu avant d'appliquer ---------- */
function feuilleApercu(p) {
  ST.apercu = p;
  if (p.kind === "full") {
    const n = p.obj.nodes.length;
    ouvrirFeuille(`${tete("Restaurer le tableau")}<div class="sheet-body"><p>Ce texte est une copie complète du tableau (${plural(n, "élément")}). Il remplace tout le contenu actuel. Les photos et PDF déjà présents restent dans le téléphone.</p></div><div class="sheet-actions"><button class="btn danger" type="button" data-act="appliquer-code">Tout remplacer</button><button class="btn" type="button" data-act="fermer">Annuler</button></div>`, "apercu");
    return;
  }
  const l = apercuChangements(p.obj);
  const LAB = {ajout: "Ajout", modif: "Modif", corbeille: "Corbeille", fichier: "Fichier", semaines: "Rythme", demandes: "Demandes"};
  ouvrirFeuille(`${tete("Changements de Claude")}<div class="sheet-body">${l.length ? `<ul class="apercu">${l.map(x => `<li><b class="k-${x.k}">${LAB[x.k] || x.k}</b><span>${esc(x.t)}</span></li>`).join("")}</ul>` : `<p class="muted">Ce code ne change rien au tableau.</p>`}
    <p class="hint">Tu pourras annuler juste après.</p></div><div class="sheet-actions"><button class="btn primary" type="button" data-act="appliquer-code"${l.length ? "" : " disabled"}>Appliquer</button><button class="btn" type="button" data-act="fermer">Annuler</button></div>`, "apercu");
}

/* ---------- visionneuse ---------- */
function ouvrirVisionneuse(fid) {
  const f = S.F.get(fid);
  if (!f) return;
  ST.vue = fid;
  const W = Math.min(1600, Math.round((window.innerWidth || 400) * (window.devicePixelRatio || 2)));
  const sous = [f.parent && S.N.has(f.parent) ? pathLabel(f.parent) : "Non rangé", fmtTaille(f.taille), f.pages ? plural(f.pages, "page") : ""].filter(Boolean).join(" · ");
  let corps;
  if (estImage(f)) corps = `<div class="vw-body" id="vw-body"><img class="vw-img" src="${urlFichier(f)}" alt="${esc(f.nom)}"></div>`;
  else if (estPdf(f) && f.pages > 0) corps = `<div class="vw-body pdf" id="vw-body"><div class="vw-pages">${Array.from({length: f.pages}, (_, i) => `<img class="vw-page" src="${urlPage(f, i, W)}" alt="Page ${i + 1}" loading="${i < 2 ? "eager" : "lazy"}"${f.w && f.h ? ` width="${f.w}" height="${f.h}"` : ""}>`).join("")}</div></div>`;
  else corps = `<div class="vw-body" id="vw-body"><div class="vw-autre"><span class="ft-ext">${esc(extDe(f) || "FICHIER")}</span><p>${f.protege ? "Ce PDF est protégé par un mot de passe : ouvre-le avec une autre appli." : "Aperçu impossible ici. Ouvre-le avec une autre appli."}</p><button class="btn primary" type="button" data-act="ouvrir-avec" data-id="${esc(f.id)}">${ICON.ouvrir}<span>Ouvrir avec…</span></button></div></div>`;
  const v = $("#viewer");
  v.innerHTML = `<div class="vw-bar"><button class="icon-btn" type="button" data-act="vw-fermer" aria-label="Fermer">${ICON.x}</button><div class="vw-title"><span class="vw-nom">${esc(f.nom)}</span><span class="vw-sub">${esc(sous)}</span></div>${estImage(f) || estPdf(f) ? `<button class="icon-btn" type="button" data-act="vw-zoom" aria-label="Zoomer">${ICON.zoom}</button>` : ""}</div>${corps}
    <div class="vw-actions"><button class="vw-act" type="button" data-act="f-claude" data-id="${esc(f.id)}">${ICON.claude}<span>Claude</span></button><button class="vw-act" type="button" data-act="ouvrir-avec" data-id="${esc(f.id)}">${ICON.ouvrir}<span>Ouvrir</span></button><button class="vw-act" type="button" data-act="f-ranger" data-id="${esc(f.id)}">${ICON.ranger}<span>Ranger</span></button><button class="vw-act" type="button" data-act="f-corbeille" data-id="${esc(f.id)}">${ICON.corbeille}<span>Corbeille</span></button></div>`;
  clearTimeout(vwTimer);
  v.classList.remove("ferme");
  v.hidden = false;
  document.documentElement.classList.add("locked");
}
function fermerVisionneuse() {
  const v = $("#viewer");
  ST.vue = null;
  if (v.hidden || v.classList.contains("ferme")) return;
  const fin = () => { v.hidden = true; v.classList.remove("ferme"); v.innerHTML = ""; deverrouiller(); };
  if (mouvementReduit()) { fin(); return; }
  v.classList.add("ferme");
  clearTimeout(vwTimer);
  vwTimer = setTimeout(fin, 170);
}
function zoomVisionneuse(x, y) {
  const b = $("#vw-body");
  if (!b) return;
  const avant = b.classList.contains("zoomed");
  const rx = x != null ? (x - b.getBoundingClientRect().left + b.scrollLeft) / Math.max(1, b.scrollWidth) : .5;
  const ry = y != null ? (y - b.getBoundingClientRect().top + b.scrollTop) / Math.max(1, b.scrollHeight) : .5;
  b.classList.toggle("zoomed");
  if (!avant) requestAnimationFrame(() => { b.scrollLeft = rx * b.scrollWidth - b.clientWidth / 2; b.scrollTop = ry * b.scrollHeight - b.clientHeight / 2; });
}

/* ---------- nouveautés ---------- */
function feuilleNouveautes() {
  ouvrirFeuille(`${tete("Nouveautés")}<div class="sheet-body"><ul class="nouv">${NOUVEAUTES.map(x => `<li>${esc(x)}</li>`).join("")}</ul><p class="hint">Tableau ${esc(INFOS.version || VERSION_NOUVEAUTES)}</p></div><div class="sheet-actions"><button class="btn primary" type="button" data-act="fermer">OK</button></div>`, "nouveautes");
}

/* ---------- trajet (bloc ajouté par le planning) ---------- */
function feuilleTrajet(date) {
  const os = occurrences(date, date), tr = trajetsJour(date, os), rg = reglagesTrajets();
  const aller = tr.find(x => x.sens === "aller"), ret = tr.find(x => x.sens === "retour");
  const facts = [];
  if (aller) facts.push(["Départ", fmtMin(aller.s) + " → arrivée " + fmtMin(aller.e) + (aller.pour ? " pour « " + aller.pour.n.titre + " »" : "")]);
  if (ret) facts.push(["Retour", fmtMin(ret.s) + " → " + fmtMin(ret.e) + (rg.domicile ? " à " + rg.domicile : "")]);
  const corps = `<p class="muted" style="margin:0">${esc(jourLong(date))}</p>
    ${facts.length ? `<dl class="facts" style="margin:0">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : `<p>Pas de trajet ce jour-là.</p>`}
    ${rg.description ? `<p>${esc(rg.description)}</p>` : ""}<p>Le Tableau compte ${esc(fmtDureeMin(rg.aller))} à l’aller et ${esc(fmtDureeMin(rg.retour))} au retour${rg.rappel ? ", et te prévient à l’heure du départ" : ""}.</p>`;
  ouvrirFeuille(`${tete("Trajet")}<div class="sheet-body">${corps}</div><div class="sheet-actions"><button class="btn primary" type="button" data-go="reglages">Régler les trajets</button><button class="btn" type="button" data-act="fermer">Fermer</button></div>`, "trajet");
}
