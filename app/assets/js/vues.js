"use strict";
/* Écrans : accueil, dossiers et éléments, fichiers, Claude, réglages, corbeille, aide. */

let SINCE = Date.now() - 72 * 3600e3;
try {
  const prev = localStorage.getItem("tableau.derniereVisite");
  SINCE = prev ? (Number(prev) || SINCE) : Date.now();
  localStorage.setItem("tableau.derniereVisite", String(Date.now()));
} catch (e) { /* stockage indisponible : on garde la valeur par défaut */ }

const LABEL_ROUTE = {accueil: "Accueil", planning: "Planning", fichiers: "Fichiers", claude: "Claude", reglages: "Paramètres", corbeille: "Corbeille", aide: "Aide"};
function labelRoute(r) {
  if (r.startsWith("n:")) { const n = S.N.get(r.slice(2).split("@")[0]); return n ? (n.titre || "Sans titre") : "Retour"; }
  return LABEL_ROUTE[r] || "Retour";
}

/* ---------- morceaux communs ---------- */
const VERSION_NOUVEAUTES = "2.3";
const NOUVEAUTES = [
  "Le Tableau se met à jour tout seul : quand une nouvelle version sort, une carte « Mettre à jour » apparaît sur l’accueil. Un appui, Android confirme, et c’est fait, sans perdre tes données.",
  "Paramètres › Mises à jour : vérifier à la main, ou laisser l’appli vérifier toute seule.",
  "Trajets : ta ville de départ, celle des cours et les lieux qui demandent un trajet se règlent dans Paramètres › Trajets.",
  "L’appli ne contient plus rien de personnel : tes infos restent seulement dans ton téléphone."
];
function carteNouveautes() {
  return `<div class="block"><div class="notice chaud"><p class="notice-title">Nouveau dans le Tableau</p><ul class="nouv">${NOUVEAUTES.map(x => `<li>${esc(x)}</li>`).join("")}</ul><div class="btn-row"><button class="btn sm primary" type="button" data-act="nouveautes-ok">C’est noté</button><button class="btn sm" type="button" data-act="nouveautes-voir">Voir le mode d’emploi</button></div></div></div>`;
}
/** Une astuce ne s'affiche que tant qu'elle n'a pas été vue (Paramètres › Revoir les astuces). */
const astuceVue = cle => !!(D.config.vu && D.config.vu[cle]);
function astuce(cle, texte) {
  if (astuceVue(cle)) return "";
  return `<div class="astuce"><p>${esc(texte)}</p><button class="link" type="button" data-act="astuce-ok" data-cle="${esc(cle)}">OK</button></div>`;
}
const ICON_MODE = {
  discret: svg('<path d="M6 16.5V11a6 6 0 0 1 9.4-5"/><path d="M18 10.5v6l1.5 2H7.5"/><path d="M10 20.5a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/>'),
  vibreur: svg('<rect x="8" y="4" width="8" height="16" rx="1.6"/><path d="M5 9v6M19 9v6M2.5 10.5v3M21.5 10.5v3"/>'),
  sonnerie: ICON.cloche,
  alarme: svg('<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M4.5 6l3-2.5M19.5 6l-3-2.5"/>')
};
const DUREES = [[0, "Une fois"], [10, "Pendant 10 s"], [30, "Pendant 30 s"], [60, "Pendant 1 min"], [120, "Pendant 2 min"], [300, "Pendant 5 min"]];
const FOIS = [[1, "Une seule fois"], [2, "2 fois"], [3, "3 fois"], [5, "5 fois"]];
const ECARTS = [[5, "5 min"], [10, "10 min"], [15, "15 min"], [30, "30 min"]];
function optionsListe(liste, courant, suffixe) {
  const l = liste.some(([v]) => v === courant) ? liste : liste.concat([[courant, courant + (suffixe || "")]]);
  return l.map(([v, t]) => `<option value="${v}"${v === courant ? " selected" : ""}>${esc(t)}</option>`).join("");
}
/** Champs « comment sonner » d'un rappel ; p = préfixe des identifiants (e : éditeur, p : paramètres). */
function champsRappel(p, o) {
  return `<fieldset class="field"><legend class="lbl">Comment</legend><div class="seg modes">${Object.keys(MODES_RAPPEL).map(m => `<label><input type="radio" name="${p}-rmode" value="${m}" id="${p}-rm-${m}"${o.mode === m ? " checked" : ""}><span>${ICON_MODE[m]}${MODES_RAPPEL[m]}</span></label>`).join("")}</div></fieldset>
    <div class="row2"><div class="field" data-si="r-duree"><label for="${p}-rduree">Sonne ou vibre</label><select id="${p}-rduree">${optionsListe(DUREES, o.duree, " s")}</select></div>
    <div class="field"><label for="${p}-rfois">Répéter le rappel</label><select id="${p}-rfois">${optionsListe(FOIS, o.fois, " fois")}</select></div></div>
    <div class="field" data-si="r-ecart"><label for="${p}-recart">Entre deux rappels</label><select id="${p}-recart">${optionsListe(ECARTS, o.ecart, " min")}</select></div>
    <p class="hint" data-si="r-alarme">L’alarme utilise la sonnerie du réveil, au volume des alarmes. « Arrêter » dans la notification la coupe, « Dans 10 min » la repousse.</p>`;
}
function majChampsRappel(root, p) {
  if (!root) return;
  const m = root.querySelector(`input[name="${p}-rmode"]:checked`);
  const mode = m ? m.value : "sonnerie";
  const sf = root.querySelector("#" + p + "-rfois");
  const fois = sf ? Number(sf.value) || 1 : 1;
  root.querySelectorAll('[data-si="r-duree"]').forEach(el => { el.hidden = mode === "discret"; });
  root.querySelectorAll('[data-si="r-ecart"]').forEach(el => { el.hidden = fois <= 1; });
  root.querySelectorAll('[data-si="r-alarme"]').forEach(el => { el.hidden = mode !== "alarme"; });
}
const isFresh = x => x.majPar === "claude" && Date.parse(x.maj) > SINCE;
const tagClaude = x => isFresh(x) ? '<span class="tag-claude">Claude</span>' : "";
function pill(n) {
  if (n.type !== "tache") return "";
  if (n.statut === "fait") return '<span class="pill ok">Fait</span>';
  if (n.date && n.date < today()) return '<span class="pill late">En retard</span>';
  if (n.statut === "en-cours") return '<span class="pill cu">En cours</span>';
  return "";
}
function metaOf(n) {
  const parts = [];
  if (n.type === "dossier") {
    if (n.info) parts.push(esc(n.info));
    const k = visKids(n.id).length, f = fichiersDe(n.id).length;
    if (k) parts.push(plural(k, "élément"));
    if (f) parts.push(plural(f, "fichier"));
    if (!parts.length) parts.push("Vide");
  } else if (n.type === "tache") {
    parts.push(n.date ? "Pour " + esc(relDay(n.date)) : "Sans échéance");
  } else if (n.type === "evenement") {
    const d = prochaineDate(n);
    parts.push(d ? esc(cap(relDay(d))) + (n.heure ? " · " + esc(fmtHeure(n.heure)) : "") : (n.repete ? "Répétition terminée" : "Date à fixer"));
    if (n.repete) parts.push("répété");
    if (n.lieu) parts.push(esc(n.lieu));
  } else {
    const first = n.texte.split("\n").find(l => l.trim());
    parts.push(first ? esc(stripMd(first).slice(0, 90)) : "Note vide");
  }
  const nf = n.type !== "dossier" ? fichiersDe(n.id).length : 0;
  if (nf) parts.push(plural(nf, "fichier"));
  return parts.join(" · ");
}
function rowHTML(n, o = {}) {
  const done = n.type === "tache" && n.statut === "fait";
  const lead = n.type === "tache"
    ? `<button class="check${done ? " on" : ""}" type="button" data-act="toggle" data-id="${esc(n.id)}" aria-pressed="${done}" aria-label="${done ? "Remettre à faire" : "Marquer comme fait"} : ${esc(n.titre)}">${ICON.check}</button>`
    : `<span class="glyph${n.type === "evenement" ? " c-" + couleurDe(n) : ""}">${ICON[n.type] || ICON.note}</span>`;
  const path = o.path ? `<span class="row-path">${esc(pathLabel(n.id, false) || "Accueil")}</span>` : "";
  return `<div class="row${done ? " is-done" : ""}">${o.bus ? '<span class="borne" aria-hidden="true"></span>' : ""}${lead}<button class="row-link" type="button" data-go="n:${esc(n.id)}"><span class="row-main"><span class="row-title">${esc(n.titre || "Sans titre")}</span><span class="row-meta">${metaOf(n)}</span>${path}</span><span class="row-side">${pill(n)}${n.epingle && o.pin !== false ? ICON.epingle : ""}${tagClaude(n)}${n.type === "dossier" ? ICON.chev : ""}</span></button></div>`;
}
function departHTML(n) {
  const subs = visKids(n.id).filter(c => c.type === "dossier");
  const k = countItems(n.id);
  const chips = subs.length ? `<div class="chips">${subs.map(s => `<button class="chip" type="button" data-go="n:${esc(s.id)}">${esc(s.titre || "Sans titre")}</button>`).join("")}</div>` : "";
  return `<div class="row depart"><span class="borne c-${couleurDe(n)}" aria-hidden="true"></span><div class="depart-body"><button class="row-link" type="button" data-go="n:${esc(n.id)}"><span class="row-main"><span class="depart-title">${esc(n.titre || "Sans titre")}</span>${n.info ? `<span class="row-meta">${esc(n.info)}</span>` : ""}</span><span class="row-side">${tagClaude(n)}${k ? `<span class="count" aria-label="${k} éléments">${k}</span>` : ""}${ICON.chev}</span></button>${chips}</div></div>`;
}
function agRow(o) {
  const t = today(), d = pd(o.date), n = o.n;
  const cls = o.date === t ? " is-today" : (o.date < t ? " is-late" : "");
  const meta = [];
  if (!o.journee) meta.push(esc(fmtPlage(o)));
  if (o.tache) meta.push("Tâche");
  if (n.lieu) meta.push(esc(n.lieu));
  meta.push(esc(pathLabel(n.id, false) || "Accueil"));
  return `<button class="ag${cls}" type="button" data-occ="${esc(o.cle)}"><span class="ag-day"><span class="ag-wd">${esc(wdCourt(o.date))}</span><span class="ag-dn">${d.getDate()}</span></span><span class="row-main"><span class="row-title">${esc(n.titre || "Sans titre")}</span><span class="row-meta">${meta.join(" · ")}</span></span><span class="row-side">${pill(n)}${tagClaude(n)}</span></button>`;
}
function chipSemaine(lundi) {
  const t = str(D.semaines[lundi]);
  const label = t ? "Semaine " + SEMAINES[t].toLowerCase() : "Semaine : école ou entreprise ?";
  return `<button class="chip-sem${t ? " s-" + t : " vide"}" type="button" data-act="semaine" data-lundi="${lundi}"><i aria-hidden="true"></i>${esc(label)}</button>`;
}
function barreRetour(n, date) {
  const prev = ST.pile.length ? ST.pile[ST.pile.length - 1].r : null;
  let label = prev ? labelRoute(prev) : "Accueil";
  if (!prev && n) { const p = parentOf(n); label = p === "root" ? "Accueil" : (S.N.get(p).titre || "Retour"); }
  return `<div class="bar"><button class="back" type="button" data-act="retour">${ICON.back}<span>${esc(label)}</span></button>${n ? `<button class="icon-btn" type="button" data-act="modifier" data-id="${esc(n.id)}"${date ? ` data-date="${date}"` : ""} aria-label="Modifier ${esc(n.titre)}">${ICON.more}</button>` : ""}</div>`;
}
function crumbsHTML(n) {
  const c = chain(n.id); c.pop();
  if (!c.length) return "";
  return `<nav class="crumbs" aria-label="Emplacement">${c.map((x, i) => `${i ? '<span aria-hidden="true">›</span>' : ""}<button type="button" data-go="n:${esc(x.id)}">${esc(x.titre || "Sans titre")}</button>`).join("")}</nav>`;
}
function tuile(f, o = {}) {
  const pdf = estPdf(f), img = estImage(f) || (pdf && f.apercu);
  const badge = pdf ? `PDF${f.pages ? " · " + f.pages + " p." : ""}` : (img ? "" : "");
  const sel = o.choix ? ST.choixFichiers.includes(f.id) : false;
  const act = o.choix ? `data-act="choix-f" data-id="${esc(f.id)}" aria-pressed="${sel}"` : `data-voir="${esc(f.id)}"`;
  const interieur = `<span class="ft-img">${img ? `<img src="${urlMini(f)}" alt="" loading="lazy">` : `<span class="ft-ext">${esc(extDe(f) || "FICHIER")}</span>`}${badge ? `<span class="ft-badge">${badge}</span>` : ""}</span>${o.choix ? `<span class="ft-check">${ICON.check}</span>` : ""}<span class="ft-nom">${esc(f.nom)}</span>`;
  if (o.statique) return `<div class="ft${pdf ? " pdf" : ""}">${interieur}</div>`;
  return `<button class="ft${pdf ? " pdf" : ""}${sel ? " sel" : ""}" type="button" ${act}>${interieur}</button>`;
}
function blocFichiers(id, titre = "Fichiers") {
  const fs = fichiersDe(id);
  const boutons = `<div class="ajout-fichiers"><button class="btn sm" type="button" data-act="choisir" data-mode="photo" data-id="${esc(id)}">${ICON.photo}<span>Photo</span></button><button class="btn sm" type="button" data-act="choisir" data-mode="galerie" data-id="${esc(id)}">${ICON.galerie}<span>Image</span></button><button class="btn sm" type="button" data-act="choisir" data-mode="fichiers" data-id="${esc(id)}">${ICON.fichier}<span>PDF ou fichier</span></button></div>`;
  if (!fs.length) return `<section class="fichiers-bloc"><div class="block-head"><h2 class="eyebrow">${esc(titre)}</h2></div>${boutons}</section>`;
  return `<section class="fichiers-bloc"><div class="block-head"><h2 class="eyebrow">${esc(titre)} · ${fs.length}</h2></div><div class="fgrid">${fs.map(f => tuile(f)).join("")}</div>${boutons}</section>`;
}

/* ---------- accueil : le planning en haut, les sections en dessous ; recherche et + en bas (voir majDock) ---------- */
function vueAccueil() {
  const prenom = str(D.config.prenom).trim();
  return `<header class="home-head"><div class="home-top"><p class="eyebrow">${esc(dateLine())}</p><button class="icon-btn" type="button" data-go="reglages" aria-label="Paramètres">${ICON.reglages}</button></div><h1 class="h1">${prenom ? "Salut " + esc(prenom) : "Salut"}</h1>${chipSemaine(mondayOf(today()))}</header>
  <div id="home-body">${corpsAccueil()}</div>`;
}
function corpsAccueil() {
  const q = ST.q.trim();
  if (q) return resultatsRecherche(q);
  let h = "";
  if (S.erreurChargement) h += `<div class="block"><div class="notice"><p class="notice-title">Ton tableau n’a pas pu être relu</p><p class="muted">La structure de départ est affichée. Restaure ta dernière sauvegarde depuis Paramètres, ou recolle le dernier message envoyé à Claude dans l’onglet Claude.</p></div></div>`;
  h += carteMaj();
  if (str(D.config.nouveautesVues) !== VERSION_NOUVEAUTES) h += carteNouveautes();
  h += zonePlanning();
  h += blocPropositions();
  const ep = [...S.vis].map(id => S.N.get(id)).filter(n => n.epingle).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
  if (ep.length) h += `<section class="block"><div class="block-head"><h2 class="eyebrow">Épinglés</h2></div><div class="list carte-liste">${ep.map(n => rowHTML(n, {path: true, pin: false})).join("")}</div></section>`;
  h += zoneSections();
  const fresh = [...S.vis].map(id => S.N.get(id)).filter(isFresh).sort((a, b) => b.maj.localeCompare(a.maj));
  if (fresh.length) {
    const tout = !!ST.toutNouveau;
    h += `<section class="block"><div class="block-head"><h2 class="eyebrow">Nouveau de Claude · ${fresh.length}</h2></div><div class="list carte-liste">${(tout ? fresh.slice(0, 60) : fresh.slice(0, 3)).map(n => rowHTML(n, {path: true})).join("")}</div>${fresh.length > 3 ? `<button class="btn bas" type="button" data-act="voir-nouveau">${tout ? "Réduire" : "Tout voir (" + fresh.length + ")"}</button>` : ""}</section>`;
  }
  const recents = [...S.F.values()].filter(fichierVisible).sort((a, b) => b.ajoute.localeCompare(a.ajoute)).slice(0, 10);
  if (recents.length) h += `<section class="block"><div class="block-head"><h2 class="eyebrow">Fichiers récents</h2></div><div class="fstrip">${recents.map(f => tuile(f)).join("")}</div><button class="btn bas" type="button" data-tab-go="fichiers">Tous les fichiers</button></section>`;
  h += carteClaude();
  const tc = [...S.N.values()].filter(n => n.corbeille).length + [...S.F.values()].filter(f => f.corbeille).length;
  h += `<footer class="foot"><button class="link muted-link" type="button" data-go="corbeille">Corbeille${tc ? ` (${tc})` : ""}</button><span aria-hidden="true">·</span><button class="link muted-link" type="button" data-go="reglages">Paramètres et sauvegarde</button></footer>`;
  return h;
}
/** Partie Planning : ce qui arrive, le reste de la journée, les 7 prochains jours. */
function zonePlanning() {
  const t = today(), mn = nowMin();
  const occs = avecTrajets(occurrences(t, t)).filter(o => !o.tache);
  const timed = occs.filter(o => !o.journee), allday = occs.filter(o => o.journee);
  const reels = occs.filter(o => !o.virtuel), taches = tachesUrgentes();
  const sous = reels.length ? plural(reels.length, "chose") + " aujourd’hui" : "Rien aujourd’hui";
  let h = `<section class="zone" aria-labelledby="z-planning"><div class="zone-head"><span class="zone-ico">${ICON.agenda}</span><h2 class="zone-title" id="z-planning">Planning</h2><span class="zone-sub">${esc(sous)}</span></div><div class="zone-card">`;
  const next = timed.find(o => o.e > mn);
  if (next) h += carteEnsuite(next, mn);
  else {
    const dem = occurrences(addDays(t, 1), addDays(t, 1)).filter(o => !o.tache), p = dem[0];
    h += `<div class="auj-vide"><p class="quiet">${reels.length ? "Plus rien aujourd’hui." : "Rien de prévu aujourd’hui."}</p>${p ? `<p class="muted">Demain : ${esc(p.n.titre)}${p.journee ? "" : " à " + esc(fmtMin(p.s))}${dem.length > 1 ? ", et " + plural(dem.length - 1, "autre chose", "autres choses") : ""}.</p>` : ""}</div>`;
  }
  const autres = [...allday, ...timed.filter(o => o !== next && o.e > mn - 60)];
  if (autres.length) h += `<div class="tl">${autres.map(ligneJour).join("")}</div>`;
  if (taches.length) h += `<div class="taches-jour"><p class="eyebrow">À faire</p><div class="list">${taches.map(n => rowHTML(n, {path: true})).join("")}</div></div>`;
  h += bandeJours();
  return h + `</div><button class="zone-cta" type="button" data-tab-go="planning">${ICON.agenda}<span>Ouvrir le planning</span>${ICON.chev}</button></section>`;
}
const attrsOcc = o => o.virtuel ? `data-act="trajet" data-date="${o.date}"` : `data-occ="${esc(o.cle)}"`;
function metaTrajet(o) {
  const d = reglagesTrajets().description, mode = d && d.length <= 40 ? " · " + d : "";
  if (o.sens === "aller") return (o.pour ? o.pour.n.titre + " à " + fmtMin(o.pour.s) : "Arrivée " + fmtMin(o.e)) + mode;
  return "Arrivée vers " + fmtMin(o.e) + mode;
}
function carteEnsuite(o, mn) {
  const enCours = o.s <= mn;
  const tr = reglagesTrajets();
  const titre = o.virtuel ? (o.sens === "aller" ? "Départ" + (tr.ville ? " pour " + tr.ville : "") : "Retour" + (tr.domicile ? " à " + tr.domicile : "")) : (o.n.titre || "Sans titre");
  const meta = o.virtuel ? metaTrajet(o) : [fmtPlage(o), o.n.lieu].filter(Boolean).join(" · ");
  return `<button class="now c-${couleurDe(o.n)}${o.virtuel ? " trajet" : ""}" type="button" ${attrsOcc(o)}><span class="now-time">${enCours ? "Là" : esc(fmtCourt(o.s))}<small>${enCours ? "en cours" : (o.virtuel && o.sens === "aller" ? "départ" : "ensuite")}</small></span><span class="now-title">${o.virtuel ? ICON.train : ""}${esc(titre)}</span><span class="now-meta">${esc(meta)}<br><span class="now-rel">${enCours ? "jusqu’à " + esc(fmtMin(o.e)) : esc(dans(o.s - mn))}</span></span></button>`;
}
function ligneJour(o) {
  const passe = !o.journee && o.e <= nowMin();
  const meta = o.virtuel ? metaTrajet(o) : ([o.journee ? "" : fmtPlage(o), o.n.lieu].filter(Boolean).join(" · ") || pathLabel(o.n.id, false));
  return `<button class="tl-row${passe ? " passe" : ""}${o.virtuel ? " trajet" : ""}" type="button" ${attrsOcc(o)}><span class="tl-time">${o.journee ? "Journée" : esc(fmtCourt(o.s))}</span><span class="tl-dot c-${couleurDe(o.n)}"></span><span class="row-main"><span class="row-title">${o.virtuel ? ICON.train : ""}${esc(o.n.titre || "Sans titre")}</span><span class="row-meta">${esc(meta)}</span></span></button>`;
}
/** Les 7 prochains jours : touche un jour pour l'ouvrir dans le planning. */
function bandeJours() {
  const t = today(), par = grouper(occurrences(t, addDays(t, 6)));
  return `<div class="wk7" role="group" aria-label="Les 7 prochains jours">${[0, 1, 2, 3, 4, 5, 6].map(k => {
    const d = addDays(t, k), l = (par.get(d) || []).filter(o => !(o.tache && o.n.statut === "fait"));
    const ty = str(D.semaines[mondayOf(d)]);
    return `<button class="wk7-j${k === 0 ? " auj" : ""}${ty ? " s-" + ty : ""}" type="button" data-act="aller-jour" data-date="${d}" aria-label="${esc(jourLong(d))}${l.length ? ", " + plural(l.length, "élément") : ""}"><span class="wk7-wd">${k === 0 ? "Auj." : esc(wdCourt(d))}</span><span class="wk7-n">${pd(d).getDate()}</span><span class="sd-dots">${points(l)}</span></button>`;
  }).join("")}</div>`;
}
/** Partie Mes sections : une tuile par section, couleur de son conducteur. */
function zoneSections() {
  const tops = visKids("root");
  const dossiers = tops.filter(n => n.type === "dossier"), autres = tops.filter(n => n.type !== "dossier");
  let h = `<section class="zone" aria-labelledby="z-sections"><div class="zone-head"><span class="zone-ico">${ICON.dossier}</span><h2 class="zone-title" id="z-sections">Mes sections</h2><span class="zone-sub">${plural(dossiers.length, "section")}</span></div>`;
  h += `<div class="sec-grid">${dossiers.map(tuileSection).join("")}<button class="sec sec-new" type="button" data-act="ajout-section">${ICON.plus}<span>Nouvelle section</span></button></div>`;
  if (autres.length) h += `<div class="list carte-liste" style="margin-top:10px">${autres.map(n => rowHTML(n)).join("")}</div>`;
  return h + `</section>`;
}
function tuileSection(n) {
  const subs = visKids(n.id).filter(c => c.type === "dossier").map(c => c.titre || "Sans titre");
  const k = countItems(n.id);
  return `<button class="sec c-${couleurDe(n)}" type="button" data-go="n:${esc(n.id)}"><span class="sec-fil" aria-hidden="true"></span><span class="sec-t">${esc(n.titre || "Sans titre")}</span>${n.info ? `<span class="sec-i">${esc(n.info)}</span>` : ""}${subs.length ? `<span class="sec-s">${esc(subs.slice(0, 4).join(" · "))}${subs.length > 4 ? " …" : ""}</span>` : ""}<span class="sec-n"><span class="count">${k}</span> ${k > 1 ? "éléments" : "élément"}${tagClaude(n)}</span></button>`;
}
function carteClaude() {
  const pend = remarquesEnAttente().length;
  const last = str(D.config.claudePasse);
  return `<section class="block"><div class="block-head"><h2 class="eyebrow">Avec Claude</h2></div><div class="card">
    <p class="card-title">${pend ? plural(pend, "demande") + " à envoyer" : "Rien en attente"}</p>
    <p class="muted">${pend ? "Envoie-les à Claude avec ton tableau depuis l’onglet Claude." : "Une correction, un emploi du temps à rentrer, une question sur un PDF ? Écris-le pour Claude."}</p>
    ${last && fmtStamp(last) ? `<p class="stamp tight">Dernière mise à jour de Claude ${esc(fmtStamp(last))}</p>` : ""}
    <div><button class="btn sm" type="button" data-tab-go="claude">Ouvrir l’onglet Claude</button></div></div></section>`;
}
function resultatsRecherche(q) {
  const nq = norm(q), res = [];
  for (const id of S.vis) { const n = S.N.get(id); if (norm(n.titre + " " + n.info + " " + n.texte + " " + n.lieu).includes(nq)) res.push(n); }
  res.sort((a, b) => ((norm(a.titre).includes(nq) ? 0 : 1) - (norm(b.titre).includes(nq) ? 0 : 1)) || a.titre.localeCompare(b.titre, "fr"));
  const fs = [...S.F.values()].filter(f => fichierVisible(f) && norm(f.nom).includes(nq));
  if (!res.length && !fs.length) return `<div class="block"><p class="quiet">Rien ne correspond à « ${esc(q)} ».</p></div>`;
  let h = "";
  if (fs.length) h += `<section class="block"><div class="block-head"><h2 class="eyebrow">${plural(fs.length, "fichier")}</h2></div><div class="fstrip">${fs.slice(0, 20).map(f => tuile(f)).join("")}</div></section>`;
  if (res.length) h += `<section class="block"><div class="block-head"><h2 class="eyebrow">${plural(res.length, "résultat")}</h2></div><div class="list">${res.slice(0, 60).map(n => rowHTML(n, {path: true})).join("")}</div></section>`;
  return h;
}

/* ---------- dossiers et éléments ---------- */
function vueNoeud(id, date) {
  const n = S.N.get(id);
  if (!n) return barreRetour(null) + `<div class="notice"><p class="notice-title">Introuvable</p><p class="muted">Cet élément n’existe plus. Il a peut-être été supprimé définitivement.</p></div>`;
  if (!S.vis.has(id)) return barreRetour(null) + `<div class="notice"><p class="notice-title">Dans la corbeille</p><p class="muted">« ${esc(n.titre)} » ou un de ses dossiers est dans la corbeille.</p><button class="btn" type="button" data-go="corbeille">Ouvrir la corbeille</button></div>`;
  return n.type === "dossier" ? vueDossier(n) : vueElement(n, date);
}
function vueDossier(n) {
  ST.dernierDossier = n.id;
  const ks = visKids(n.id);
  let h = barreRetour(n) + `<header class="page-head">${crumbsHTML(n)}<h1 class="h1">${esc(n.titre || "Sans titre")}</h1>${n.info ? `<p class="page-info">${esc(n.info)}</p>` : ""}${tagClaude(n) ? `<div class="badges">${tagClaude(n)}</div>` : ""}</header>`;
  if (n.texte) h += `<div class="prose intro">${md(n.texte, n.id)}</div>`;
  if (ectsDe(n) != null) h += blocNotes(n);
  else h += blocMoyenne(n);
  if (ks.length) h += `<div class="bus">${ks.map(k => rowHTML(k, {bus: true})).join("")}</div>`;
  else if (!fichiersDe(n.id).length) h += `<div class="empty"><p><strong>Ce dossier est vide.</strong></p><p class="muted">Ajoute un cours, une tâche, un événement, une photo ou un PDF. Tu peux aussi demander à Claude de le remplir.</p><button class="btn sm" type="button" data-act="ajout-ici" data-id="${esc(n.id)}">${ICON.plus}<span>Ajouter ici</span></button></div>`;
  h += `<div class="block">${blocFichiers(n.id)}</div>`;
  return h;
}
function blocNotes(n) {
  const m = moyenne(n.evaluations);
  const lignes = n.evaluations.map(e => `<button class="eval" type="button" data-act="eval" data-id="${esc(n.id)}" data-eval="${esc(e.id)}"><span class="eval-t">${esc(e.titre || "Évaluation")}</span><span class="eval-m">${[e.date ? F_DM.format(pd(e.date)) : "", "coef " + fmtNombre(e.coef, 2)].filter(Boolean).join(" · ")}</span><span class="eval-n">${fmtNombre(e.note, 2)}/${fmtNombre(e.sur, 0)}</span></button>`).join("");
  return `<section class="card" style="margin-bottom:16px"><div class="block-head"><h2 class="eyebrow">Mes notes</h2><button class="link" type="button" data-act="eval-ajout" data-id="${esc(n.id)}">Ajouter une note</button></div>
    ${m != null ? `<div class="moy"><span class="moy-n ${m >= 10 ? "ok" : "ko"}">${fmtNombre(m, 2)}</span><span class="moy-sur">/20 de moyenne</span></div>` : `<p class="muted">Aucune note pour l’instant. Ajoute tes partiels, TD et oraux pour suivre ta moyenne.</p>`}
    ${lignes ? `<div class="evals">${lignes}</div>` : ""}</section>`;
}
function blocMoyenne(n) {
  const r = moyenneDossier(n.id);
  if (r.total < 2) return "";
  return `<section class="card" style="margin-bottom:16px"><h2 class="eyebrow">Moyenne pondérée par les ECTS</h2>${r.moy != null
    ? `<div class="moy"><span class="moy-n ${r.moy >= 10 ? "ok" : "ko"}">${fmtNombre(r.moy, 2)}</span><span class="moy-sur">/20 · ${r.notees} UE notée${r.notees > 1 ? "s" : ""} sur ${r.total}</span></div>`
    : `<p class="muted">Ajoute des notes dans les matières pour voir ta moyenne.</p>`}</section>`;
}
function vueElement(n, date) {
  const facts = [];
  const occDate = date || (n.type === "evenement" ? prochaineDate(n) : n.date);
  if (n.type === "tache") {
    facts.push(["Échéance", n.date ? esc(jourLong(n.date)) : "Aucune"]);
    facts.push(["Statut", esc(STATUT_LABEL[n.statut] || "À faire")]);
    if (n.date) facts.push(["Rappel", esc(n.rappel == null ? "Aucun" : (n.rappel === 1440 ? "La veille à 8 h" : "Le jour même à 8 h") + " · " + resumeOptsRappel(optsRappel(n)).toLowerCase())]);
  }
  if (n.type === "evenement") {
    facts.push([n.repete && date ? "Ce jour-là" : "Date", occDate ? esc(jourLong(occDate)) + (n.dateFin && !n.heure ? " → " + esc(F_DM.format(pd(n.dateFin))) : "") : "À fixer"]);
    facts.push(["Heure", n.heure ? esc(fmtHeure(n.heure) + (n.fin ? " – " + fmtHeure(n.fin) : "")) : "Toute la journée"]);
    if (n.lieu) facts.push(["Lieu", `${esc(n.lieu)}<br><button class="link" type="button" data-act="itineraire" data-lieu="${esc(n.lieu)}">Voir sur la carte</button>`]);
    if (n.repete) facts.push(["Répétition", esc(resumeRepetition(n))]);
    facts.push(["Rappel", esc(resumeRappel(n))]);
  }
  const done = n.type === "tache" && n.statut === "fait";
  let h = barreRetour(n, date) + `<article><header class="page-head">${crumbsHTML(n)}<p class="eyebrow kind">${TYPE_LABEL[n.type]}</p><h1 class="h1 h1-item${done ? " struck" : ""}">${esc(n.titre || "Sans titre")}</h1><div class="badges">${pill(n)}${n.epingle ? '<span class="pill cu">' + ICON.epingle + "Épinglé</span>" : ""}${tagClaude(n)}</div></header>`;
  if (facts.length) h += `<dl class="facts">${facts.map(f => `<div><dt>${f[0]}</dt><dd>${f[1]}</dd></div>`).join("")}</dl>`;
  h += n.texte ? `<div class="prose">${md(n.texte, n.id)}</div>` : `<p class="muted">Rien d’écrit pour l’instant.</p>`;
  h += `<div class="actions">${n.type === "tache" ? `<button class="btn primary" type="button" data-act="toggle" data-id="${esc(n.id)}">${done ? "Remettre à faire" : "Marquer comme fait"}</button>` : ""}<button class="btn" type="button" data-act="modifier" data-id="${esc(n.id)}"${date ? ` data-date="${date}"` : ""}>Modifier</button>${estCours(n) ? `<button class="btn" type="button" data-act="prop-revision" data-id="${esc(n.id)}">${ICON.evenement}<span>Caler une révision</span></button>` : ""}${estExamen(n) && (n.type === "tache" ? n.date : prochaineDate(n)) > today() ? `<button class="btn" type="button" data-act="prop-examen" data-id="${esc(n.id)}">${ICON.evenement}<span>Préparer cet examen</span></button>` : ""}<button class="btn" type="button" data-act="epingler" data-id="${esc(n.id)}">${ICON.epingle}<span>${n.epingle ? "Désépingler" : "Épingler"}</span></button><button class="btn" type="button" data-act="demander" data-id="${esc(n.id)}">${ICON.claude}<span>Demander à Claude</span></button>${n.repete && date ? `<button class="btn danger" type="button" data-act="sauf-jour" data-id="${esc(n.id)}" data-date="${date}">Supprimer ce jour-là</button>` : ""}</div>`;
  h += `<div class="block">${blocFichiers(n.id, "Photos et fichiers")}</div>`;
  if (n.maj && fmtStamp(n.maj)) h += `<p class="stamp">Modifié ${esc(fmtStamp(n.maj))}${n.majPar === "claude" ? " par Claude" : ""}</p>`;
  return h + `</article>`;
}

/* ---------- onglet Fichiers ---------- */
function vueFichiers() {
  const tops = visKids("root").filter(n => n.type === "dossier");
  const filtres = [["tout", "Tout"], ["photos", "Photos"], ["pdf", "PDF"], ["docs", "Documents"], ["nonranges", "Non rangés"], ...tops.map(n => ["s:" + n.id, n.titre])];
  return `<header class="page-head top"><p class="eyebrow">Photos, PDF et documents</p><h1 class="h1">Fichiers</h1></header>
  <div class="search" role="search"><span class="search-ico">${ICON.search}</span><input id="fq" type="search" placeholder="Chercher un fichier" value="${esc(ST.fq)}" autocomplete="off" enterkeyhint="search" aria-label="Chercher un fichier"></div>
  <div class="chips scroll" style="margin-top:12px">${filtres.map(([v, l]) => `<button class="chip sm" type="button" data-act="ffiltre" data-v="${esc(v)}" aria-pressed="${ST.ffiltre === v}">${esc(l)}</button>`).join("")}</div>
  <div id="f-body">${corpsFichiers()}</div>`;
}
function corpsFichiers() {
  let fs = [...S.F.values()].filter(fichierVisible);
  const total = fs.length;
  const v = ST.ffiltre;
  if (v === "photos") fs = fs.filter(estImage);
  else if (v === "pdf") fs = fs.filter(estPdf);
  else if (v === "docs") fs = fs.filter(f => !estImage(f) && !estPdf(f));
  else if (v === "nonranges") fs = fs.filter(f => !f.parent);
  else if (v.startsWith("s:")) { const sid = v.slice(2); fs = fs.filter(f => f.parent && (f.parent === sid || chain(f.parent).some(x => x.id === sid))); }
  const q = norm(ST.fq.trim());
  if (q) fs = fs.filter(f => norm(f.nom + " " + (f.parent ? pathLabel(f.parent) : "")).includes(q));
  fs.sort((a, b) => b.ajoute.localeCompare(a.ajoute));
  if (!total) return `<div class="block"><div class="empty"><p><strong>Aucun fichier pour l’instant.</strong></p><p class="muted">Prends en photo un cours ou un emploi du temps, ajoute les PDF de tes TD. Chaque dossier a ses fichiers, et tu peux les envoyer à Claude.</p><div class="btn-row"><button class="btn sm" type="button" data-act="fab">${ICON.plus}<span>Ajouter un fichier</span></button></div></div></div>`;
  if (!fs.length) return `<div class="block"><p class="quiet">Aucun fichier ne correspond.</p></div>`;
  const groupes = new Map();
  for (const f of fs) { const k = (f.ajoute || "").slice(0, 7) || "?"; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(f); }
  let h = "";
  for (const [k, arr] of groupes) {
    const titre = k === "?" ? "Sans date" : cap(F_MOIS.format(pd(k + "-01")));
    h += `<section class="block"><div class="block-head"><h2 class="eyebrow">${esc(titre)} · ${arr.length}</h2></div><div class="fgrid">${arr.map(f => tuile(f)).join("")}</div></section>`;
  }
  return h;
}

/* ---------- onglet Claude ---------- */
function vueClaude() {
  const pend = remarquesEnAttente();
  const traitees = S.R.filter(r => r.statut === "traitee").sort((a, b) => (b.traitee || b.cree).localeCompare(a.traitee || a.cree));
  const joints = fichiersAEnvoyer();
  const draftF = ST.draftFichiers.map(id => S.F.get(id)).filter(Boolean);
  let h = `<header class="page-head top"><p class="eyebrow">Avec Claude</p><h1 class="h1">Claude</h1><p class="lede">Tes données restent dans ce téléphone. Pour que Claude t’aide : écris ta demande, envoie-la avec le tableau, puis rapporte sa réponse ici.</p></header>`;
  const plantage = str(natif("dernierPlantage"));
  if (plantage) h += `<div class="notice chaud" style="margin-top:8px"><p class="notice-title">L’appli s’est fermée par erreur</p><p>Envoie le rapport à Claude pour qu’il corrige le problème.</p><div class="btn-row"><button class="btn sm primary" type="button" data-act="plantage-envoyer">Envoyer le rapport</button><button class="btn sm" type="button" data-act="plantage-effacer">Ignorer</button></div></div>`;
  h += `<section class="block"><h2 class="eyebrow"><span class="step-n">1</span>Ta demande</h2>
    <form class="card" id="rem-form" novalidate>
      <div class="field"><label for="rem-texte">Ce que Claude doit faire</label><textarea id="rem-texte" rows="3" placeholder="Ex. : voici mon emploi du temps, ajoute mes cours dans le planning">${esc(ST.draftR)}</textarea></div>
      <div class="field"><label for="rem-cible">Concerne</label><select id="rem-cible">${optionsCible()}</select></div>
      <div class="field"><span class="lbl">Joindre une photo ou un fichier</span>
        ${draftF.length ? `<div class="fstrip">${draftF.map(f => `<button class="ft" type="button" data-act="draft-retirer" data-id="${esc(f.id)}" aria-label="Retirer ${esc(f.nom)}"><span class="ft-img">${estImage(f) || (estPdf(f) && f.apercu) ? `<img src="${urlMini(f)}" alt="">` : `<span class="ft-ext">${esc(extDe(f))}</span>`}<span class="ft-badge">Retirer</span></span><span class="ft-nom">${esc(f.nom)}</span></button>`).join("")}</div>` : ""}
        <div class="ajout-fichiers"><button class="btn sm" type="button" data-act="choisir" data-mode="photo" data-ctx="remarque">${ICON.photo}<span>Photo</span></button><button class="btn sm" type="button" data-act="choisir" data-mode="fichiers" data-ctx="remarque">${ICON.fichier}<span>Fichier</span></button><button class="btn sm" type="button" data-act="joindre-tableau">${ICON.trombone}<span>Du tableau</span></button></div>
      </div>
      <div><button class="btn" type="submit" id="rem-ok">Ajouter à l’envoi</button></div>
    </form>
    ${pend.length ? `<ul class="rem-list">${pend.map(remItem).join("")}</ul>` : ""}</section>`;
  h += `<section class="block"><h2 class="eyebrow"><span class="step-n">2</span>Envoyer à Claude</h2><div class="card">
    <p>Le message contient tout ton tableau${pend.length ? ", " + plural(pend.length, "demande") : ""}${joints.length ? " et " + plural(joints.length, "fichier joint", "fichiers joints") : ""}.</p>
    <div class="btn-row"><button class="btn primary" type="button" data-act="envoyer-claude">${ICON.envoyer}<span>Envoyer à Claude</span></button><button class="btn" type="button" data-act="copier-export">${ICON.copier}<span>Copier le texte</span></button></div>
    <p class="hint">Choisis l’appli Claude dans la liste, puis ouvre la conversation de ton Tableau avant d’envoyer.${joints.length ? " Le texte est aussi copié : colle-le si Claude ne l’a pas repris avec les fichiers." : ""}</p></div></section>`;
  h += `<section class="block"><h2 class="eyebrow"><span class="step-n">3</span>Réponse de Claude</h2><form class="card" id="imp-form" novalidate>
    <p class="muted">Dans Claude, appuie longuement sur sa réponse, puis Partager → Tableau. Ou copie le code et colle-le ici.</p>
    <div class="field"><label for="imp-texte">Code de Claude</label><textarea id="imp-texte" class="code" rows="4" spellcheck="false" autocomplete="off" placeholder="{&quot;format&quot;:&quot;tableau-changes&quot;, …}">${esc(ST.draftImp)}</textarea></div>
    <p class="err" id="imp-err"${ST.impErr ? "" : " hidden"}>${esc(ST.impErr)}</p>
    <div class="btn-row"><button class="btn" type="button" data-act="coller-code">Coller</button><button class="btn primary" type="button" data-act="verifier-code">Voir les changements</button></div></form></section>`;
  if (traitees.length) h += `<section class="block"><div class="block-head"><h2 class="eyebrow">Déjà traitées · ${traitees.length}</h2></div><ul class="rem-list">${traitees.slice(0, 30).map(remItem).join("")}</ul></section>`;
  const last = str(D.config.claudePasse);
  if (last && fmtStamp(last)) h += `<p class="stamp">Dernière mise à jour de Claude ${esc(fmtStamp(last))}.</p>`;
  return h;
}
function optionsCible() {
  const opts = [...S.vis].map(id => ({id, label: pathLabel(id)})).sort((a, b) => a.label.localeCompare(b.label, "fr", {sensitivity: "base"}));
  return `<option value="">Tout le tableau</option>` + opts.map(o => `<option value="${esc(o.id)}"${o.id === ST.draftCible ? " selected" : ""}>${esc(o.label)}</option>`).join("");
}
function remItem(r) {
  const target = r.cible && S.vis.has(r.cible)
    ? `<button class="chip sm" type="button" data-go="n:${esc(r.cible)}">${esc(pathLabel(r.cible))}</button>`
    : (r.cibleChemin ? `<span>${esc(r.cibleChemin)}</span>` : "");
  const fs = r.fichiers.map(id => S.F.get(id)).filter(Boolean);
  return `<li class="rem"><p class="rem-text">${esc(r.texte)}</p>${fs.length ? `<div class="fstrip">${fs.map(f => tuile(f)).join("")}</div>` : ""}<div class="rem-meta"><span>${esc(fmtShort(r.cree))}</span>${r.envoyee && r.statut !== "traitee" ? "<span>· envoyée</span>" : ""}${target}${r.statut !== "traitee" ? `<button class="link danger" type="button" data-act="rem-del" data-id="${esc(r.id)}">Retirer</button>` : ""}</div>${r.reponse ? `<div class="rem-reply"><span class="tag-claude">Claude</span><p>${esc(r.reponse)}</p></div>` : ""}</li>`;
}

/* ---------- réglages ---------- */
function vueReglages() {
  const etat = str(natif("etatNotifications")) || (A ? "a-demander" : "inconnu");
  const etatTxt = {oui: "autorisées", bloque: "bloquées par Android", "a-demander": "pas encore autorisées", inconnu: "disponibles dans l’appli Android"}[etat] || etat;
  let esp = {octets: 0, nombre: 0};
  try { esp = JSON.parse(natif("espace") || "{}") || esp; } catch (e) { /* valeur par défaut */ }
  const sems = Object.keys(D.semaines).sort();
  const debut = Number(D.config.debutJour) || 7;
  const lundi = mondayOf(today());
  const derniere = str(D.config.derniereSauvegarde);
  return barreRetour(null) + `<header class="page-head"><h1 class="h1">Paramètres</h1></header>
  <section class="block"><h2 class="eyebrow">Toi</h2><div class="card"><div class="field"><label for="r-prenom">Prénom affiché sur l’accueil</label><input type="text" id="r-prenom" value="${esc(str(D.config.prenom))}" maxlength="40" autocomplete="off"></div></div></section>
  <section class="block"><h2 class="eyebrow">Mises à jour</h2>${sectionMaj()}</section>
  <section class="block"><h2 class="eyebrow">Prise en main</h2><div class="card">
    <fieldset class="field"><legend class="lbl">Je tiens mon téléphone</legend><div class="seg seg2">${[["gauche", "Main gauche"], ["droite", "Main droite"]].map(([v, l]) => `<label><input type="radio" name="r-main" value="${v}"${(D.config.main === "droite" ? "droite" : "gauche") === v ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
    <p class="hint">Le bouton + et les boutons principaux se placent de ce côté, en bas de l’écran.</p></div></section>
  <section class="block"><h2 class="eyebrow">Trajets</h2><div class="card">${champsTrajets()}</div></section>
  <section class="block"><h2 class="eyebrow">Révisions</h2><div class="card">
    <label class="switch" for="r-proposer"><span>Proposer des révisions<small>Après l’ajout d’un cours ou d’un examen, et sur l’accueil</small></span><input type="checkbox" id="r-proposer"${D.config.proposer === false ? "" : " checked"}></label></div></section>
  <section class="block"><h2 class="eyebrow">Rappels</h2><div class="card">
    <label class="switch" for="r-rappels"><span>Rappels sur le téléphone<small>Notifications ${esc(etatTxt)}</small></span><input type="checkbox" id="r-rappels"${D.config.rappels === false ? "" : " checked"}></label>
    ${etat === "a-demander" ? `<div><button class="btn sm primary" type="button" data-act="notif-autoriser">Autoriser les notifications</button></div>` : ""}${etat === "bloque" ? `<div><button class="btn sm primary" type="button" data-act="notif-reglages">Autoriser dans Android</button></div>` : ""}
    <p class="lbl" style="margin:4px 0 0">Par défaut, pour les nouveaux rappels</p>
    <div class="sub-fields" id="p-rappel">${champsRappel("p", rappelDefaut())}</div>
    <div class="btn-row"><button class="btn sm" type="button" data-act="notif-test">${ICON.cloche}<span>Essayer ce rappel</span></button></div>
    <p class="hint">L’essai arrive dans 5 secondes, même si tu quittes l’appli. Chaque événement peut avoir sa propre façon de sonner.</p></div></section>
  <section class="block"><h2 class="eyebrow">Rythme d’alternance</h2><div class="card">
    <p class="muted">${sems.length ? `${plural(sems.length, "semaine")} définie${sems.length > 1 ? "s" : ""}, du ${esc(F_DM.format(pd(sems[0])))} au ${esc(F_DM.format(pd(addDays(sems[sems.length - 1], 6))))} ${sems[sems.length - 1].slice(0, 4)}.` : "Indique tes semaines à l’école et en entreprise : elles s’affichent dans le planning, et un cours peut n’apparaître que les semaines d’école."}</p>
    <form id="f-rythme" class="sub-fields" novalidate>
      <div class="row2"><div class="field"><label for="ry-debut">À partir de la semaine du</label><input type="date" id="ry-debut" value="${lundi}"></div><div class="field"><label for="ry-fin">Jusqu’au</label><input type="date" id="ry-fin" value="${addDays(lundi, 7 * 26)}"></div></div>
      <div class="row3"><div class="field"><label for="ry-ecole">Sem. école</label><input type="number" id="ry-ecole" min="0" max="12" value="2" inputmode="numeric"></div><div class="field"><label for="ry-entreprise">Sem. entreprise</label><input type="number" id="ry-entreprise" min="0" max="12" value="2" inputmode="numeric"></div><div class="field"><label for="ry-premier">Commence par</label><select id="ry-premier"><option value="ecole">École</option><option value="entreprise">Entreprise</option></select></div></div>
      <p class="err" id="ry-err" hidden></p>
      <div class="btn-row"><button class="btn sm primary" type="submit">Remplir ces semaines</button>${sems.length ? `<button class="btn sm danger" type="button" data-act="semaines-effacer">Tout effacer</button>` : ""}</div>
      <p class="hint">Tu peux ensuite corriger une semaine en touchant sa pastille dans le planning. Claude peut aussi le faire à partir du calendrier de ton CFA.</p>
    </form></div></section>
  <section class="block"><h2 class="eyebrow">Planning</h2><div class="card">
    <div class="row2"><div class="field"><label for="r-debut">La journée commence à</label><select id="r-debut">${[6, 7, 8, 9, 10].map(hh => `<option value="${hh}"${hh === debut ? " selected" : ""}>${hh} h</option>`).join("")}</select></div>
    <div class="field"><label for="r-weekend">Week-end dans la semaine</label><select id="r-weekend">${[["auto", "S’il y a quelque chose"], ["oui", "Toujours"], ["non", "Jamais"]].map(([v, l]) => `<option value="${v}"${(D.config.weekend || "auto") === v ? " selected" : ""}>${l}</option>`).join("")}</select></div></div></div></section>
  <section class="block"><h2 class="eyebrow">Sauvegarde</h2><div class="card">
    <p>Tout est dans ce téléphone. Une sauvegarde met le tableau et tous les fichiers dans un seul fichier .zip, à garder sur ton Drive ou ton ordinateur.</p>
    <p class="muted">${derniere && fmtStamp(derniere) ? "Dernière sauvegarde " + esc(fmtStamp(derniere)) + "." : "Aucune sauvegarde pour l’instant."}${esp.nombre ? " " + plural(esp.nombre, "fichier") + " · " + esc(fmtTaille(esp.octets)) + "." : ""}</p>
    <div class="btn-row"><button class="btn sm primary" type="button" data-act="sauvegarder">${ICON.telecharger}<span>Sauvegarder</span></button><button class="btn sm" type="button" data-act="restaurer">${ICON.restaurer}<span>Restaurer une sauvegarde</span></button></div></div></section>
  <section class="block"><h2 class="eyebrow">Aide</h2><div class="card">
    <div class="btn-row"><button class="btn sm" type="button" data-go="aide">Mode d’emploi</button><button class="btn sm" type="button" data-act="nouveautes-revoir">Nouveautés</button><button class="btn sm" type="button" data-act="astuces-revoir">Revoir les astuces</button></div></div></section>
  <p class="stamp">Tableau ${esc(INFOS.version || VERSION_NOUVEAUTES)}${INFOS.android ? " · Android " + esc(INFOS.android) : ""}${INFOS.appareil ? " · " + esc(INFOS.appareil) : ""}</p>`;
}

const DUREES_TRAJET = [20, 30, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120];
const fmtDureeMin = m => m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + pad2(m % 60) : "");
function champsTrajets() {
  const tr = reglagesTrajets();
  const opts = v => optionsListe(DUREES_TRAJET.map(m => [m, fmtDureeMin(m)]), v, " min");
  return `<label class="switch" for="r-traj-actif"><span>Ajouter les trajets<small>Avant et après tes journées de cours et de travail</small></span><input type="checkbox" id="r-traj-actif"${tr.actif ? " checked" : ""}></label>
    <div class="row2"><div class="field"><label for="r-traj-domicile">Tu pars de</label><input type="text" id="r-traj-domicile" value="${esc(tr.domicile)}" maxlength="40" placeholder="Ta ville" autocomplete="off"></div><div class="field"><label for="r-traj-ville">Tu vas à</label><input type="text" id="r-traj-ville" value="${esc(tr.ville)}" maxlength="40" placeholder="Ville des cours" autocomplete="off"></div></div>
    <div class="field"><label for="r-traj-lieux">Lieux qui demandent un trajet</label><input type="text" id="r-traj-lieux" value="${esc(tr.lieux.join(", "))}" maxlength="300" placeholder="Ex. : fac, nom de l’entreprise" autocomplete="off"><p class="hint">Un événement dont le lieu contient un de ces mots a son trajet, en plus des cours et du travail.</p></div>
    <div class="field"><label for="r-traj-desc">Ton trajet en une phrase</label><input type="text" id="r-traj-desc" value="${esc(tr.description)}" maxlength="300" placeholder="Ex. : train puis tram" autocomplete="off"></div>
    <div class="row2"><div class="field"><label for="r-traj-aller">Aller, porte à porte</label><select id="r-traj-aller">${opts(tr.aller)}</select></div><div class="field"><label for="r-traj-retour">Retour</label><select id="r-traj-retour">${opts(tr.retour)}</select></div></div>
    <label class="switch" for="r-traj-rappel"><span>Rappel au moment de partir<small>Avec la façon de sonner par défaut</small></span><input type="checkbox" id="r-traj-rappel"${tr.rappel ? " checked" : ""}></label>
    <p class="hint">Pas de trajet pour un cours en visio : écris « visio » dans son titre ou son lieu.</p>`;
}

/* ---------- corbeille et aide ---------- */
function vueCorbeille() {
  let h = barreRetour(null) + `<header class="page-head"><h1 class="h1">Corbeille</h1><p class="lede">Ce que tu mets à la corbeille reste ici tant que tu ne le supprimes pas définitivement.</p></header>`;
  const items = [...S.N.values()].filter(n => n.corbeille).sort((a, b) => b.maj.localeCompare(a.maj));
  const fs = [...S.F.values()].filter(f => f.corbeille).sort((a, b) => b.maj.localeCompare(a.maj));
  if (!items.length && !fs.length) return h + `<div class="empty"><p>La corbeille est vide.</p></div>`;
  h += `<ul class="rem-list">${items.map(n => {
    const p = parentOf(n), nd = collectDesc(n.id, new Set()).size;
    return `<li class="rem"><p class="rem-text"><strong>${esc(n.titre || "Sans titre")}</strong></p><div class="rem-meta"><span>${TYPE_LABEL[n.type]}${nd ? ` · ${plural(nd, "élément")} dedans` : ""}</span><span>Était dans ${esc(p === "root" ? "Accueil" : pathLabel(p))}</span></div><div class="actions tight"><button class="btn sm" type="button" data-act="restore" data-id="${esc(n.id)}">Restaurer</button><button class="btn sm danger" type="button" data-act="purge" data-id="${esc(n.id)}">Supprimer définitivement</button></div></li>`;
  }).join("")}${fs.map(f => `<li class="rem"><p class="rem-text"><strong>${esc(f.nom)}</strong></p><div class="rem-meta"><span>Fichier · ${esc(fmtTaille(f.taille))}</span>${f.parent && S.N.has(f.parent) ? `<span>Était dans ${esc(pathLabel(f.parent))}</span>` : ""}</div><div class="actions tight"><button class="btn sm" type="button" data-act="f-restore" data-id="${esc(f.id)}">Restaurer</button><button class="btn sm danger" type="button" data-act="f-purge" data-id="${esc(f.id)}">Supprimer définitivement</button></div></li>`).join("")}</ul>`;
  return h + `<div class="actions"><button class="btn danger" type="button" data-act="vider-corbeille">Vider la corbeille</button></div>`;
}
function vueAide() {
  return barreRetour(null) + `<header class="page-head"><h1 class="h1">Mode d’emploi</h1></header><div class="prose">
  <h3>L’accueil</h3><p>En haut, la partie <strong>Planning</strong> : ce qui arrive, le reste de ta journée et les 7 prochains jours (touche un jour pour l’ouvrir). En dessous, <strong>Mes sections</strong> : Master, Planning, Autre, Moi… La recherche et le bouton + sont en bas de l’écran, sous le pouce.</p>
  <h3>Ranger</h3><p>Le tableau est fait de sections. Dans chaque section il y a des dossiers, et dans les dossiers des notes, des tâches, des événements, des photos et des PDF.</p>
  <h3>Ajouter</h3><p>Le bouton + ajoute ce que tu veux là où tu te trouves : un événement, une tâche, une note, une photo prise sur le moment, une image de ta galerie ou un PDF. Le bouton pour valider est en bas de la fenêtre. Paramètres › Prise en main place les boutons côté main gauche ou droite.</p>
  <h3>Gestes</h3><ul>
  <li>Glisse vers la gauche ou la droite pour passer d’un onglet à l’autre.</li>
  <li>Dans un dossier ou un élément, glisse vers la droite pour revenir en arrière.</li>
  <li>Dans le planning, glisser change de jour, de semaine ou de mois.</li>
  <li>Toucher encore l’onglet où tu es remonte en haut de la page.</li></ul>
  <h3>Planning</h3><ul>
  <li>Jour, Semaine, Mois, Liste et Aujourd’hui sont dans la barre du bas. Touche une case vide de la grille pour créer un événement à cette heure-là.</li>
  <li>Les pastilles d’agenda (École, Sport…) filtrent le planning. Touche encore la même pour tout revoir.</li>
  <li>Un événement peut se répéter (chaque semaine, du lundi au vendredi…) et n’apparaître que les semaines d’école ou d’entreprise.</li>
  <li>La pastille de la semaine dit si tu es à l’école ou en entreprise. Le rythme complet se remplit dans Paramètres.</li></ul>
  <h3>Mises à jour</h3><ul>
  <li>Quand une nouvelle version sort, une carte apparaît en haut de l’accueil : « Mettre à jour » télécharge la version, Android te demande de confirmer, et tes données restent en place.</li>
  <li>La première fois, Android demande d’autoriser le Tableau à installer des mises à jour : active « Autoriser cette source », puis reviens.</li>
  <li>Paramètres › Mises à jour : vérifier à la main, ou couper la vérification automatique.</li></ul>
  <h3>Révisions</h3><ul>
  <li>Quand tu ajoutes un cours (Master › Cours ou Planning › École), le Tableau propose de caler une révision sur un créneau libre : le soir même, le lendemain ou la veille du cours suivant, chaque semaine si le cours se répète.</li>
  <li>Pour un partiel, un oral ou un rendu, il propose 3 séances : une semaine avant, trois jours avant et la veille.</li>
  <li>Les révisions vont dans Planning › Révisions. Les cours sans révision s’affichent dans « À caler » sur l’accueil.</li></ul>
  <h3>Trajets</h3><ul>
  <li>Avant et après chaque journée de cours ou de travail sur place, le planning ajoute ton trajet (1 h 05 par défaut) et un rappel sonne quand il faut partir.</li>
  <li>Durées et rappel : Paramètres › Trajets. Un cours en visio n’a pas de trajet.</li></ul>
  <h3>Rappels</h3><ul>
  <li>Pour chaque événement ou tâche : quand (à l’heure, 10 min avant, la veille…), comment (discret, vibreur, sonnerie ou alarme), combien de temps il sonne ou vibre, et combien de fois il se répète.</li>
  <li>Dans la notification, « Arrêter » coupe le son et les répétitions, « Dans 10 min » le repousse. L’ouvrir compte comme vu.</li>
  <li>La façon de sonner par défaut se règle dans Paramètres, avec un bouton pour l’essayer.</li></ul>
  <h3>Photos et PDF</h3><p>Chaque dossier et chaque élément a ses fichiers. Touche une miniature pour l’ouvrir en grand, deux fois pour zoomer, et « Ouvrir » pour la passer à une autre appli. Tu peux aussi partager une photo ou un PDF depuis n’importe quelle appli vers Tableau.</p>
  <h3>Avec Claude</h3><ul>
  <li>Dans l’onglet Claude, écris ta demande et joins si besoin une photo ou un PDF (ton emploi du temps, un sujet de TD…).</li>
  <li>Appuie sur Envoyer à Claude et choisis l’appli Claude : il reçoit le tableau et les fichiers.</li>
  <li>Il te répond avec un code. Dans Claude, appuie longuement sur sa réponse → Partager → Tableau, ou copie-la et colle-la dans l’onglet Claude. Tu vois les changements avant de les appliquer, et tu peux annuler juste après.</li>
  <li>Ce qu’il vient de changer porte l’étiquette <span class="tag-claude">Claude</span>.</li></ul>
  <h3>Tes données</h3><p>Tout est enregistré dans ce téléphone, sans internet. Fais une sauvegarde de temps en temps (Paramètres) : elle contient aussi les photos et les PDF. Une nouvelle version de l’appli s’installe par-dessus en gardant tout.</p></div>`;
}
function ecranErreur(e) {
  return `<div class="block"><div class="notice"><p class="notice-title">Cet écran n’a pas pu s’afficher</p><p class="muted">${esc(e && e.message || "Erreur inconnue")}</p><div class="btn-row"><button class="btn sm" type="button" data-tab-go="accueil">Retour à l’accueil</button><button class="btn sm" type="button" data-tab-go="claude">Prévenir Claude</button></div></div></div>`;
}
