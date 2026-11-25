"use strict";
/* Trajets automatiques (domicile ⇄ lieu de cours ou de travail) et propositions de révision. */

/* ---------- trajets ---------- */
const texteCourt = (v, max) => str(v).replace(/\s+/g, " ").trim().slice(0, max);
const reglagesTrajets = () => reglagesTrajetsDe(D.config.trajets);
/** Réglages des trajets nettoyés (valeurs bornées, textes courts). */
function reglagesTrajetsDe(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const a = entreOuNul(c.aller, 5, 180), r = entreOuNul(c.retour, 5, 180);
  return {actif: c.actif !== false, aller: a == null ? TRAJETS_DEFAUT.aller : a, retour: r == null ? TRAJETS_DEFAUT.retour : r, rappel: c.rappel !== false,
    ville: texteCourt(c.ville, 40), domicile: texteCourt(c.domicile, 40), description: texteCourt(c.description, 300),
    lieux: (Array.isArray(c.lieux) ? c.lieux : []).map(x => norm(texteCourt(x, 40))).filter(Boolean).slice(0, 12)};
}
const RE_DISTANCE = /visio|distanciel|[àa] distance|en ligne|teams|zoom|maison|domicile|t[ée]l[ée]travail/i;
const RE_LIEU_SUR_PLACE = /\bfac\b|campus|universit|b[âa]t(iment|\.)?\s*\d|amphi/i;
const RE_AGENDA_SUR_PLACE = /^(ecole|cours|fac|universite|entreprise|travail|alternance|stage)\b/;
/** Un événement qui oblige à se déplacer : cours, oraux, travail, ou lieu reconnu (réglages Trajets). */
function demandeTrajet(n) {
  if (!n || n.type !== "evenement" || !n.heure || estRevision(n)) return false;
  if (RE_DISTANCE.test(n.titre + " " + n.lieu)) return false;
  const lieu = norm(n.lieu), tr = reglagesTrajets();
  if (RE_LIEU_SUR_PLACE.test(n.lieu) || (tr.ville && lieu.includes(norm(tr.ville))) || tr.lieux.some(x => lieu.includes(x))) return true;
  const c = chain(n.id);
  if (c.some(x => x.id === "master-cours" || x.id === "master-oraux")) return true;
  const ag = agendaDe(n);
  return !!ag && norm(c[0] && c[0].titre) === "planning" && RE_AGENDA_SUR_PLACE.test(norm(ag.titre).trim());
}
const TRAJET_NOEUD = {
  aller: {id: "trajet-aller", type: "trajet", titre: "Trajet aller", texte: "", lieu: "", couleur: "gris", statut: "", repete: null, rappel: null},
  retour: {id: "trajet-retour", type: "trajet", titre: "Trajet retour", texte: "", lieu: "", couleur: "gris", statut: "", repete: null, rappel: null}
};
/** Blocs de trajet d'une journée, d'après ses occurrences (aller avant le premier rendez-vous sur place, retour après le dernier). */
function trajetsJour(date, occs) {
  const tr = reglagesTrajets();
  if (!tr.actif) return [];
  let premier = null, dernier = null;
  for (const o of occs) {
    if (o.date !== date || o.journee || o.virtuel || !demandeTrajet(o.n)) continue;
    if (!premier || o.s < premier.s) premier = o;
    if (!dernier || o.e > dernier.e) dernier = o;
  }
  if (!premier) return [];
  const res = [];
  const s0 = Math.max(0, premier.s - tr.aller);
  if (s0 < premier.s) res.push({n: TRAJET_NOEUD.aller, date, journee: false, s: s0, e: premier.s, cle: "trajet-aller@" + date, tache: false, virtuel: true, sens: "aller", pour: premier});
  const e1 = Math.min(24 * 60 - 1, dernier.e + tr.retour);
  if (e1 > dernier.e) res.push({n: TRAJET_NOEUD.retour, date, journee: false, s: dernier.e, e: e1, cle: "trajet-retour@" + date, tache: false, virtuel: true, sens: "retour", pour: dernier});
  return res;
}
/** Ajoute les trajets aux occurrences d'une période. */
function avecTrajets(occs) {
  if (!reglagesTrajets().actif) return occs;
  const jours = new Map();
  for (const o of occs) { if (!jours.has(o.date)) jours.set(o.date, []); jours.get(o.date).push(o); }
  const plus = [];
  for (const [d, os] of jours) plus.push(...trajetsJour(d, os));
  return plus.length ? occs.concat(plus).sort(cmpOcc) : occs;
}

/* ---------- cours, partiels, révisions ---------- */
const RE_REVISION = /r[ée]vis/i;
const RE_EXAMEN = /(^|[^a-zà-ÿ])(partiels?|examens?|exams?|contr[ôo]les?|ds|soutenance|oral|oraux|rendu|[ée]valuation|qcm|tp not[ée]|interro)([^a-zà-ÿ]|$)/i;
const estRevision = n => !!n && (RE_REVISION.test(n.titre) || chain(n.id).some(x => x.id === "planning-revisions"));
const estExamen = n => !!n && (n.type === "evenement" || n.type === "tache") && !estRevision(n) && RE_EXAMEN.test(n.titre);
/** Cours : dans Master › Cours ou Oraux, ou dans un agenda Planning › École (ou Cours, Fac…). */
function estScolaire(n) {
  const c = chain(n.id);
  if (c.some(x => x.id === "master-cours" || x.id === "master-oraux")) return true;
  const ag = agendaDe(n);
  return !!ag && !!c[0] && norm(c[0].titre) === "planning" && /^(ecole|cours|fac|universite)\b/.test(norm(ag.titre).trim());
}
const estCours = n => !!n && n.type === "evenement" && !!n.heure && !estRevision(n) && !estExamen(n) && estScolaire(n);
const titreCourt = t => str(t).replace(/\s*\((cm|td|tp|cours|amphi)\)\s*$/i, "").trim() || str(t);

/** Dossier Planning › Révisions (créé s'il manque). */
function dossierRevisions() {
  const ex = S.N.get("planning-revisions");
  if (ex && S.vis.has(ex.id)) return ex.id;
  if (D.nodes["planning-revisions"]) { D.nodes["planning-revisions"] = Object.assign({}, D.nodes["planning-revisions"], {corbeille: false}); reindexer(); return "planning-revisions"; }
  const pl = visKids("root").find(n => n.type === "dossier" && (n.id === "planning" || norm(n.titre) === "planning"));
  const now = maintenantIso();
  D.nodes["planning-revisions"] = Object.assign(blankNode(now), {parent: pl ? pl.id : "root", type: "dossier", titre: "Révisions", couleur: "rouge", info: "Calées depuis tes cours et tes partiels", ordre: pl ? visKids(pl.id).length + 1 : 9});
  reindexer();
  return "planning-revisions";
}

/* ---------- créneaux libres ---------- */
const FENETRES = {semaine: [[17 * 60 + 30, 22 * 60]], weekend: [[9 * 60 + 30, 12 * 60 + 30], [14 * 60, 19 * 60]]};
function occupe(date) {
  const os = occurrences(date, date).filter(o => !o.journee);
  return os.concat(trajetsJour(date, os)).map(o => [o.s, o.e]);
}
/** Premier créneau libre d'une durée donnée ce jour-là (le soir en semaine, matin ou après-midi le week-end). */
function creneauLibre(date, duree, apres) {
  const t = today();
  if (date < t) return null;
  const fen = isoDow(date) >= 6 ? FENETRES.weekend : FENETRES.semaine;
  const pris = occupe(date);
  let min = apres || 0;
  if (date === t) min = Math.max(min, nowMin() + 20);
  for (const [a, b] of fen) {
    for (let s = Math.max(a, Math.ceil(min / 15) * 15); s + duree <= b; s += 15) {
      const e = s + duree;
      if (!pris.some(([x, y]) => s < y + 15 && e > x - 15)) return {date, s, e};
    }
  }
  return null;
}
function prochaineOcc(n) {
  const d = prochaineDate(n);
  return d ? occurrences(d, d, n.id)[0] || null : null;
}
function suggestionsCours(n, duree) {
  const o = prochaineOcc(n);
  if (!o) return [];
  const res = [], vus = new Set();
  const essai = (label, date, apres) => {
    if (vus.has(date) || res.length >= 3) return;
    const c = creneauLibre(date, duree, apres);
    if (c) { vus.add(date); res.push(Object.assign({label}, c)); }
  };
  const fin = o.e + (demandeTrajet(n) && reglagesTrajets().actif ? reglagesTrajets().retour : 0);
  essai("Le soir même", o.date, fin);
  essai("Le lendemain", addDays(o.date, 1), 0);
  if (n.repete) {
    const suiv = occurrences(addDays(o.date, 1), addDays(o.date, 8), n.id)[0];
    if (suiv) essai("La veille du cours suivant", addDays(suiv.date, -1), 0);
  }
  const samedi = addDays(o.date, (13 - isoDow(o.date)) % 7 || 7);
  essai("Le week-end", samedi, 0);
  essai("Le week-end", addDays(samedi, 1), 0);
  return res;
}
const libelleCreneau = c => cap(relDay(c.date)) + " · " + fmtMin(c.s) + " – " + fmtMin(c.e);

/* ---------- proposition après un cours ---------- */
const DUREES_REV = [30, 45, 60, 90];
function listeCreneaux(sug) {
  if (!sug.length) return `<p class="muted" style="margin:0">Pas de créneau libre ces jours-ci. Choisis-en un toi-même.</p>`;
  return sug.map((c, i) => `<label><input type="radio" name="prop-c" value="${i}"${i === 0 ? " checked" : ""}><span class="prop-c"><b>${esc(c.label)}</b><span>${esc(libelleCreneau(c))}</span></span></label>`).join("");
}
/** Révisions déjà calées pour la même matière (titre proche). */
function revisionsDe(n) {
  const cle = norm(titreCourt(n.titre));
  return [...S.vis].map(i => S.N.get(i)).filter(r => r.type === "evenement" && estRevision(r) && norm(r.titre).includes(cle));
}
const ligneAjoute = (n, quoi) => `<p class="prop-ok">${ICON.check}<span>${esc(quoi)} ajouté dans ${esc(pathLabel(parentOf(n)))}</span></p>`;
function feuilleRevision(id, opt = {}) {
  const n = S.N.get(id);
  if (!n) return;
  const duree = (ST.revision && ST.revision.id === id && ST.revision.duree) || 45;
  const sug = suggestionsCours(n, duree);
  ST.revision = {id, duree, sug};
  const o = prochaineOcc(n);
  const quand = o ? cap(relDay(o.date)) + " · " + fmtPlage(o) : "";
  const serie = n.repete ? `<label class="switch" for="prop-serie"><span>Chaque semaine<small>Le même jour, ${n.repete.semaines ? "les semaines " + (n.repete.semaines === "ecole" ? "d’école" : "en entreprise") + " comme le cours" : "comme le cours"}</small></span><input type="checkbox" id="prop-serie" checked></label>` : "";
  const deja = revisionsDe(n);
  const corps = `${opt.ajoute ? ligneAjoute(n, "Cours") : ""}<div class="prop-cours c-${couleurDe(n)}"><span class="prop-fil" aria-hidden="true"></span><div><p class="prop-t">${esc(n.titre)}</p><p class="prop-m">${esc([quand, n.repete ? resumeRepetition(n).toLowerCase() : ""].filter(Boolean).join(" · "))}</p></div></div>
    <p class="muted" style="margin:0">Tu veux caler un moment pour le réviser ? Voici des créneaux libres, trajets compris.</p>
    ${deja.length ? `<p class="hint" style="margin:-8px 0 0">Déjà calé : ${esc(deja.slice(0, 2).map(r => r.titre + " (" + (r.repete ? resumeRepetition(r).toLowerCase() : relDay(r.date)) + (r.heure ? ", " + fmtHeure(r.heure) : "") + ")").join(" ; "))}</p>` : ""}
    <fieldset class="field"><legend class="lbl">Quand</legend><div class="choix-list" id="prop-creneaux">${listeCreneaux(sug)}</div></fieldset>
    <fieldset class="field"><legend class="lbl">Durée</legend><div class="seg">${DUREES_REV.map(d => `<label><input type="radio" name="prop-duree" value="${d}"${d === duree ? " checked" : ""}><span>${d} min</span></label>`).join("")}</div></fieldset>
    ${serie}
    <p class="err" id="sheet-err" hidden></p>
    <div class="prop-liens"><button class="link" type="button" data-act="prop-autre" data-id="${esc(id)}">Choisir un autre moment</button><button class="link muted-link" type="button" data-act="prop-jamais" data-id="${esc(id)}">Ne plus proposer pour ce cours</button></div>`;
  ouvrirFeuille(formFeuille("f-revision", "Caler une révision ?", corps, sug.length ? "Caler la révision" : "", "Pas maintenant"), "revision");
}
function majCreneaux(duree) {
  const r = ST.revision;
  if (!r) return;
  const n = S.N.get(r.id);
  if (!n) return;
  r.duree = duree;
  r.sug = suggestionsCours(n, duree);
  const l = $("#prop-creneaux");
  if (l) l.innerHTML = listeCreneaux(r.sug);
  const ok = $("#f-revision .sheet-actions .primary");
  if (ok) ok.disabled = !r.sug.length;
}
function marquerProposition(id, valeur) {
  if (!D.config.propositions || typeof D.config.propositions !== "object") D.config.propositions = {};
  D.config.propositions[id] = valeur;
}
function enregistrerRevision() {
  const r = ST.revision;
  if (!r) return;
  const n = S.N.get(r.id), c = r.sug[Number(radio("prop-c"))];
  if (!n || !c) { erreurFeuille("Choisis un créneau."); return; }
  const parent = dossierRevisions();
  const now = maintenantIso(), nid = newId("n");
  const rep = coche("prop-serie") && n.repete ? {freq: "semaine", intervalle: n.repete.intervalle || 1, jours: [isoDow(c.date)], jusqua: n.repete.jusqua || "", sauf: [], semaines: n.repete.semaines || ""} : null;
  D.nodes[nid] = Object.assign(blankNode(now), {parent, type: "evenement", titre: "Révision · " + titreCourt(n.titre), date: c.date, heure: fromMin(c.s), fin: fromMin(c.e), repete: rep, rappel: 10, rappelMode: "vibreur",
    texte: "Révision du cours « " + n.titre + " »" + (n.repete ? ", " + resumeRepetition(n).toLowerCase() : "") + ".", majPar: "nathan"});
  marquerProposition(r.id, nid);
  ST.revision = null;
  fermerFeuille();
  sauver({text: "Révision calée " + relDay(c.date) + " à " + fmtMin(c.s) + (rep ? ", chaque semaine" : ""), action: {label: "Voir", fn: () => go("n:" + nid)}});
}
function autreMoment(id) {
  const n = S.N.get(id);
  const r = ST.revision, duree = r ? r.duree : 45;
  const d = addDays(today(), 1);
  ST.revision = null;
  ouvrirEditeur({type: "evenement", parent: dossierRevisions(), titre: "Révision · " + titreCourt(n ? n.titre : ""), date: d, heure: "18:30", fin: fromMin(18 * 60 + 30 + duree)});
  if (n) marquerProposition(id, "manuel");
}

/* ---------- plan de révision avant un partiel ---------- */
const DUREES_EXAM = [45, 60, 90, 120];
const SEANCES = [[7, "Une semaine avant"], [3, "Trois jours avant"], [1, "La veille"]];
function planExamen(n, duree) {
  const d = n.type === "tache" ? n.date : prochaineDate(n);
  if (!d || d <= today()) return [];
  return SEANCES.map(([k, label]) => ({k, label, jour: addDays(d, -k)})).filter(x => x.jour >= today())
    .map(x => Object.assign(x, {c: creneauLibre(x.jour, duree, 0)}));
}
function listeSeances(plan) {
  if (!plan.length) return `<p class="muted" style="margin:0">C’est trop proche pour un plan : cale une séance toi-même.</p>`;
  return plan.map((x, i) => `<label><input type="checkbox" id="pe-${i}"${x.c ? " checked" : " disabled"}><span class="prop-c"><b>${esc(x.label)}</b><span>${x.c ? esc(libelleCreneau(x.c)) : esc(cap(relDay(x.jour))) + " : pas de créneau libre"}</span></span></label>`).join("");
}
function feuillePlanExamen(id, opt = {}) {
  const n = S.N.get(id);
  if (!n) return;
  const duree = (ST.plan && ST.plan.id === id && ST.plan.duree) || 60;
  const plan = planExamen(n, duree);
  ST.plan = {id, duree, plan};
  const d = n.type === "tache" ? n.date : prochaineDate(n);
  const corps = `${opt.ajoute ? ligneAjoute(n, n.type === "tache" ? "Rendu" : "Examen") : ""}<div class="prop-cours c-${couleurDe(n)}"><span class="prop-fil" aria-hidden="true"></span><div><p class="prop-t">${esc(n.titre)}</p><p class="prop-m">${esc(d ? cap(relDay(d)) + (d > today() ? " · dans " + plural(diffDays(today(), d), "jour") : "") : "")}</p></div></div>
    <p class="muted" style="margin:0">Trois séances avant le jour J, sur des créneaux libres. Décoche celles que tu ne veux pas.</p>
    <fieldset class="field"><legend class="lbl">Séances</legend><div class="choix-list coches" id="pe-liste">${listeSeances(plan)}</div></fieldset>
    <fieldset class="field"><legend class="lbl">Durée de chaque séance</legend><div class="seg">${DUREES_EXAM.map(x => `<label><input type="radio" name="pe-duree" value="${x}"${x === duree ? " checked" : ""}><span>${x < 60 ? x + " min" : fmtNombre(x / 60, 1) + " h"}</span></label>`).join("")}</div></fieldset>
    <p class="err" id="sheet-err" hidden></p>
    <div class="prop-liens"><button class="link muted-link" type="button" data-act="prop-jamais" data-id="${esc(id)}">Ne plus proposer pour cet examen</button></div>`;
  ouvrirFeuille(formFeuille("f-plan", "Préparer cet examen ?", corps, plan.some(x => x.c) ? "Caler les séances" : "", "Pas maintenant"), "plan");
}
function majPlan(duree) {
  const p = ST.plan;
  if (!p) return;
  const n = S.N.get(p.id);
  if (!n) return;
  p.duree = duree;
  p.plan = planExamen(n, duree);
  const l = $("#pe-liste");
  if (l) l.innerHTML = listeSeances(p.plan);
}
function enregistrerPlan() {
  const p = ST.plan;
  if (!p) return;
  const n = S.N.get(p.id);
  const choisies = p.plan.filter((x, i) => x.c && coche("pe-" + i));
  if (!n || !choisies.length) { erreurFeuille("Coche au moins une séance."); return; }
  const parent = dossierRevisions(), now = maintenantIso();
  for (const x of choisies) {
    D.nodes[newId("n")] = Object.assign(blankNode(now), {parent, type: "evenement", titre: "Révision · " + titreCourt(n.titre), date: x.c.date, heure: fromMin(x.c.s), fin: fromMin(x.c.e), rappel: 10, rappelMode: "vibreur",
      texte: x.label + " : « " + n.titre + " »" + (n.date ? " (" + jourLong(n.type === "tache" ? n.date : (prochaineDate(n) || n.date)).toLowerCase() + ")" : "") + ".", majPar: "nathan"});
  }
  marquerProposition(p.id, "plan");
  ST.plan = null;
  fermerFeuille();
  sauver(plural(choisies.length, "séance calée", "séances calées") + " avant « " + titreCourt(n.titre) + " »");
}

/* ---------- quand proposer ---------- */
const proposer = () => D.config.proposer !== false;
function proposerApresAjout(id) {
  if (!proposer()) return;
  const n = S.N.get(id);
  if (!n) return;
  const d = n.type === "tache" ? n.date : prochaineDate(n);
  if (!d || d < today()) return;
  // La confirmation « ajouté » passe dans la feuille (le message du bas la cacherait).
  if (estCours(n)) setTimeout(() => { cacherToast(); feuilleRevision(id, {ajoute: true}); }, 300);
  else if (estExamen(n) && d > today()) setTimeout(() => { cacherToast(); feuillePlanExamen(id, {ajoute: true}); }, 300);
}
/** Ce qui attend une révision : cours répétés sans révision, examens des 30 prochains jours. */
function propositionsEnAttente() {
  if (!proposer()) return [];
  const deja = D.config.propositions && typeof D.config.propositions === "object" ? D.config.propositions : {};
  const t = today(), res = [];
  const revs = [];
  for (const id of S.vis) { const n = S.N.get(id); if (n.type === "evenement" && estRevision(n)) revs.push(norm(n.titre)); }
  const couvert = n => !!deja[n.id] || revs.some(r => r.includes(norm(titreCourt(n.titre))));
  for (const id of S.vis) {
    const n = S.N.get(id);
    if ((n.type !== "evenement" && n.type !== "tache") || couvert(n)) continue;
    if (estCours(n) && n.repete) { const d = prochaineDate(n); if (d) res.push({n, k: "cours", d}); }
    else if (estExamen(n)) { const d = n.type === "tache" ? n.date : prochaineDate(n); if (d && d > t && diffDays(t, d) <= 30) res.push({n, k: "examen", d}); }
  }
  return res.sort((a, b) => (a.k === b.k ? 0 : a.k === "examen" ? -1 : 1) || a.d.localeCompare(b.d));
}
function blocPropositions() {
  const l = propositionsEnAttente();
  if (!l.length) return "";
  const lignes = l.slice(0, 3).map(p => `<div class="prop-row"><span class="prop-dot c-${couleurDe(p.n)}" aria-hidden="true"></span><span class="row-main"><span class="row-title">${esc(p.n.titre)}</span><span class="row-meta">${p.k === "examen" ? esc(cap(relDay(p.d))) + " · dans " + plural(diffDays(today(), p.d), "jour") : "Pas encore de révision · le " + JOURS_NOM[isoDow(p.d) - 1]}</span></span><button class="btn sm${p.k === "examen" ? " primary" : ""}" type="button" data-act="${p.k === "examen" ? "prop-examen" : "prop-revision"}" data-id="${esc(p.n.id)}">${p.k === "examen" ? "Préparer" : "Caler"}</button><button class="icon-btn sm" type="button" data-act="prop-ignorer" data-id="${esc(p.n.id)}" aria-label="Ne plus proposer">${ICON.x}</button></div>`).join("");
  return `<section class="block"><div class="block-head"><h2 class="eyebrow">À caler${l.length > 3 ? " · " + l.length : ""}</h2></div><div class="card prop-card">${lignes}</div></section>`;
}
