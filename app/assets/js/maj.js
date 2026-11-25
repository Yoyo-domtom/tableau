"use strict";
/* Mises à jour de l'appli depuis son site : version.json décrit la dernière version (numéro, APK, empreinte, nouveautés).
   L'appli vérifie toute seule (au plus toutes les 6 h), propose la mise à jour, télécharge l'APK (contrôlé côté Android)
   et ouvre l'installateur. Rien n'est envoyé au site : l'appli ne fait que lire. */
const MAJ_SOURCE = "__MAJ_SOURCE__"; // remplacé à la publication par l'adresse de version.json
const MAJ_INTERVALLE = 6 * 3600 * 1000;
const MAJ = {etat: "", info: null, fait: 0, total: 0, erreur: "", manuel: false, attenteAutorisation: false};

const reglagesMaj = () => Object.assign({auto: true, verifie: "", ignore: 0, adresse: "", derniere: null}, D.config.maj && typeof D.config.maj === "object" ? D.config.maj : {});
const codeInstalle = () => Number(INFOS.code) || 0;
function adresseMaj() {
  const u = str(reglagesMaj().adresse).trim() || MAJ_SOURCE;
  return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "";
}
const majPossible = () => !!(A && typeof A.majVerifier === "function" && adresseMaj() && codeInstalle());
const hoteMaj = () => { try { return new URL(adresseMaj()).host; } catch (e) { return ""; } };

/** Ne garde de version.json que ce qui est attendu, bien formé. */
function infoMaj(o) {
  if (!o || typeof o !== "object") return null;
  const code = Number(o.versionCode), apk = str(o.apk), sha = str(o.sha256).toLowerCase();
  if (!Number.isInteger(code) || code <= 0 || !/^https:\/\/[^\s"'<>]+$/.test(apk) || !/^[0-9a-f]{64}$/.test(sha)) return null;
  if (o.app && o.app !== "fr.nathan.tableau") return null;
  return {
    versionCode: code, versionName: str(o.versionName).slice(0, 20) || String(code), apk, sha256: sha,
    taille: Number(o.taille) > 0 ? Number(o.taille) : 0, date: DATE_RE.test(str(o.date)) ? str(o.date) : "",
    nouveautes: (Array.isArray(o.nouveautes) ? o.nouveautes : []).map(x => str(x).slice(0, 300)).filter(Boolean).slice(0, 12)
  };
}
const infoAJour = () => {
  const i = MAJ.info || reglagesMaj().derniere;
  return i && i.versionCode > codeInstalle() ? i : null;
};
function messageErreurMaj(e) {
  return {
    reseau: "Pas de connexion internet.", lent: "Le site met trop de temps à répondre.", introuvable: "Le site des mises à jour est introuvable.",
    serveur: "Le site ne répond pas correctement.", format: "Les informations de mise à jour sont illisibles.", adresse: "Adresse du site invalide.",
    empreinte: "Le fichier téléchargé est abîmé : réessaie.", signature: "Ce fichier n’est pas signé comme ton appli : installation refusée.",
    absent: "Le fichier n’est plus là : relance la mise à jour."
  }[e] || "La mise à jour n’a pas marché.";
}
function enregistrerMaj(c) { D.config.maj = c; ecrire(); }

/* ---------- vérifier ---------- */
function verifierMaj(manuel) {
  if (!majPossible()) { if (manuel) toast("Pas de site de mises à jour pour cette version."); return; }
  if (MAJ.etat === "verif" || MAJ.etat === "telechargement") return;
  MAJ.etat = "verif";
  MAJ.manuel = !!manuel;
  MAJ.erreur = "";
  majVuesMaj();
  natif("majVerifier", adresseMaj());
}
/** Au démarrage et au retour dans l'appli : au plus une fois toutes les 6 h. */
function verifierMajAuto() {
  if (!majPossible()) return;
  const c = reglagesMaj();
  if (c.derniere && !(Number(c.derniere.versionCode) > codeInstalle())) { c.derniere = null; enregistrerMaj(c); }
  if (!c.auto) return;
  const t = Date.parse(c.verifie);
  if (t && Date.now() - t < MAJ_INTERVALLE) return;
  verifierMaj(false);
}
function recevoirMaj(r) {
  const c = reglagesMaj(), manuel = MAJ.manuel;
  c.verifie = maintenantIso();
  MAJ.manuel = false;
  let info = null;
  if (r && r.ok) { try { info = infoMaj(JSON.parse(str(r.texte))); } catch (e) { info = null; } }
  if (!info) {
    MAJ.etat = "erreur";
    MAJ.erreur = r && r.ok ? "format" : str(r && r.erreur) || "erreur";
    enregistrerMaj(c);
    if (manuel) toast(messageErreurMaj(MAJ.erreur));
    majVuesMaj();
    return;
  }
  const dispo = info.versionCode > codeInstalle();
  MAJ.info = info;
  MAJ.etat = dispo ? "dispo" : "ajour";
  c.derniere = dispo ? info : null;
  enregistrerMaj(c);
  if (manuel) toast(dispo ? "Tableau " + info.versionName + " est disponible" : "Tu as la dernière version (" + (INFOS.version || info.versionName) + ")");
  majVuesMaj();
}

/* ---------- télécharger puis installer ---------- */
function telechargerMaj() {
  const i = infoAJour();
  if (!i || MAJ.etat === "telechargement") return;
  MAJ.info = i;
  MAJ.etat = "telechargement";
  MAJ.fait = 0;
  MAJ.total = i.taille;
  MAJ.erreur = "";
  majVuesMaj();
  natif("majTelecharger", i.apk, i.sha256);
}
function progresMaj(p) {
  MAJ.fait = Number(p.fait) || 0;
  if (Number(p.total) > 0) MAJ.total = Number(p.total);
  const pc = MAJ.total ? Math.min(100, Math.round(MAJ.fait * 100 / MAJ.total)) : 0;
  $$(".maj-barre i").forEach(b => { b.style.transform = `scaleX(${pc / 100})`; });
  $$(".maj-pc").forEach(x => { x.textContent = MAJ.total ? pc + " %" : fmtTaille(MAJ.fait); });
}
function majTelechargee(r) {
  if (r && r.ok) {
    MAJ.etat = "pret";
    majVuesMaj();
    installerMaj();
    return;
  }
  MAJ.etat = "erreur";
  MAJ.erreur = str(r && r.erreur) || "erreur";
  toast(messageErreurMaj(MAJ.erreur));
  majVuesMaj();
}
function etatInstall() {
  try { return JSON.parse(natif("majEtat") || "{}") || {}; } catch (e) { return {}; }
}
function installerMaj() {
  if (etatInstall().autorise === false) { feuilleAutorisationMaj(); return; }
  const r = natif("majInstaller");
  if (r === "ok") toast("Android te demande de confirmer : touche « Mettre à jour »");
  else if (r === "autorisation") MAJ.attenteAutorisation = true;
  else if (r === "absent") { MAJ.etat = "dispo"; majVuesMaj(); toast(messageErreurMaj("absent")); }
}
function feuilleAutorisationMaj() {
  ouvrirFeuille(`${tete("Une autorisation, une seule fois")}<div class="sheet-body">
    <p>Pour que le Tableau puisse installer ses mises à jour, Android demande de l’autoriser.</p>
    <ol class="maj-etapes"><li>Touche « Ouvrir le réglage ».</li><li>Active « Autoriser cette source ».</li><li>Reviens ici : l’installation continue toute seule.</li></ol>
    <p class="hint">Ça ne concerne que le Tableau. Tes données restent dans le téléphone pendant la mise à jour.</p></div>
    <div class="sheet-actions"><button class="btn primary" type="button" data-act="maj-autoriser">Ouvrir le réglage</button><button class="btn" type="button" data-act="fermer">Plus tard</button></div>`, "maj-autorisation");
}
function autoriserMaj() {
  fermerFeuille();
  MAJ.attenteAutorisation = true;
  natif("majInstaller");
}
/** Retour dans l'appli après le réglage Android. */
function reprendreMaj() {
  if (!MAJ.attenteAutorisation) return;
  if (etatInstall().autorise === false) return;
  MAJ.attenteAutorisation = false;
  installerMaj();
}
function plusTardMaj() {
  const i = infoAJour();
  if (!i) return;
  const c = reglagesMaj();
  c.ignore = i.versionCode;
  enregistrerMaj(c);
  majVuesMaj();
  toast("D’accord. Elle reste dans Paramètres › Mises à jour.");
}

/* ---------- affichage ---------- */
function blocProgres() {
  const pc = MAJ.total ? Math.min(100, Math.round(MAJ.fait * 100 / MAJ.total)) : 0;
  return `<div class="maj-prog"><span class="maj-barre" aria-hidden="true"><i style="transform:scaleX(${pc / 100})"></i></span><span class="maj-pc">${MAJ.total ? pc + " %" : ""}</span></div>`;
}
function boutonsMaj(carte) {
  if (MAJ.etat === "telechargement") return `<p class="muted" style="margin:0">Téléchargement…</p>${blocProgres()}`;
  if (MAJ.etat === "pret") return `<div class="maj-actions"><button class="btn primary" type="button" data-act="maj-installer">Installer</button>${carte ? `<button class="btn" type="button" data-act="maj-plus-tard">Plus tard</button>` : ""}</div>`;
  return `<div class="maj-actions"><button class="btn primary" type="button" data-act="maj-telecharger">Mettre à jour</button>${carte ? `<button class="btn" type="button" data-act="maj-plus-tard">Plus tard</button>` : ""}</div>`;
}
/** Carte en haut de l'accueil quand une nouvelle version est là. */
function carteMaj() {
  const i = infoAJour();
  if (!i || (reglagesMaj().ignore === i.versionCode && MAJ.etat !== "telechargement" && MAJ.etat !== "pret")) return "";
  const nouv = i.nouveautes.slice(0, 3);
  return `<section class="block" id="maj-carte"><div class="maj-card">
    <p class="eyebrow">Mise à jour${i.taille ? " · " + esc(fmtTaille(i.taille)) : ""}</p>
    <p class="maj-titre">Tableau ${esc(i.versionName)} est disponible</p>
    ${nouv.length ? `<ul class="maj-nouv">${nouv.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${MAJ.etat === "erreur" && MAJ.erreur ? `<p class="err" style="margin:0">${esc(messageErreurMaj(MAJ.erreur))}</p>` : ""}
    ${boutonsMaj(true)}</div></section>`;
}
/** Section de Paramètres. */
function sectionMaj() {
  const c = reglagesMaj(), i = infoAJour();
  let etat;
  if (!majPossible()) etat = `<p class="muted" style="margin:0">Cette version n’est reliée à aucun site de mises à jour.</p>`;
  else if (MAJ.etat === "verif") etat = `<p class="muted" style="margin:0">Vérification…</p>`;
  else if (i) etat = `<p class="maj-titre">Tableau ${esc(i.versionName)} est disponible</p>${i.nouveautes.length ? `<ul class="maj-nouv">${i.nouveautes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${boutonsMaj(false)}`;
  else if (MAJ.etat === "erreur") etat = `<p class="err" style="margin:0">${esc(messageErreurMaj(MAJ.erreur))}</p>`;
  else etat = `<p class="muted" style="margin:0">${c.verifie ? "À jour · vérifié " + esc(fmtStamp(c.verifie)) : "Pas encore vérifié"}</p>`;
  return `<div class="card" id="maj-reglages">
    <p class="muted" style="margin:0">Version installée : <b>${esc(INFOS.version || "?")}</b></p>
    ${etat}
    ${majPossible() && !i && MAJ.etat !== "verif" ? `<div><button class="btn sm" type="button" data-act="maj-verifier">Vérifier maintenant</button></div>` : ""}
    ${majPossible() ? `<label class="switch" for="r-maj-auto"><span>Vérifier toute seule<small>Au plus une fois toutes les 6 heures, quand tu ouvres l’appli</small></span><input type="checkbox" id="r-maj-auto"${c.auto ? " checked" : ""}></label>
    <p class="hint">Depuis ${esc(hoteMaj())}. L’appli lit seulement le numéro de la dernière version : rien de ton tableau n’est envoyé. Tes données restent dans le téléphone pendant la mise à jour.</p>` : ""}</div>`;
}
/** Met à jour la carte et la section sans tout redessiner. */
function majVuesMaj() {
  const s = $("#maj-reglages");
  if (s) s.outerHTML = sectionMaj();
  if (ST.route === "accueil" && !ST.q.trim()) {
    const k = $("#maj-carte"), h = carteMaj();
    if (k) { if (h) k.outerHTML = h; else k.remove(); }
    else if (h) { const hb = $("#home-body"); if (hb) hb.insertAdjacentHTML("afterbegin", h); }
  }
}
