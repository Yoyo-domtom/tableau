"use strict";
/* Données du tableau : chargement, migration, index, occurrences du planning, rappels, échanges avec Claude. */

/* ---------- pont Android (window.Android) ; dans un navigateur, localStorage ---------- */
const A = (window.Android && typeof window.Android === "object") ? window.Android : null;
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
function natif(nom, ...args) {
  if (!A || typeof A[nom] !== "function") return undefined;
  try { return A[nom](...args); } catch (e) { noterErreur("natif " + nom + " : " + (e && e.message)); return undefined; }
}
let INFOS = {};
try { INFOS = JSON.parse(natif("infos") || "{}") || {}; } catch (e) { INFOS = {}; }

/* ---------- journal d'erreurs (joint aux envois à Claude) ---------- */
let ERREURS = [];
try { ERREURS = JSON.parse(lsGet("tableau.erreurs") || "[]"); if (!Array.isArray(ERREURS)) ERREURS = []; } catch (e) { ERREURS = []; }
function noterErreur(m) {
  ERREURS.push({t: new Date().toISOString(), m: String(m).slice(0, 400)});
  ERREURS = ERREURS.slice(-8);
  lsSet("tableau.erreurs", JSON.stringify(ERREURS));
}
window.addEventListener("error", e => noterErreur((e.message || "erreur") + " · " + String(e.filename || "").split("/").pop() + ":" + (e.lineno || 0)));
window.addEventListener("unhandledrejection", e => noterErreur("promesse : " + ((e.reason && e.reason.message) || e.reason)));

/* ---------- modèle ---------- */
const TYPES = ["dossier", "note", "tache", "evenement"];
const TYPE_LABEL = {dossier: "Dossier", note: "Note", tache: "Tâche", evenement: "Événement"};
const STATUT_LABEL = {"a-faire": "À faire", "en-cours": "En cours", "fait": "Fait"};
const WIRES = ["marron", "noir", "gris", "bleu", "vertjaune", "violet", "rouge"];
const WIRE_LABEL = {marron: "Marron", noir: "Noir", gris: "Gris", bleu: "Bleu", vertjaune: "Vert-jaune", violet: "Violet", rouge: "Rouge"};
const SEMAINES = {ecole: "École", entreprise: "Entreprise", conges: "Congés", examens: "Examens"};
const NODE_KEYS = ["parent", "type", "titre", "texte", "info", "date", "heure", "fin", "dateFin", "lieu", "statut", "couleur", "ordre", "corbeille", "epingle", "rappel", "rappelMode", "rappelDuree", "rappelFois", "rappelEcart", "repete", "evaluations"];
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE_RE = /^\d{2}:\d{2}$/;
const NOM_FICHIER_RE = /^[A-Za-z0-9_-]{1,64}(\.[A-Za-z0-9]{1,8})?$/;
const MODES_RAPPEL = {discret: "Discret", vibreur: "Vibreur", sonnerie: "Sonnerie", alarme: "Alarme"};
const RAPPEL_DEFAUT = {mode: "sonnerie", duree: 0, fois: 1, ecart: 10};
/* Trajets ajoutés autour des journées de cours et de travail (minutes). ville, domicile, lieux et description viennent des réglages de chacun. */
const TRAJETS_DEFAUT = {actif: true, aller: 65, retour: 65, rappel: true, ville: "", domicile: "", lieux: [], description: ""};
const CHAMPS_TRAJETS = Object.keys(TRAJETS_DEFAUT);

let D = null;
const S = {N: new Map(), kids: new Map(), vis: new Set(), F: new Map(), fpar: new Map(), R: [], erreurChargement: false};

const num = x => {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(",", "."));
  return isFinite(n) ? n : null;
};
function cleanRepete(r) {
  if (!r || typeof r !== "object") return null;
  const freq = ["jour", "semaine", "mois"].includes(r.freq) ? r.freq : null;
  if (!freq) return null;
  const jours = Array.isArray(r.jours) ? r.jours.map(Number).filter(j => j >= 1 && j <= 7) : [];
  return {
    freq,
    intervalle: Math.max(1, Math.min(12, parseInt(r.intervalle, 10) || 1)),
    jours: [...new Set(jours)].sort((a, b) => a - b),
    jusqua: DATE_RE.test(str(r.jusqua)) ? r.jusqua : "",
    sauf: Array.isArray(r.sauf) ? r.sauf.filter(d => DATE_RE.test(str(d))) : [],
    semaines: ["ecole", "entreprise"].includes(r.semaines) ? r.semaines : ""
  };
}
function cleanEvals(a) {
  if (!Array.isArray(a)) return [];
  return a.filter(e => e && typeof e === "object").map((e, i) => ({
    id: ID_RE.test(str(e.id)) ? e.id : "e" + i,
    titre: str(e.titre),
    note: num(e.note),
    sur: num(e.sur) || 20,
    coef: num(e.coef) == null ? 1 : num(e.coef),
    date: DATE_RE.test(str(e.date)) ? e.date : ""
  })).filter(e => e.note != null);
}
function entreOuNul(x, a, b) {
  const n = num(x);
  return n == null ? null : Math.round(Math.max(a, Math.min(b, n)));
}
function cleanRappel(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function cleanNode(id, v) {
  return {
    id,
    parent: str(v.parent) || "root",
    type: TYPES.includes(v.type) ? v.type : "note",
    titre: str(v.titre), texte: str(v.texte), info: str(v.info), lieu: str(v.lieu),
    date: DATE_RE.test(str(v.date)) ? v.date : "",
    heure: HEURE_RE.test(str(v.heure)) ? v.heure : "",
    fin: HEURE_RE.test(str(v.fin)) ? v.fin : "",
    dateFin: DATE_RE.test(str(v.dateFin)) ? v.dateFin : "",
    statut: str(v.statut),
    couleur: WIRES.includes(v.couleur) ? v.couleur : "",
    ordre: Number(v.ordre) || 0,
    corbeille: v.corbeille === true,
    epingle: v.epingle === true,
    rappel: cleanRappel(v.rappel),
    rappelMode: MODES_RAPPEL[v.rappelMode] ? v.rappelMode : "",
    rappelDuree: entreOuNul(v.rappelDuree, 0, 600),
    rappelFois: entreOuNul(v.rappelFois, 1, 10),
    rappelEcart: entreOuNul(v.rappelEcart, 1, 120),
    repete: cleanRepete(v.repete),
    evaluations: cleanEvals(v.evaluations),
    cree: str(v.cree), maj: str(v.maj), majPar: str(v.majPar)
  };
}
function cleanFile(id, v) {
  return {
    id,
    parent: str(v.parent),
    fichier: NOM_FICHIER_RE.test(str(v.fichier)) ? v.fichier : "",
    nom: str(v.nom) || "Fichier",
    mime: str(v.mime) || "application/octet-stream",
    taille: Number(v.taille) || 0,
    w: Number(v.w) || 0, h: Number(v.h) || 0,
    pages: Number(v.pages) || 0,
    apercu: v.apercu === true,
    protege: v.protege === true,
    corbeille: v.corbeille === true,
    ajoute: str(v.ajoute), maj: str(v.maj), majPar: str(v.majPar)
  };
}
const cleanRem = (id, v) => ({
  id, texte: str(v.texte), cible: str(v.cible), cibleChemin: str(v.cibleChemin),
  fichiers: Array.isArray(v.fichiers) ? v.fichiers.map(str).filter(x => ID_RE.test(x)) : [],
  statut: str(v.statut) || "en-attente", reponse: str(v.reponse), cree: str(v.cree), traitee: str(v.traitee), envoyee: str(v.envoyee)
});

/* ---------- chargement, migration, écriture ---------- */
function donneesDepart() {
  const s = window.TABLEAU_SEED || {nodes: [], config: {}};
  const nodes = {};
  for (const n of s.nodes || []) {
    if (n && ID_RE.test(str(n.id))) { const v = Object.assign({}, n); delete v.id; nodes[n.id] = v; }
  }
  return {v: 1, nodes, remarques: {}, config: Object.assign({prenom: ""}, s.config || {})};
}
function charger() {
  const raw = A ? str(natif("charger")) : (lsGet("tableau.data") || "");
  let d = null, neuf = false;
  if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } }
  if (!d || typeof d !== "object" || !d.nodes || typeof d.nodes !== "object") {
    if (raw) S.erreurChargement = true;
    d = donneesDepart();
    neuf = true;
  }
  const migre = migrer(d);
  D = d;
  if (neuf || migre) ecrire();
  reindexer();
}
function migrer(d) {
  let change = false;
  for (const k of ["remarques", "fichiers", "semaines", "config"]) {
    if (!d[k] || typeof d[k] !== "object" || Array.isArray(d[k])) { d[k] = {}; change = true; }
  }
  if (!d.v || d.v < 2) {
    const ec = d.nodes["planning-ecole"];
    if (ec && typeof ec === "object" && !ec.couleur) ec.couleur = "bleu";
    d.v = 2;
    change = true;
  }
  if (d.v < 3) {
    if (!d.config.rappelDefaut || typeof d.config.rappelDefaut !== "object") d.config.rappelDefaut = Object.assign({}, RAPPEL_DEFAUT);
    delete d.config.nouveautes;
    d.v = 3;
    change = true;
  }
  if (d.v < 4) {
    // 2.2 : trajets automatiques, propositions de révision, main qui tient le téléphone.
    if (!d.config.trajets || typeof d.config.trajets !== "object") d.config.trajets = Object.assign({}, TRAJETS_DEFAUT);
    if (d.config.main !== "droite") d.config.main = "gauche";
    if (!d.config.propositions || typeof d.config.propositions !== "object") d.config.propositions = {};
    d.v = 4;
    change = true;
  }
  return change;
}
function ecrire() {
  const json = JSON.stringify(D);
  return A ? !!natif("enregistrer", json) : lsSet("tableau.data", json);
}
/** Enregistre, recalcule les index, redessine, reprogramme les rappels. */
function sauver(msg) {
  const ok = ecrire();
  reindexer();
  render();
  if (!ok) toast("Pas enregistré : le téléphone a refusé l’écriture. Réessaie.");
  else if (msg) toast(typeof msg === "string" ? msg : msg.text, msg && msg.action);
  programmerRappels();
  return ok;
}
const maintenantIso = () => new Date().toISOString();
const tampon = (qui = "nathan") => ({maj: maintenantIso(), majPar: qui});

/* ---------- index ---------- */
const parentOf = n => (n.parent && n.parent !== "root" && n.parent !== n.id && S.N.has(n.parent)) ? n.parent : "root";
function sortKids(a, b) {
  const ra = a.type === "dossier" ? 0 : 1, rb = b.type === "dossier" ? 0 : 1;
  if (ra !== rb) return ra - rb;
  if (ra === 0) return (a.ordre - b.ordre) || a.titre.localeCompare(b.titre, "fr", {sensitivity: "base"});
  const fa = a.type === "tache" && a.statut === "fait" ? 1 : 0, fb = b.type === "tache" && b.statut === "fait" ? 1 : 0;
  if (fa !== fb) return fa - fb;
  const ka = a.date ? a.date + (a.heure || "99:99") : "9999", kb = b.date ? b.date + (b.heure || "99:99") : "9999";
  if (ka !== kb) return ka < kb ? -1 : 1;
  return (a.ordre - b.ordre) || a.cree.localeCompare(b.cree);
}
const fichierVisible = f => !f.corbeille && (!f.parent || S.vis.has(f.parent));
function reindexer() {
  S.N = new Map();
  for (const id of Object.keys(D.nodes)) {
    const v = D.nodes[id];
    if (v && typeof v === "object" && ID_RE.test(id)) S.N.set(id, cleanNode(id, v));
  }
  S.kids = new Map();
  for (const n of S.N.values()) { const p = parentOf(n); if (!S.kids.has(p)) S.kids.set(p, []); S.kids.get(p).push(n); }
  for (const arr of S.kids.values()) arr.sort(sortKids);
  S.vis = new Set();
  const pile = ["root"];
  while (pile.length) {
    const id = pile.pop();
    for (const c of S.kids.get(id) || []) { if (c.corbeille || S.vis.has(c.id)) continue; S.vis.add(c.id); pile.push(c.id); }
  }
  S.F = new Map();
  for (const id of Object.keys(D.fichiers)) {
    const v = D.fichiers[id];
    if (v && typeof v === "object" && ID_RE.test(id)) { const f = cleanFile(id, v); if (f.fichier) S.F.set(id, f); }
  }
  S.fpar = new Map();
  for (const f of S.F.values()) {
    if (!fichierVisible(f)) continue;
    const p = f.parent || "";
    if (!S.fpar.has(p)) S.fpar.set(p, []);
    S.fpar.get(p).push(f);
  }
  for (const arr of S.fpar.values()) arr.sort((a, b) => b.ajoute.localeCompare(a.ajoute));
  S.R = Object.keys(D.remarques).map(id => cleanRem(id, D.remarques[id] || {}));
}
const visKids = id => (S.kids.get(id) || []).filter(c => S.vis.has(c.id));
function chain(id) {
  const out = []; let cur = S.N.get(id), g = 0;
  while (cur && g++ < 50) { out.unshift(cur); const p = parentOf(cur); if (p === "root") break; cur = S.N.get(p); }
  return out;
}
const pathLabel = (id, self = true) => { const c = chain(id); if (!self) c.pop(); return c.map(n => n.titre || "Sans titre").join(" › "); };
function countItems(id) { let k = 0; for (const c of visKids(id)) k += c.type === "dossier" ? countItems(c.id) : 1; return k; }
function collectDesc(id, set) { for (const c of S.kids.get(id) || []) { if (!set.has(c.id)) { set.add(c.id); collectDesc(c.id, set); } } return set; }
function couleurDe(n) {
  let cur = n, g = 0;
  while (cur && g++ < 50) {
    if (cur.couleur) return cur.couleur;
    const p = parentOf(cur);
    if (p === "root") break;
    cur = S.N.get(p);
  }
  return "gris";
}
/** Agenda d'un élément pour le planning : sous-dossier de Planning (École, Sport…) ou section du haut. */
function agendaDe(n) {
  const c = chain(n.id);
  if (!c.length) return null;
  if (norm(c[0].titre) === "planning" && c.length > 1 && c[1].type === "dossier") return c[1];
  return c[0].type === "dossier" ? c[0] : null;
}
const dossiersVisibles = (excl = new Set()) => [...S.vis].map(i => S.N.get(i)).filter(x => x && x.type === "dossier" && !excl.has(x.id))
  .map(x => ({id: x.id, label: pathLabel(x.id)})).sort((a, b) => a.label.localeCompare(b.label, "fr", {sensitivity: "base"}));
const remarquesEnAttente = () => S.R.filter(r => r.statut !== "traitee").sort((a, b) => b.cree.localeCompare(a.cree));

/* ---------- planning : occurrences ---------- */
function occ(n, date) {
  const journee = n.type === "tache" || !n.heure;
  const s = journee ? 0 : toMin(n.heure);
  let e = journee ? 0 : (n.fin ? toMin(n.fin) : s + 60);
  if (!journee && e <= s) e = Math.min(s + 60, 24 * 60);
  return {n, date, journee, s, e, cle: n.id + "@" + date, tache: n.type === "tache"};
}
const cmpOcc = (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)
  || (x.journee !== y.journee ? (x.journee ? -1 : 1) : 0)
  || x.s - y.s || x.n.titre.localeCompare(y.n.titre, "fr");
const typeSemaine = d => str(D.semaines[mondayOf(d)]);
function etendre(n, de, a, out) {
  const r = n.repete, debut = n.date;
  const fin = r.jusqua && r.jusqua < a ? r.jusqua : a;
  if (fin < debut || fin < de) return;
  const sauf = new Set(r.sauf);
  const jours = r.jours.length ? r.jours : [isoDow(debut)];
  const lundi0 = mondayOf(debut), jourMois = pd(debut).getDate();
  for (let d = debut > de ? debut : de; d <= fin; d = addDays(d, 1)) {
    if (sauf.has(d)) continue;
    let ok;
    if (r.freq === "jour") ok = diffDays(debut, d) % r.intervalle === 0;
    else if (r.freq === "semaine") ok = jours.includes(isoDow(d)) && Math.round(diffDays(lundi0, mondayOf(d)) / 7) % r.intervalle === 0;
    else ok = pd(d).getDate() === jourMois && monthsBetween(debut, d) % r.intervalle === 0;
    if (ok && r.semaines) { const t = typeSemaine(d); if (t && t !== r.semaines) ok = false; }
    if (ok) out.push(occ(n, d));
  }
}
/** Tout ce qui tombe entre deux dates (incluses) : événements, répétitions, tâches datées. */
function occurrences(de, a, seul) {
  const out = [];
  const ids = seul ? [seul] : S.vis;
  for (const id of ids) {
    const n = S.N.get(id);
    if (!n || !n.date) continue;
    if (n.type === "evenement") {
      if (n.repete) etendre(n, de, a, out);
      else if (n.dateFin && n.dateFin > n.date && !n.heure) {
        for (let d = n.date > de ? n.date : de; d <= a && d <= n.dateFin; d = addDays(d, 1)) out.push(occ(n, d));
      } else if (n.date >= de && n.date <= a) out.push(occ(n, n.date));
    } else if (n.type === "tache" && n.date >= de && n.date <= a) out.push(occ(n, n.date));
  }
  return out.sort(cmpOcc);
}
function prochaineDate(n) {
  if (n.type !== "evenement" || !n.date) return n.date;
  if (!n.repete) return n.date;
  const t = today(), o = occurrences(t > n.date ? t : n.date, addDays(t > n.date ? t : n.date, 400), n.id);
  return o.length ? o[0].date : "";
}
function tachesUrgentes() {
  const t = today();
  return [...S.vis].map(id => S.N.get(id)).filter(n => n.type === "tache" && n.statut !== "fait" && n.date && n.date <= t)
    .sort((a, b) => a.date.localeCompare(b.date));
}
function fmtPlage(o) {
  if (o.journee) return o.tache ? "À rendre" : "Toute la journée";
  return fmtMin(o.s) + " – " + fmtMin(o.e);
}
function resumeRepetition(n) {
  const r = n.repete;
  if (!r) return "";
  let t;
  if (r.freq === "jour") t = r.intervalle > 1 ? "Tous les " + r.intervalle + " jours" : "Tous les jours";
  else if (r.freq === "mois") t = (r.intervalle > 1 ? "Tous les " + r.intervalle + " mois" : "Chaque mois") + " le " + pd(n.date).getDate();
  else {
    const j = r.jours.length ? r.jours : [isoDow(n.date)];
    const noms = j.join() === "1,2,3,4,5" ? "du lundi au vendredi" : "le " + j.map(x => JOURS_NOM[x - 1]).join(", ").replace(/, ([^,]*)$/, " et $1");
    t = (r.intervalle === 2 ? "Une semaine sur deux, " : r.intervalle > 2 ? "Toutes les " + r.intervalle + " semaines, " : "Chaque semaine, ") + noms;
  }
  if (r.semaines) t += ", semaines " + (r.semaines === "ecole" ? "école" : "entreprise") + " seulement";
  if (r.jusqua) t += ", jusqu’au " + F_DM.format(pd(r.jusqua)) + " " + r.jusqua.slice(0, 4);
  return t;
}
const LABEL_RAPPEL = {0: "À l’heure", 5: "5 min avant", 10: "10 min avant", 15: "15 min avant", 30: "30 min avant", 60: "1 h avant", 120: "2 h avant", 1440: "La veille"};
/* Façon de sonner : réglage de l'élément, sinon celui par défaut (Paramètres). */
function rappelDefaut() {
  const c = D.config.rappelDefaut && typeof D.config.rappelDefaut === "object" ? D.config.rappelDefaut : {};
  return {
    mode: MODES_RAPPEL[c.mode] ? c.mode : RAPPEL_DEFAUT.mode,
    duree: entreOuNul(c.duree, 0, 600) == null ? RAPPEL_DEFAUT.duree : entreOuNul(c.duree, 0, 600),
    fois: entreOuNul(c.fois, 1, 10) == null ? RAPPEL_DEFAUT.fois : entreOuNul(c.fois, 1, 10),
    ecart: entreOuNul(c.ecart, 1, 120) == null ? RAPPEL_DEFAUT.ecart : entreOuNul(c.ecart, 1, 120)
  };
}
function optsRappel(n) {
  const d = rappelDefaut();
  return {mode: n.rappelMode || d.mode, duree: n.rappelDuree != null ? n.rappelDuree : d.duree, fois: n.rappelFois != null ? n.rappelFois : d.fois, ecart: n.rappelEcart != null ? n.rappelEcart : d.ecart};
}
const fmtDuree = s => !s ? "une fois" : s < 60 ? s + " s" : fmtNombre(s / 60, 1) + " min";
function resumeOptsRappel(o) {
  const p = [MODES_RAPPEL[o.mode] || "Sonnerie"];
  if (o.mode !== "discret" && o.duree) p.push((o.mode === "vibreur" ? "vibre " : "sonne ") + fmtDuree(o.duree));
  if (o.fois > 1) p.push(o.fois + " fois, toutes les " + o.ecart + " min");
  return p.join(" · ");
}
const resumeRappel = n => n.rappel == null ? "Aucun" : (LABEL_RAPPEL[n.rappel] || n.rappel + " min avant") + " · " + resumeOptsRappel(optsRappel(n)).toLowerCase();

/* ---------- rappels (programmés par Android) ---------- */
let rappelsTimer = null;
function programmerRappels() { clearTimeout(rappelsTimer); rappelsTimer = setTimeout(envoyerRappels, 700); }
const instant = (iso, min) => { const d = pd(iso); d.setHours(0, min, 0, 0); return d.getTime(); };
function envoyerRappels() {
  if (!A) return;
  if (D.config.rappels === false) { natif("planifierRappels", "[]"); return; }
  const now = Date.now(), t = today(), liste = [];
  for (const o of occurrences(t, addDays(t, 30))) {
    const n = o.n;
    if (n.rappel == null || (o.tache && n.statut === "fait")) continue;
    const op = optsRappel(n);
    const base = (o.journee ? instant(o.date, 8 * 60) : instant(o.date, o.s)) - n.rappel * 60000;
    const quand = cap(relDayDepuis(o.date, base));
    const texte = o.tache ? "À rendre " + quand.toLowerCase() : [quand + (o.journee ? "" : " · " + fmtPlage(o)), n.lieu].filter(Boolean).join(" · ");
    const fois = Math.max(1, Math.min(10, op.fois || 1));
    for (let k = 0; k < fois; k++) {
      const at = base + k * (op.ecart || 10) * 60000;
      if (at < now) continue;
      liste.push({at, titre: n.titre || "Rappel", texte: k ? texte + " · rappel " + (k + 1) + "/" + fois : texte, aller: n.id, cle: o.cle, mode: op.mode, duree: Math.round(op.duree || 0)});
    }
  }
  // Départ : un rappel à l'heure où commence le trajet aller.
  const tr = reglagesTrajets();
  if (tr.actif && tr.rappel) {
    const op = rappelDefaut(), parJour = new Map();
    for (const o of occurrences(t, addDays(t, 30))) { if (!parJour.has(o.date)) parJour.set(o.date, []); parJour.get(o.date).push(o); }
    for (const [date, os] of parJour) {
      const aller = trajetsJour(date, os).find(x => x.sens === "aller");
      if (!aller) continue;
      const at = instant(date, aller.s);
      if (at < now) continue;
      const premier = aller.pour;
      liste.push({at, titre: "C’est l’heure de partir", texte: (tr.ville ? "Trajet vers " + tr.ville + " · " : "Trajet · ") + (premier ? premier.n.titre + " à " + fmtMin(premier.s) : "arrivée à " + fmtMin(aller.e)), aller: premier ? premier.n.id : "", cle: "trajet@" + date, mode: op.mode, duree: Math.round(op.duree || 0)});
    }
  }
  liste.sort((a, b) => a.at - b.at);
  natif("planifierRappels", JSON.stringify(liste.slice(0, 60)));
}
function relDayDepuis(date, at) {
  const jourAlarme = isoDay(new Date(at));
  if (date === jourAlarme) return "aujourd’hui";
  if (date === addDays(jourAlarme, 1)) return "demain";
  return F_DAY.format(pd(date));
}

/* ---------- fichiers ---------- */
const urlFichier = f => "/f/" + encodeURIComponent(f.fichier);
const urlMini = f => "/m/" + encodeURIComponent(f.id);
const urlPage = (f, i, w) => "/p/" + encodeURIComponent(f.fichier) + "/" + i + "?w=" + w;
const estImage = f => f.mime.startsWith("image/") && f.apercu;
const estPdf = f => f.mime === "application/pdf" || /\.pdf$/i.test(f.fichier);
const extDe = f => (f.fichier.split(".").pop() || "").toUpperCase().slice(0, 5);
const fichiersDe = id => S.fpar.get(id) || [];
function ajouterFichiers(liste, parent) {
  const now = maintenantIso(), ids = [];
  for (const m of liste) {
    if (!m || !ID_RE.test(str(m.id)) || !NOM_FICHIER_RE.test(str(m.fichier))) continue;
    D.fichiers[m.id] = {
      parent: parent || "", fichier: m.fichier, nom: str(m.nom) || "Fichier", mime: str(m.mime),
      taille: Number(m.taille) || 0, w: Number(m.w) || 0, h: Number(m.h) || 0, pages: Number(m.pages) || 0,
      apercu: m.apercu === true, protege: m.protege === true, ajoute: now, corbeille: false, maj: now, majPar: "nathan"
    };
    ids.push(m.id);
  }
  return ids;
}
function supprimerFichiersDefinitivement(ids) {
  const noms = [];
  for (const id of ids) { const f = D.fichiers[id]; if (f) { if (NOM_FICHIER_RE.test(str(f.fichier))) noms.push(f.fichier); delete D.fichiers[id]; } }
  if (noms.length) natif("supprimerFichiers", JSON.stringify(noms));
}

/* ---------- notes de matières ---------- */
function moyenne(evals) {
  let s = 0, c = 0;
  for (const e of evals) { if (e.note == null || !e.sur) continue; const k = e.coef == null ? 1 : e.coef; s += e.note / e.sur * 20 * k; c += k; }
  return c > 0 ? s / c : null;
}
const ectsDe = n => { const m = /(\d+(?:[.,]\d+)?)\s*ECTS/i.exec(n.info || ""); return m ? parseFloat(m[1].replace(",", ".")) : null; };
function moyenneDossier(id) {
  let s = 0, c = 0, notees = 0, total = 0;
  const parcourir = pid => {
    for (const k of visKids(pid)) {
      if (k.type !== "dossier") continue;
      const e = ectsDe(k);
      if (e != null && !visKids(k.id).some(x => x.type === "dossier" && ectsDe(x) != null)) {
        total++;
        const m = moyenne(k.evaluations);
        if (m != null) { s += m * e; c += e; notees++; }
      } else parcourir(k.id);
    }
  };
  parcourir(id);
  return {moy: c > 0 ? s / c : null, notees, total};
}

/* ---------- échanges avec Claude ---------- */
const POUR_CLAUDE = "Réponds avec un seul bloc JSON qui commence par {\"format\":\"tableau-changes\",\"version\":2, puis les champs utiles : "
  + "nodes (éléments à créer ou modifier : id + seulement les champs à écrire), corbeille (ids), fichiers ([{id, parent, nom}] pour ranger ou renommer), "
  + "semaines ({\"AAAA-MM-JJ du lundi\": \"ecole\"|\"entreprise\"|\"conges\"|\"examens\"|\"\"}), remarques ([{id, statut:\"traitee\", reponse}]). "
  + "Champs d’un élément : parent (id du dossier ou \"root\"), type (dossier|note|tache|evenement), titre, texte (markdown simple, « - [ ] » pour une case), info, "
  + "date (AAAA-MM-JJ), heure et fin (HH:MM), dateFin (événement sur plusieurs jours), lieu, statut (a-faire|en-cours|fait), couleur (marron|noir|gris|bleu|vertjaune|violet|rouge), "
  + "rappel (minutes avant, -1 pour aucun), rappelMode (discret|vibreur|sonnerie|alarme), rappelDuree (secondes de sonnerie ou vibration en boucle, 0 = une fois), rappelFois (nombre de rappels), rappelEcart (minutes entre deux rappels), repete ({freq: jour|semaine|mois, intervalle, jours [1=lundi…7], jusqua, sauf [dates], semaines: ecole|entreprise}), "
  + "evaluations ([{titre, note, sur, coef, date}]), epingle. Nouvel id : minuscules, chiffres et tirets.";
function compactNode(n) {
  const o = {id: n.id};
  for (const k of NODE_KEYS) {
    const v = n[k];
    if (v === "" || v === false || v === 0 || v == null) continue;
    if (k === "parent" && v === "root") { o.parent = "root"; continue; }
    if (Array.isArray(v) && !v.length) continue;
    if (k === "repete") {
      const r = {freq: v.freq};
      if (v.intervalle > 1) r.intervalle = v.intervalle;
      if (v.jours.length) r.jours = v.jours;
      if (v.jusqua) r.jusqua = v.jusqua;
      if (v.sauf.length) r.sauf = v.sauf;
      if (v.semaines) r.semaines = v.semaines;
      o.repete = r;
      continue;
    }
    if (k === "evaluations") { o.evaluations = v.map(e => ({titre: e.titre, note: e.note, sur: e.sur, coef: e.coef, date: e.date || undefined})); continue; }
    o[k] = v;
  }
  if (n.rappel === 0) o.rappel = 0;
  if (n.rappelDuree === 0) o.rappelDuree = 0;
  if (n.majPar === "claude") o.majPar = "claude";
  return o;
}
function exportObjet() {
  const pend = remarquesEnAttente();
  const o = {
    format: "tableau", version: 2, exporte: maintenantIso(),
    appli: {version: INFOS.version || "2.0", android: INFOS.android || "", aujourdhui: today()},
    pourClaude: POUR_CLAUDE,
    config: {prenom: str(D.config.prenom)},
    semaines: D.semaines,
    remarques: pend.map(r => ({id: r.id, texte: r.texte, cible: r.cible || undefined, cibleChemin: r.cibleChemin || undefined, fichiers: r.fichiers.length ? r.fichiers : undefined})),
    fichiers: [...S.F.values()].filter(f => !f.corbeille).map(f => ({id: f.id, parent: f.parent || "", nom: f.nom, type: f.mime, taille: f.taille, pages: f.pages || undefined})),
    nodes: [...S.N.values()].map(compactNode)
  };
  const plantage = str(natif("dernierPlantage"));
  if (ERREURS.length || plantage) o.erreurs = {page: ERREURS, plantage: plantage ? plantage.slice(0, 4000) : undefined};
  return o;
}
function fichiersAEnvoyer() {
  const ids = [], vus = new Set();
  for (const r of remarquesEnAttente()) for (const id of r.fichiers) if (!vus.has(id) && S.F.has(id) && !S.F.get(id).corbeille) { vus.add(id); ids.push(id); }
  return ids.slice(0, 20).map(id => S.F.get(id));
}
function exportTexte(joints) {
  const pend = remarquesEnAttente();
  let t = "Voici mon Tableau (appli Android " + (INFOS.version || "2.0") + ").";
  if (pend.length) t += "\nMes demandes :\n" + pend.map(r => "- " + r.texte + (r.cibleChemin ? " (" + r.cibleChemin + ")" : "")).join("\n");
  else t += " Pas de demande en attente.";
  if (joints && joints.length) t += "\nFichiers joints :\n" + joints.map(f => "- " + f.nom + " (id " + f.id + ")").join("\n");
  return t + "\n\n" + JSON.stringify(exportObjet());
}
/** Trouve le bloc JSON du Tableau dans un texte (message de Claude copié ou partagé). */
function extraireJson(texte) {
  const i = texte.indexOf('"format"');
  if (i < 0) return null;
  const debut = texte.lastIndexOf("{", i);
  if (debut < 0) return null;
  let prof = 0, dansChaine = false, echap = false;
  for (let k = debut; k < texte.length; k++) {
    const ch = texte[k];
    if (dansChaine) {
      if (echap) echap = false;
      else if (ch === "\\") echap = true;
      else if (ch === '"') dansChaine = false;
      continue;
    }
    if (ch === '"') dansChaine = true;
    else if (ch === "{") prof++;
    else if (ch === "}") { prof--; if (prof === 0) return texte.slice(debut, k + 1); }
  }
  return null;
}
function analyserCode(texte) {
  const brut = String(texte || "");
  let trouve = false;
  // Le texte tel quel d'abord ; puis avec les guillemets typographiques redressés, si une appli les a changés.
  for (const t of [brut, brut.replace(/[“”]/g, '"')]) {
    const j = extraireJson(t);
    if (!j) continue;
    trouve = true;
    let o;
    try { o = JSON.parse(j); } catch (e) { continue; }
    if (o && o.format === "tableau-changes") return {kind: "changes", obj: o};
    if (o && o.format === "tableau" && Array.isArray(o.nodes)) return {kind: "full", obj: o};
    throw new Error("Ce n’est pas un code du Tableau.");
  }
  throw new Error(trouve ? "Le code est incomplet ou abîmé. Recopie tout le bloc." : "Aucun code trouvé. Copie tout le bloc que Claude t’a donné.");
}
function coerce(k, v) {
  if (k === "ordre") return Number(v) || 0;
  if (k === "corbeille" || k === "epingle") return v === true;
  if (k === "rappel") return cleanRappel(v);
  if (k === "repete") return cleanRepete(v);
  if (k === "evaluations") return cleanEvals(v).map(e => Object.assign(e, {id: newId("e")}));
  if (k === "rappelDuree") return entreOuNul(v, 0, 600);
  if (k === "rappelFois") return entreOuNul(v, 1, 10);
  if (k === "rappelEcart") return entreOuNul(v, 1, 120);
  if (k === "rappelMode") return MODES_RAPPEL[v] ? v : "";
  return str(v);
}
const blankNode = now => ({parent: "root", type: "note", titre: "", texte: "", info: "", date: "", heure: "", fin: "", dateFin: "", lieu: "", statut: "", couleur: "", ordre: 0, corbeille: false, epingle: false, rappel: null, rappelMode: "", rappelDuree: null, rappelFois: null, rappelEcart: null, repete: null, evaluations: [], cree: now, maj: now, majPar: ""});
const titreDe = id => { const n = D.nodes[id]; return n ? (str(n.titre) || "Sans titre") : id; };
function apercuChangements(c) {
  const l = [];
  for (const n of (Array.isArray(c.nodes) ? c.nodes : [])) {
    if (!n || !ID_RE.test(str(n.id))) continue;
    if (D.nodes[n.id]) l.push({k: "modif", t: titreDe(n.id) + " · " + Object.keys(n).filter(k => k !== "id").map(k => k === "repete" ? "répétition" : k).join(", ")});
    else if (str(n.titre).trim()) l.push({k: "ajout", t: str(n.titre) + (n.parent && D.nodes[n.parent] ? " → " + pathLabel(n.parent) : (n.date ? " · " + F_DAY.format(pd(n.date)) : ""))});
  }
  for (const id of (Array.isArray(c.corbeille) ? c.corbeille : [])) if (D.nodes[str(id)]) l.push({k: "corbeille", t: titreDe(str(id))});
  for (const f of (Array.isArray(c.fichiers) ? c.fichiers : [])) {
    if (!f || !D.fichiers[str(f.id)]) continue;
    l.push({k: "fichier", t: str(D.fichiers[f.id].nom) + (f.parent && D.nodes[f.parent] ? " → " + pathLabel(f.parent) : (f.nom ? " → « " + f.nom + " »" : ""))});
  }
  if (c.semaines && typeof c.semaines === "object") { const k = Object.keys(c.semaines).filter(x => DATE_RE.test(x)).length; if (k) l.push({k: "semaines", t: plural(k, "semaine") + " d’alternance"}); }
  if (c.config && typeof c.config === "object") {
    if (c.config.trajets && typeof c.config.trajets === "object" && Object.keys(c.config.trajets).some(k => CHAMPS_TRAJETS.includes(k))) l.push({k: "réglages", t: "Trajets : " + Object.keys(c.config.trajets).filter(k => CHAMPS_TRAJETS.includes(k)).join(", ")});
    if (str(c.config.prenom).trim()) l.push({k: "réglages", t: "Prénom : " + str(c.config.prenom).trim()});
  }
  const rems = (Array.isArray(c.remarques) ? c.remarques : []).filter(r => r && D.remarques[str(r.id)]);
  if (rems.length) l.push({k: "demandes", t: plural(rems.length, "demande traitée", "demandes traitées")});
  return l;
}
function appliquerChangements(c) {
  const now = maintenantIso(), s = {ajout: 0, modif: 0, corbeille: 0, fichiers: 0, semaines: 0, rem: 0};
  for (const n of (Array.isArray(c.nodes) ? c.nodes : [])) {
    if (!n || !ID_RE.test(str(n.id))) continue;
    const prev = D.nodes[n.id], patch = {};
    for (const k of NODE_KEYS) if (k in n) patch[k] = coerce(k, n[k]);
    if (prev) { D.nodes[n.id] = Object.assign({}, prev, patch, {maj: now, majPar: "claude"}); s.modif++; }
    else if (str(n.titre).trim()) {
      if (!("ordre" in n)) {
        const p = str(patch.parent) || "root";
        const freres = Object.values(D.nodes).filter(x => x && (str(x.parent) || "root") === p);
        patch.ordre = freres.length ? Math.max(0, ...freres.map(x => Number(x.ordre) || 0)) + 1 : 0;
      }
      D.nodes[n.id] = Object.assign(blankNode(now), patch, {majPar: "claude"});
      s.ajout++;
    }
  }
  for (const id of (Array.isArray(c.corbeille) ? c.corbeille : [])) {
    const prev = D.nodes[str(id)];
    if (prev && prev.corbeille !== true) { D.nodes[str(id)] = Object.assign({}, prev, {corbeille: true, maj: now, majPar: "claude"}); s.corbeille++; }
  }
  for (const f of (Array.isArray(c.fichiers) ? c.fichiers : [])) {
    const prev = f && D.fichiers[str(f.id)];
    if (!prev) continue;
    const patch = {maj: now, majPar: "claude"};
    if ("parent" in f && (f.parent === "" || D.nodes[str(f.parent)])) patch.parent = str(f.parent);
    if (str(f.nom).trim()) patch.nom = str(f.nom).trim();
    if ("corbeille" in f) patch.corbeille = f.corbeille === true;
    D.fichiers[f.id] = Object.assign({}, prev, patch);
    s.fichiers++;
  }
  if (c.semaines && typeof c.semaines === "object") {
    for (const k of Object.keys(c.semaines)) {
      if (!DATE_RE.test(k)) continue;
      const lundi = mondayOf(k), v = str(c.semaines[k]);
      if (SEMAINES[v]) D.semaines[lundi] = v; else delete D.semaines[lundi];
      s.semaines++;
    }
  }
  for (const r of (Array.isArray(c.remarques) ? c.remarques : [])) {
    const prev = r && D.remarques[str(r.id)];
    if (!prev) continue;
    const statut = str(r.statut) || "traitee";
    D.remarques[r.id] = Object.assign({}, prev, {statut, reponse: str(r.reponse), traitee: statut === "traitee" ? now : ""});
    s.rem++;
  }
  if (c.config && typeof c.config === "object") {
    if (str(c.config.prenom).trim()) D.config.prenom = str(c.config.prenom).trim().slice(0, 40);
    const t = c.config.trajets;
    if (t && typeof t === "object") {
      const tr = Object.assign({}, D.config.trajets && typeof D.config.trajets === "object" ? D.config.trajets : TRAJETS_DEFAUT);
      for (const k of CHAMPS_TRAJETS) if (k in t) tr[k] = t[k];
      D.config.trajets = Object.assign({}, tr, reglagesTrajetsDe(tr));
      s.reglages = 1;
    }
  }
  D.config.claudePasse = now;
  const parts = [];
  if (s.ajout) parts.push(plural(s.ajout, "ajout"));
  if (s.modif) parts.push(plural(s.modif, "modification"));
  if (s.corbeille) parts.push(s.corbeille + " à la corbeille");
  if (s.fichiers) parts.push(plural(s.fichiers, "fichier rangé", "fichiers rangés"));
  if (s.semaines) parts.push(plural(s.semaines, "semaine"));
  if (s.rem) parts.push(plural(s.rem, "demande traitée", "demandes traitées"));
  if (s.reglages) parts.push("réglages des trajets");
  return parts.length ? "Mis à jour : " + parts.join(", ") : "Rien à changer dans ce code";
}
/**
 * Ajouts préparés par Claude et livrés avec l'appli (assets/pack.js) : appliqués une seule fois,
 * sans toucher à ce qui existe déjà (un id déjà présent, même à la corbeille, est laissé tel quel).
 */
function appliquerPacks() {
  const packs = Array.isArray(window.TABLEAU_PACKS) ? window.TABLEAU_PACKS : [];
  if (!D.config.packs || typeof D.config.packs !== "object" || Array.isArray(D.config.packs)) D.config.packs = {};
  const res = {ajouts: 0, avant: null, ids: [], titres: []};
  for (const p of packs) {
    if (!p || !ID_RE.test(str(p.id)) || D.config.packs[p.id]) continue;
    if (!res.avant) res.avant = JSON.stringify(D);
    const nouveaux = (Array.isArray(p.nodes) ? p.nodes : []).filter(n => n && ID_RE.test(str(n.id)) && !D.nodes[n.id] && str(n.titre).trim());
    const ids = new Set(nouveaux.map(n => n.id));
    const secours = D.nodes.autre ? "autre" : "root";
    const nodes = nouveaux.map(n => (!n.parent || n.parent === "root" || D.nodes[n.parent] || ids.has(n.parent)) ? n : Object.assign({}, n, {parent: secours}));
    // Mises à jour : seulement les éléments écrits par Claude et pas retouchés depuis.
    const maj = (Array.isArray(p.maj) ? p.maj : []).filter(m => m && D.nodes[str(m.id)] && !ids.has(m.id) && D.nodes[m.id].majPar === "claude");
    if (nodes.length || maj.length) appliquerChangements({nodes: nodes.concat(maj)});
    D.config.packs[p.id] = maintenantIso();
    res.ajouts += nodes.length;
    res.titres.push(...nodes.map(n => str(n.titre)));
    res.ids.push(p.id);
  }
  if (res.ids.length) ecrire();
  return res;
}
function restaurerComplet(o) {
  const now = maintenantIso(), nodes = {}, rems = {};
  for (const n of o.nodes) {
    if (!n || !ID_RE.test(str(n.id))) continue;
    const v = blankNode(now);
    for (const k of NODE_KEYS) if (k in n) v[k] = coerce(k, n[k]);
    v.majPar = n.majPar === "claude" ? "claude" : "";
    nodes[n.id] = v;
  }
  const k = Object.keys(nodes).length;
  if (!k) throw new Error("Cette sauvegarde est vide : rien n’a été remplacé.");
  for (const r of (Array.isArray(o.remarques) ? o.remarques : [])) {
    if (!r || !ID_RE.test(str(r.id))) continue;
    rems[r.id] = {texte: str(r.texte), cible: str(r.cible), cibleChemin: str(r.cibleChemin), fichiers: Array.isArray(r.fichiers) ? r.fichiers : [], statut: str(r.statut) || "en-attente", reponse: str(r.reponse), cree: str(r.cree) || now, traitee: str(r.traitee)};
  }
  D.nodes = nodes;
  D.remarques = rems;
  if (o.semaines && typeof o.semaines === "object") D.semaines = o.semaines;
  for (const f of (Array.isArray(o.fichiers) ? o.fichiers : [])) {
    const prev = f && D.fichiers[str(f.id)];
    if (prev) D.fichiers[f.id] = Object.assign({}, prev, {parent: str(f.parent), nom: str(f.nom) || prev.nom});
  }
  if (o.config && str(o.config.prenom)) D.config.prenom = str(o.config.prenom);
  return "Tableau restauré : " + plural(k, "élément");
}
