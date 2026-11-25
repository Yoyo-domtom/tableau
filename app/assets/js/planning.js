"use strict";
/* Planning : jour, semaine (grille horaire), mois, liste. */

const PL = {vue: "semaine", jour: today(), defiler: true, filtre: ""};
try { const v = localStorage.getItem("tableau.vuePlanning"); if (["jour", "semaine", "mois", "liste"].includes(v)) PL.vue = v; } catch (e) { /* défaut */ }
const VUE_LABEL = {jour: "Jour", semaine: "Semaine", mois: "Mois", liste: "Liste"};

function grouper(occs) {
  const m = new Map();
  for (const o of occs) { if (!m.has(o.date)) m.set(o.date, []); m.get(o.date).push(o); }
  return m;
}
const semaineDe = l => [0, 1, 2, 3, 4, 5, 6].map(k => addDays(l, k));
/* Filtre par agenda : toucher une pastille n'affiche que cet agenda, la retoucher enlève le filtre. */
const dansFiltre = n => { if (!PL.filtre) return true; const ag = agendaDe(n); return !!ag && ag.id === PL.filtre; };
const occPlanning = (de, a, trajets) => {
  const os = occurrences(de, a);
  // Trajets : seulement dans les grilles, et quand le filtre laisse voir les cours ou le travail.
  const avec = trajets && (!PL.filtre || os.some(o => o.n.id && agendaDe(o.n) && agendaDe(o.n).id === PL.filtre && demandeTrajet(o.n))) ? avecTrajets(os) : os;
  return avec.filter(o => o.virtuel || dansFiltre(o.n));
};
function agendasPlanning() {
  const vus = new Map();
  for (const id of S.vis) {
    const n = S.N.get(id);
    if (!n.date || (n.type !== "evenement" && n.type !== "tache")) continue;
    const ag = agendaDe(n);
    if (ag && !vus.has(ag.id)) vus.set(ag.id, ag);
  }
  return [...vus.values()].sort((a, b) => a.titre.localeCompare(b.titre, "fr", {sensitivity: "base"}));
}
function filtresPlanning() {
  const ags = agendasPlanning();
  if (PL.filtre && !ags.some(a => a.id === PL.filtre)) PL.filtre = "";
  if (ags.length < 2) return "";
  return `<div class="chips scroll pl-filtres" role="group" aria-label="Filtrer par agenda">${ags.map(a => `<button class="chip sm agenda c-${couleurDe(a)}" type="button" data-act="pl-filtre" data-id="${esc(a.id)}" aria-pressed="${PL.filtre === a.id}"><i aria-hidden="true"></i>${esc(a.titre || "Sans titre")}</button>`).join("")}</div>`;
}

function titrePlanning() {
  const v = PL.vue, j = PL.jour, l = mondayOf(j);
  let titre;
  if (v === "mois" || v === "jour") titre = cap(F_MOIS.format(pd(j)));
  else if (v === "liste") titre = "À venir";
  else {
    const dim = addDays(l, 6);
    titre = l.slice(0, 7) === dim.slice(0, 7) ? cap(F_MOIS.format(pd(l))) : cap(F_MOIS_C.format(pd(l))).replace(".", "") + " – " + F_MOIS_C.format(pd(dim)).replace(".", "") + " " + dim.slice(0, 4);
  }
  return titre;
}
const corpsPlanning = () => PL.vue === "jour" ? plJour() : PL.vue === "semaine" ? plSemaine() : PL.vue === "mois" ? plMois() : plListe();
/* Les boutons Jour / Semaine / Mois / Liste et Aujourd'hui sont en bas (barre du pouce) : voir majDock(). */
function vuePlanning() {
  const v = PL.vue;
  return `<div class="pl-head"><div class="pl-top"><h1 class="pl-title">${esc(titrePlanning())}</h1><div class="pl-nav"${v === "liste" ? " hidden" : ""}>
    <button class="icon-btn" type="button" data-act="pl-prec" aria-label="Période précédente">${ICON.gauche}</button><button class="icon-btn" type="button" data-act="pl-suiv" aria-label="Période suivante">${ICON.droite}</button>
    </div></div>${filtresPlanning()}</div>
    <div class="pl-body" id="pl-body">${corpsPlanning()}</div>`;
}
/** Remplace seulement le corps et le titre (changer de période ou d'affichage sans tout redessiner). */
function majCorpsPlanning() {
  const b = $("#pl-body"), t = $(".pl-title"), nav = $(".pl-nav");
  if (ST.route !== "planning" || !b) { render(); return; }
  creaFinir();
  try { b.innerHTML = corpsPlanning(); } catch (e) { noterErreur("planning : " + (e && e.message)); render(); return; }
  brancherGrille();
  if (t) t.textContent = titrePlanning();
  if (nav) nav.hidden = PL.vue === "liste";
  majDock();
  plDefiler();
}
function sousTitreSemaine(l) {
  return `<div class="pl-sub"><span class="eyebrow">Semaine ${isoWeek(pd(l))} · ${esc(rangeLabel(l, addDays(l, 6)))}</span>${chipSemaine(l)}</div>`;
}
function points(os) {
  const vus = [];
  for (const o of os) { if (o.virtuel) continue; const c = couleurDe(o.n); if (!vus.includes(c)) vus.push(c); if (vus.length === 3) break; }
  return vus.map(c => `<i class="c-${c}"></i>`).join("");
}
function plJour() {
  const j = PL.jour, l = mondayOf(j), t = today();
  const par = grouper(occPlanning(l, addDays(l, 6), true));
  let h = sousTitreSemaine(l);
  h += `<div class="strip">${semaineDe(l).map(d => `<button class="sd${d === j ? " sel" : ""}${d === t ? " today" : ""}" type="button" data-act="pl-jour" data-date="${d}" aria-pressed="${d === j}" aria-label="${esc(jourLong(d))}"><span class="sd-wd">${esc(wdCourt(d))}</span><span class="sd-n">${pd(d).getDate()}</span><span class="sd-dots">${points(par.get(d) || [])}</span></button>`).join("")}</div>`;
  h += `<p class="pl-daytitle">${esc(cap(F_HEAD.format(pd(j))))}${d2Label(j)}</p>`;
  h += rangJournee([j], par, false);
  h += astuceGrille();
  h += grille([j], par, 56);
  return h;
}
function d2Label(j) {
  const t = today();
  if (j === t) return " · aujourd’hui";
  if (j === addDays(t, 1)) return " · demain";
  return "";
}
function plSemaine() {
  const l = mondayOf(PL.jour);
  const par = grouper(occPlanning(l, addDays(l, 6), true));
  let jours = semaineDe(l);
  const we = D.config.weekend || "auto";
  const reel = d => (par.get(d) || []).some(o => !o.virtuel);
  if (we === "non" || (we === "auto" && !reel(jours[5]) && !reel(jours[6]))) jours = jours.slice(0, 5);
  const t = today();
  let h = sousTitreSemaine(l);
  h += `<div class="wk-head" style="--n:${jours.length}"><span></span>${jours.map(d => `<button class="wk-day${d === t ? " today" : ""}" type="button" data-act="pl-ouvrir-jour" data-date="${d}" aria-label="${esc(jourLong(d))}"><span class="sd-wd">${esc(wdCourt(d))}</span><span class="sd-n">${pd(d).getDate()}</span></button>`).join("")}</div>`;
  h += rangJournee(jours, par, true);
  h += astuceGrille();
  h += grille(jours, par, 46);
  return h;
}
function rangJournee(jours, par, compact) {
  const cols = jours.map(d => (par.get(d) || []).filter(o => o.journee));
  if (!cols.some(c => c.length)) return "";
  return `<div class="allday${compact ? " compact" : ""}" style="--n:${jours.length}"><span>${compact ? "" : "Jour"}</span>${cols.map(c => `<div class="ad-col">${c.map(o => `<button class="ad-chip c-${couleurDe(o.n)}${o.tache && o.n.statut === "fait" ? " fait" : ""}" type="button" data-occ="${esc(o.cle)}">${o.tache ? ICON.tache : ICON.evenement}<span>${esc(o.n.titre || "Sans titre")}</span></button>`).join("")}</div>`).join("")}</div>`;
}
/** Place les événements qui se chevauchent côte à côte. */
function disposer(evs) {
  const res = [];
  let groupe = [], finGroupe = -1;
  const vider = () => {
    const cols = [];
    for (const e of groupe) {
      let k = cols.findIndex(fin => fin <= e.s);
      if (k < 0) { k = cols.length; cols.push(0); }
      cols[k] = Math.max(e.e, e.s + 20);
      e.col = k;
    }
    for (const e of groupe) e.ncol = cols.length;
    res.push(...groupe);
    groupe = [];
  };
  for (const e of evs.slice().sort((a, b) => a.s - b.s || b.e - a.e)) {
    if (groupe.length && e.s >= finGroupe) { vider(); finGroupe = -1; }
    groupe.push(e);
    finGroupe = Math.max(finGroupe, Math.max(e.e, e.s + 20));
  }
  if (groupe.length) vider();
  return res;
}
function grille(jours, par, hh) {
  let h0 = Math.max(0, Math.min(12, Number(D.config.debutJour) || 7)), h1 = 20;
  for (const d of jours) for (const o of par.get(d) || []) if (!o.journee) { h0 = Math.min(h0, Math.floor(o.s / 60)); h1 = Math.max(h1, Math.ceil(o.e / 60)); }
  h1 = Math.min(24, Math.max(h1, h0 + 8));
  const rangs = h1 - h0, t = today(), mn = nowMin(), etroit = jours.length > 3;
  let h = `<div class="tg" style="--hh:${hh}px;--rows:${rangs};--n:${jours.length}" data-h0="${h0}" data-hh="${hh}">`;
  h += `<div class="tg-hours">${Array.from({length: rangs}, (_, i) => `<span class="tg-h" style="top:${i * hh}px${i === 0 ? ";transform:none" : ""}">${h0 + i} h</span>`).join("")}</div><div class="tg-cols">`;
  for (const d of jours) {
    const evs = disposer((par.get(d) || []).filter(o => !o.journee));
    h += `<div class="tg-col${d === t ? " today" : ""}" data-act="pl-creneau" data-date="${d}">`;
    if (d === t && mn >= h0 * 60 && mn <= h1 * 60) h += `<div class="tg-now" style="top:${(mn - h0 * 60) / 60 * hh}px"></div>`;
    for (const o of evs) {
      const haut = (o.s - h0 * 60) / 60 * hh;
      const ht = Math.max((Math.max(o.e, o.s + 15) - o.s) / 60 * hh - 2, 18);
      // Colonnes étroites (semaine) : les événements qui se chevauchent sont décalés en cascade plutôt que coupés en lamelles.
      const cascade = etroit && o.ncol > 1;
      const w = cascade ? 72 : 100 / o.ncol, gauche = cascade ? o.col * (28 / (o.ncol - 1)) : o.col * w;
      const court = ht < 34;
      const passe = d < t || (d === t && o.e <= mn);
      const meta = [fmtCourt(o.s) + "–" + fmtCourt(o.e), o.n.lieu].filter(Boolean).join(" · ");
      if (o.virtuel) {
        h += `<button class="ev trajet${court ? " court" : ""}${etroit ? " etroit" : ""}${passe ? " passe" : ""}" type="button" style="top:${haut}px;height:${ht}px;left:calc(${gauche}% + 2px);width:calc(${w}% - 4px);z-index:${1 + o.col}" data-act="trajet" data-date="${o.date}" aria-label="${esc(o.n.titre + ", " + fmtPlage(o))}"><span class="ev-t">${ICON.train}${etroit ? "" : `<span>${esc(o.n.titre)}</span>`}</span>${court || etroit ? "" : `<span class="ev-m">${esc(meta)}</span>`}</button>`;
        continue;
      }
      h += `<button class="ev c-${couleurDe(o.n)}${court ? " court" : ""}${etroit ? " etroit" : ""}${passe ? " passe" : ""}" type="button" style="top:${haut}px;height:${ht}px;left:calc(${gauche}% + 2px);width:calc(${w}% - 4px);z-index:${2 + o.col}" data-occ="${esc(o.cle)}" aria-label="${esc(o.n.titre + ", " + fmtPlage(o))}"><span class="ev-t">${esc(o.n.titre || "Sans titre")}</span>${court ? "" : `<span class="ev-m">${esc(meta)}</span>`}</button>`;
    }
    h += `</div>`;
  }
  return h + `</div></div>`;
}
function plMois() {
  const j = PL.jour, premier = firstOfMonth(j), debut = mondayOf(premier);
  const fin = addDays(mondayOf(lastOfMonth(premier)), 6);
  const par = grouper(occPlanning(debut, fin)), t = today();
  let h = `<div class="mo"><div class="mo-dow"><span></span>${JOURS_LETTRE.map(x => `<span>${x}</span>`).join("")}</div>`;
  for (let w = debut; w <= fin; w = addDays(w, 7)) {
    const ty = str(D.semaines[w]);
    h += `<div class="mo-row"><button class="mo-alt${ty ? " s-" + ty : ""}" type="button" data-act="semaine" data-lundi="${w}" aria-label="Semaine ${isoWeek(pd(w))} : ${ty ? SEMAINES[ty] : "type non défini"}"></button>`;
    for (let k = 0; k < 7; k++) {
      const d = addDays(w, k), os = par.get(d) || [], dehors = d.slice(0, 7) !== premier.slice(0, 7);
      h += `<button class="mo-cell${dehors ? " out" : ""}${d === t ? " today" : ""}" type="button" data-act="pl-ouvrir-jour" data-date="${d}" aria-label="${esc(jourLong(d))}${os.length ? ", " + plural(os.length, "élément") : ""}"><span class="mo-n">${pd(d).getDate()}</span>${os.slice(0, 3).map(o => `<span class="mo-ev c-${couleurDe(o.n)}${o.tache ? " tache" : ""}">${esc(o.n.titre || "Sans titre")}</span>`).join("")}${os.length > 3 ? `<span class="mo-more">+${os.length - 3}</span>` : ""}</button>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  const types = new Set(Object.values(D.semaines));
  h += `<div class="legende">${Object.keys(SEMAINES).filter(k => types.has(k)).map(k => `<span class="s-${k}"><i></i>${SEMAINES[k]}</span>`).join("")}</div>`;
  h += astuce("mois-bande", "La bande à gauche de chaque semaine indique école ou entreprise : touche-la pour la changer.");
  return h;
}
function plListe() {
  const t = today(), fin = addDays(t, 90);
  const retard = tachesUrgentes().filter(n => n.date < t && dansFiltre(n)).map(n => occ(n, n.date));
  const items = occPlanning(t, fin).filter(o => !(o.tache && o.n.statut === "fait"));
  if (!items.length && !retard.length) return `<div class="empty"><p><strong>Rien de prévu ces trois prochains mois.</strong></p><p class="muted">Ajoute un événement, ou demande à Claude : « ajoute mes partiels de décembre dans Planning › École ».</p><button class="btn sm" type="button" data-act="nouvel-evenement">${ICON.plus}<span>Ajouter un événement</span></button></div>`;
  let h = "";
  if (retard.length) h += `<section class="block" style="padding-top:4px"><div class="week-head late"><h2 class="eyebrow">En retard</h2><span class="eyebrow">${retard.length}</span></div><div class="ag-list">${retard.map(agRow).join("")}</div></section>`;
  const groupes = new Map();
  for (const o of items) { const m = mondayOf(o.date); if (!groupes.has(m)) groupes.set(m, []); groupes.get(m).push(o); }
  const cette = mondayOf(t);
  for (const [m, arr] of groupes) {
    const ty = str(D.semaines[m]);
    h += `<section class="block"><div class="week-head"><h2 class="eyebrow">Semaine ${isoWeek(pd(m))}${m === cette ? " · en cours" : ""}</h2><span class="week-type${ty ? " s-" + ty : ""}">${ty ? "<i></i>" + SEMAINES[ty] + " · " : ""}${esc(rangeLabel(m, addDays(m, 6)))}</span></div><div class="ag-list">${arr.map(agRow).join("")}</div></section>`;
  }
  return h;
}

/* ---------- navigation dans le planning ---------- */
function plDeplacer(sens, part) {
  const v = PL.vue;
  if (v === "liste") return;
  if (v === "jour") PL.jour = addDays(PL.jour, sens);
  else if (v === "semaine") PL.jour = addDays(PL.jour, 7 * sens);
  else if (v === "mois") PL.jour = addMonths(PL.jour, sens);
  PL.defiler = true;
  majCorpsPlanning();
  entree($("#pl-body"), sens, part || 0.16);
}
function plVue(v) {
  if (v === PL.vue) return;
  const avant = ["jour", "semaine", "mois", "liste"].indexOf(PL.vue), apres = ["jour", "semaine", "mois", "liste"].indexOf(v);
  PL.vue = v;
  try { localStorage.setItem("tableau.vuePlanning", v); } catch (e) { /* rien */ }
  PL.defiler = true;
  window.scrollTo(0, 0);
  majCorpsPlanning();
  entree($("#pl-body"), apres > avant ? 1 : -1, 0.08);
}
function plAujourdhui() {
  const t = today(), avant = PL.jour;
  PL.jour = t;
  PL.defiler = true;
  majCorpsPlanning();
  if (avant !== t) entree($("#pl-body"), avant > t ? -1 : 1, 0.1);
}
/** Après affichage : amène l'heure actuelle (ou le premier événement) en vue. */
function plDefiler() {
  if (!PL.defiler || ST.route !== "planning" || (PL.vue !== "jour" && PL.vue !== "semaine")) return;
  PL.defiler = false;
  const tg = $(".tg");
  if (!tg) return;
  const h0 = Number(tg.dataset.h0), hh = Number(tg.dataset.hh);
  const ev = $(".tg .ev");
  const l = mondayOf(PL.jour), t = today();
  const contientAuj = PL.vue === "jour" ? PL.jour === t : (t >= l && t <= addDays(l, 6));
  let cibleMin = null;
  if (contientAuj) cibleMin = Math.max(h0 * 60, nowMin() - 60);
  else if (ev) cibleMin = h0 * 60 + (parseFloat(ev.style.top) || 0) / hh * 60 - 30;
  if (cibleMin == null) return;
  const y = tg.getBoundingClientRect().top + window.scrollY + (cibleMin - h0 * 60) / 60 * hh - 150;
  window.scrollTo(0, Math.max(0, y));
}
function plCreneau(col, clientY) {
  const tg = col.closest(".tg");
  if (!tg) return;
  const h0 = Number(tg.dataset.h0), hh = Number(tg.dataset.hh);
  const y = clientY - col.getBoundingClientRect().top;
  let m = h0 * 60 + Math.floor(y / hh * 2) * 30;
  m = Math.max(0, Math.min(23 * 60, m));
  nouvelEvenement(col.dataset.date, fromMin(m));
}

/* ---------- créer en glissant : doigt appuyé sur une heure, puis glisser jusqu'à l'heure de fin ----------
   Les écouteurs sont posés sur la grille seule (touchmove bloquant uniquement là) : le reste de l'appli défile sans attendre. */
const CREA_DELAI = 380, CREA_PAS = 15;
let CREA = null;
const astuceGrille = () => astuce("grille-glisser", "Touche une heure pour ajouter un événement, ou garde le doigt appuyé puis glisse vers le bas jusqu’à l’heure de fin.");
function brancherGrille() {
  const cols = $("#pl-body .tg-cols");
  if (!cols || cols.dataset.branche) return;
  cols.dataset.branche = "1";
  cols.addEventListener("touchstart", creaDebut, {passive: true});
  cols.addEventListener("touchmove", creaBouge, {passive: false});
  cols.addEventListener("touchend", creaFin, {passive: false});
  cols.addEventListener("touchcancel", creaFinir, {passive: true});
  cols.addEventListener("contextmenu", e => e.preventDefault());
}
function creaDebut(e) {
  creaFinir();
  if (e.touches.length !== 1 || ST.route !== "planning" || !$("#sheet").hidden) return;
  const col = e.target.closest(".tg-col");
  if (!col || e.target.closest(".ev:not(.trajet)")) return; // sur un vrai événement, le toucher l'ouvre
  const p = e.touches[0];
  CREA = {col, x: p.clientX, y: p.clientY, doigt: p.clientY, actif: false, bouge: false, a: 0, s: 0, e: 0, raf: 0, fantome: null};
  CREA.timer = setTimeout(creaActiver, CREA_DELAI);
}
/** Minute de la journée sous le doigt (y en coordonnées de l'écran). */
const creaMinute = (c, y) => c.h0 * 60 + (y - c.col.getBoundingClientRect().top) / c.hh * 60;
function creaActiver() {
  const c = CREA;
  if (!c) return;
  const tg = c.col.closest(".tg");
  if (!tg || !c.col.isConnected || !$("#sheet").hidden) { creaFinir(); return; }
  c.h0 = Number(tg.dataset.h0);
  c.hh = Number(tg.dataset.hh);
  c.max = Math.min(24 * 60, (c.h0 + Math.round(c.col.offsetHeight / c.hh)) * 60);
  c.a = Math.max(c.h0 * 60, Math.min(c.max - CREA_PAS, Math.floor(creaMinute(c, c.y) / CREA_PAS) * CREA_PAS));
  c.s = c.a;
  c.e = Math.min(c.max, c.a + 60);
  c.actif = true;
  geste = null; // le doigt ne change plus de jour ni de semaine
  vibrer("long");
  // L'astuce s'efface sans rien déplacer sous le doigt ; elle disparaît au prochain affichage.
  marquerVu("grille-glisser");
  const a = $(".astuce [data-cle=\"grille-glisser\"]");
  if (a) a.closest(".astuce").classList.add("vue");
  c.fantome = document.createElement("div");
  c.fantome.className = "ev-fantome" + (c.col.parentElement.children.length > 3 ? " etroit" : "");
  c.col.appendChild(c.fantome);
  document.documentElement.classList.add("crea");
  creaDessiner();
  c.raf = requestAnimationFrame(creaBoucle);
}
function creaBouge(e) {
  const c = CREA;
  if (!c || e.touches.length !== 1) return;
  const p = e.touches[0];
  if (!c.actif) {
    // Le doigt bouge avant l'appui long : c'est un défilement ou un glissement, on laisse faire.
    if (Math.abs(p.clientX - c.x) > 8 || Math.abs(p.clientY - c.y) > 8) creaFinir();
    return;
  }
  if (e.cancelable) e.preventDefault();
  c.doigt = p.clientY;
  if (!c.bouge && Math.abs(p.clientY - c.y) > c.hh / 4) c.bouge = true;
  creaCalculer();
}
function creaCalculer() {
  const c = CREA;
  if (!c || !c.bouge) return;
  const m = Math.max(c.h0 * 60, Math.min(c.max, Math.round(creaMinute(c, c.doigt) / CREA_PAS) * CREA_PAS));
  let s = Math.min(c.a, m), f = Math.max(c.a, m);
  if (f - s < CREA_PAS) f = Math.min(c.max, s + CREA_PAS);
  if (s === c.s && f === c.e) return;
  c.s = s;
  c.e = f;
  vibrer();
  creaDessiner();
}
function creaDessiner() {
  const c = CREA;
  if (!c || !c.fantome) return;
  const haut = (c.s - c.h0 * 60) / 60 * c.hh, ht = Math.max((c.e - c.s) / 60 * c.hh - 2, 18);
  c.fantome.style.top = haut + "px";
  c.fantome.style.height = ht + "px";
  c.fantome.innerHTML = `<span>${esc(fmtMin(c.s))} – ${esc(fmtMin(c.e))}</span><small>${esc(fmtDureeMin(c.e - c.s))}</small>`;
}
/** Près du bas (barre du pouce) ou du haut (titre), la page défile toute seule pendant qu'on étire. */
function creaBoucle() {
  const c = CREA;
  if (!c || !c.actif) return;
  if (c.bouge) {
    const tb = $(".tabbar"), dk = $("#dock"), di = dk && !dk.hidden ? $("#dock .dock-in") : null, tete = $(".pl-head");
    const bas = Math.min(tb ? tb.getBoundingClientRect().top : window.innerHeight, di ? di.getBoundingClientRect().top : window.innerHeight) - 28;
    const haut = (tete ? tete.getBoundingClientRect().bottom : 0) + 28;
    let v = 0;
    if (c.doigt > bas) v = Math.min(16, 2 + (c.doigt - bas) / 3);
    else if (c.doigt < haut) v = -Math.min(16, 2 + (haut - c.doigt) / 3);
    if (v) {
      const avant = window.scrollY;
      window.scrollBy(0, v);
      if (window.scrollY !== avant) creaCalculer();
    }
  }
  c.raf = requestAnimationFrame(creaBoucle);
}
function creaFin(e) {
  const c = CREA;
  if (!c) return;
  if (!c.actif) { creaFinir(); return; } // simple toucher : le clic habituel ouvre l'éditeur
  if (e.cancelable) e.preventDefault(); // pas de clic fantôme sur la feuille qui s'ouvre
  ST.sansClicJusqua = Date.now() + 450;
  const date = c.col.dataset.date, s = c.s, f = c.e;
  creaFinir();
  $$(".astuce.vue").forEach(x => x.remove()); // le doigt est levé : l'astuce effacée peut libérer sa place
  nouvelEvenement(date, fromMin(s), f >= 24 * 60 ? "23:59" : fromMin(f));
}
function creaFinir() {
  const c = CREA;
  CREA = null;
  if (!c) return;
  clearTimeout(c.timer);
  if (c.raf) cancelAnimationFrame(c.raf);
  if (c.fantome) c.fantome.remove();
  document.documentElement.classList.remove("crea");
}
