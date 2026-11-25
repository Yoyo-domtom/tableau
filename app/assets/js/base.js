"use strict";
/* Outils communs : DOM, texte, dates, icônes, mise en forme des notes. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- texte ---------- */
const ESC = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"};
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ESC[c]);
const str = x => (typeof x === "string" ? x : (x == null ? "" : String(x)));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const pad2 = n => String(n).padStart(2, "0");
const plural = (k, w, ws) => k + " " + (k > 1 ? (ws || w + "s") : w);
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtNombre = (x, dec = 1) => Number(x).toLocaleString("fr-FR", {maximumFractionDigits: dec, minimumFractionDigits: 0});
function fmtTaille(o) {
  o = Number(o) || 0;
  if (o < 1024 * 1024) return Math.max(1, Math.round(o / 1024)) + " Ko";
  return fmtNombre(o / 1048576, 1) + " Mo";
}

/* ---------- dates (chaînes AAAA-MM-JJ, heure locale) ---------- */
const isoDay = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const today = () => isoDay(new Date());
const pd = s => { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return isoDay(d); };
const diffDays = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const isoDow = s => pd(s).getDay() || 7;
const mondayOf = s => addDays(s, 1 - isoDow(s));
const monthsBetween = (a, b) => { const x = pd(a), y = pd(b); return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth(); };
const firstOfMonth = s => s.slice(0, 8) + "01";
const addMonths = (s, n) => { const d = pd(firstOfMonth(s)); d.setMonth(d.getMonth() + n); return isoDay(d); };
const lastOfMonth = s => addDays(addMonths(s, 1), -1);
const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const k = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - k); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
const toMin = h => { const p = String(h).split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); };
const fromMin = m => pad2(Math.floor(m / 60) % 24) + ":" + pad2(m % 60);
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

const F_DAY = new Intl.DateTimeFormat("fr-FR", {weekday: "short", day: "numeric", month: "short"});
const F_LONG = new Intl.DateTimeFormat("fr-FR", {weekday: "long", day: "numeric", month: "long", year: "numeric"});
const F_HEAD = new Intl.DateTimeFormat("fr-FR", {weekday: "long", day: "numeric", month: "long"});
const F_DM = new Intl.DateTimeFormat("fr-FR", {day: "numeric", month: "short"});
const F_MOIS = new Intl.DateTimeFormat("fr-FR", {month: "long", year: "numeric"});
const F_MOIS_C = new Intl.DateTimeFormat("fr-FR", {month: "short"});
const F_WD = new Intl.DateTimeFormat("fr-FR", {weekday: "short"});
const wdCourt = s => F_WD.format(pd(s)).replace(".", "");
const JOURS_LETTRE = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_NOM = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const relDay = s => { const t = today(); if (s === t) return "aujourd’hui"; if (s === addDays(t, 1)) return "demain"; if (s === addDays(t, -1)) return "hier"; return F_DAY.format(pd(s)); };
const jourLong = s => cap(F_LONG.format(pd(s)));
const fmtHeure = h => { if (!h) return ""; const p = String(h).split(":"); return Number(p[0]) + " h" + (p[1] && p[1] !== "00" ? " " + p[1] : ""); };
const fmtMin = m => fmtHeure(fromMin(m));
const fmtCourt = m => Math.floor(m / 60) + ":" + pad2(m % 60);
const hm = d => fmtHeure(pad2(d.getHours()) + ":" + pad2(d.getMinutes()));
const fmtStamp = iso => { const d = new Date(iso); return isNaN(d) ? "" : "le " + F_DM.format(d) + " à " + hm(d); };
const fmtShort = iso => { const d = new Date(iso); return isNaN(d) ? "" : F_DM.format(d) + " · " + hm(d); };
const dateLine = () => { const d = new Date(); return cap(F_HEAD.format(d)) + " · semaine " + isoWeek(d); };
function rangeLabel(a, b) { const A = pd(a), B = pd(b); return (A.getMonth() === B.getMonth() ? A.getDate() : F_DM.format(A)) + " → " + F_DM.format(B); }
function dans(min) {
  if (min <= 0) return "maintenant";
  if (min < 60) return "dans " + min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return "dans " + h + " h" + (m ? " " + pad2(m) : "");
}

/* ---------- icônes ---------- */
const svg = (p, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const ICON = {
  dossier: svg('<path d="M3.5 7.2c0-1 .8-1.7 1.7-1.7h4.1l2 2.2h7.5c.9 0 1.7.8 1.7 1.7v8.4c0 1-.8 1.7-1.7 1.7H5.2c-.9 0-1.7-.8-1.7-1.7z"/>'),
  note: svg('<path d="M6.5 3.5h8L19 8v11.8c0 .4-.3.7-.7.7H6.5c-.4 0-.7-.3-.7-.7V4.2c0-.4.3-.7.7-.7z"/><path d="M14 3.5V8h5M9 12.5h6.5M9 16h4.5"/>'),
  tache: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8 12.3l2.8 2.8 5.2-5.6"/>'),
  evenement: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M8 13.5h3v3H8z"/>'),
  check: svg('<path d="M6 12.5l4 4 8-9"/>'),
  chev: svg('<path d="M9.5 6l6 6-6 6"/>', "chev"),
  back: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  gauche: svg('<path d="M14.5 6l-6 6 6 6"/>'),
  droite: svg('<path d="M9.5 6l6 6-6 6"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  tableau: svg('<rect x="3" y="5" width="5" height="14" rx="1.2"/><rect x="9.5" y="5" width="5" height="14" rx="1.2"/><rect x="16" y="5" width="5" height="14" rx="1.2"/><path d="M5.5 8.5v3M12 12.5v3M18.5 8.5v3"/>'),
  agenda: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>'),
  trombone: svg('<path d="M20 11.5l-7.8 7.8a4.6 4.6 0 0 1-6.5-6.5l8-8a3.1 3.1 0 0 1 4.4 4.4l-8 8a1.5 1.5 0 0 1-2.2-2.2l7.3-7.3"/>'),
  claude: svg('<path d="M4.5 5h15c.6 0 1 .4 1 1v10c0 .6-.4 1-1 1h-9L6 20.5V17H4.5c-.6 0-1-.4-1-1V6c0-.6.4-1 1-1z"/><path d="M8 9.5h8M8 12.8h5"/>'),
  photo: svg('<path d="M4 8.5c0-.8.7-1.5 1.5-1.5h2.3l1.4-2h5.6l1.4 2h2.3c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5z"/><circle cx="12" cy="13" r="3.5"/>'),
  galerie: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.7"/><path d="M20.5 16l-5-5-8.5 8.5"/>'),
  fichier: svg('<path d="M6.5 3.5h8L19 8v11.8c0 .4-.3.7-.7.7H6.5c-.4 0-.7-.3-.7-.7V4.2c0-.4.3-.7.7-.7z"/><path d="M14 3.5V8h5"/><path d="M9 14.5h6M9 17.5h4"/>'),
  envoyer: svg('<path d="M21 3.5L10 14.5"/><path d="M21 3.5l-6.5 17-4.5-6-6-4.5z"/>'),
  ouvrir: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h5"/>'),
  ranger: svg('<path d="M3.5 7.2c0-1 .8-1.7 1.7-1.7h4.1l2 2.2h7.5c.9 0 1.7.8 1.7 1.7v8.4c0 1-.8 1.7-1.7 1.7H5.2c-.9 0-1.7-.8-1.7-1.7z"/><path d="M10 13.5h6M13.5 11l2.5 2.5-2.5 2.5"/>'),
  corbeille: svg('<path d="M4.5 7h15M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7M6.5 7l.9 12.2c0 .5.5.8 1 .8h7.2c.5 0 1-.3 1-.8L17.5 7"/><path d="M10 11v5.5M14 11v5.5"/>'),
  epingle: svg('<path d="M9 4h6l-1 5 3 3v1.5H7V12l3-3z"/><path d="M12 13.5V20"/>'),
  reglages: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  zoom: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5"/>'),
  lieu: svg('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  train: svg('<rect x="6" y="3.5" width="12" height="13" rx="3"/><path d="M6 10.5h12M9.5 13.5h.01M14.5 13.5h.01M8.5 20.5l1.5-4M15.5 20.5l-1.5-4"/>'),
  cloche: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  repete: svg('<path d="M17 3.5l3 3-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12"/><path d="M7 20.5l-3-3 3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>'),
  telecharger: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  restaurer: svg('<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5"/><path d="M5 4.5h14"/>'),
  notes: svg('<path d="M5 19.5V12M10 19.5V6M15 19.5v-9M20 19.5v-4"/>'),
  copier: svg('<rect x="8.5" y="8.5" width="11" height="12" rx="1.6"/><path d="M15.5 8.5V5c0-.6-.4-1-1-1H5.5c-.6 0-1 .4-1 1v10c0 .6.4 1 1 1h3"/>')
};

/* ---------- notes rédigées (texte échappé ligne par ligne) ---------- */
const inlineMd = s => s
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
/** Rend le texte d'une note ; avec `id`, les cases « - [ ] » se cochent d'un toucher. */
function md(src, id) {
  const lines = String(src || "").split(/\r?\n/);
  let out = "", inList = false, para = [];
  const flushP = () => { if (para.length) { out += "<p>" + para.map(l => inlineMd(esc(l))).join("<br>") + "</p>"; para = []; } };
  const flushL = () => { if (inList) { out += "</ul>"; inList = false; } };
  const openL = () => { if (!inList) { out += "<ul>"; inList = true; } };
  lines.forEach((raw, k) => {
    const l = raw.replace(/\s+$/, "");
    let m;
    if (!l.trim()) { flushP(); flushL(); return; }
    if ((m = l.match(/^#{1,3}\s+(.+)$/))) { flushP(); flushL(); out += "<h3>" + inlineMd(esc(m[1])) + "</h3>"; return; }
    if ((m = l.match(/^\s*[-*•]\s+\[([ xX])\]\s*(.*)$/))) {
      flushP(); openL();
      const done = m[1].trim() !== "";
      const box = id
        ? `<button type="button" class="md-box" data-act="md-case" data-id="${esc(id)}" data-ligne="${k}" aria-pressed="${done}" aria-label="${done ? "Décocher" : "Cocher"}"></button>`
        : `<span class="md-box" aria-hidden="true"></span>`;
      out += `<li class="md-check${done ? " done" : ""}">${box}<span>${inlineMd(esc(m[2]))}</span></li>`;
      return;
    }
    if ((m = l.match(/^\s*[-*•]\s+(.+)$/))) { flushP(); openL(); out += "<li>" + inlineMd(esc(m[1])) + "</li>"; return; }
    flushL(); para.push(l);
  });
  flushP(); flushL();
  return out;
}
const stripMd = s => String(s).replace(/^#{1,3}\s+/, "").replace(/^\s*[-*•]\s+(\[[ xX]\]\s*)?/, "").replace(/\*\*/g, "").replace(/`/g, "");
function basculerCase(texte, ligne) {
  const lines = String(texte).split(/\r?\n/);
  const l = lines[ligne];
  if (l == null) return texte;
  lines[ligne] = /\[[xX]\]/.test(l) ? l.replace(/\[[xX]\]/, "[ ]") : l.replace(/\[ \]/, "[x]");
  return lines.join("\n");
}

/* ---------- état de l'interface ---------- */
const ST = {
  route: "accueil", tab: "accueil", pile: [],
  q: "", fq: "", ffiltre: "tout",
  draftR: "", draftCible: "", draftFichiers: [], draftImp: "", impErr: "",
  dernierDossier: "", edit: null, feuille: null, vue: null, choixFichiers: [], partage: null, apercu: null, natif: null
};
