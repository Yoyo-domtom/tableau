# Tableau

Appli Android hors ligne pour ranger ses cours, son planning, ses notes, ses photos et ses PDF.

**Télécharger :** voir la page du site (GitHub Pages de ce dépôt). Une fois installée, l’appli se met à jour toute seule : elle lit `version.json` sur le site, télécharge le nouvel APK, vérifie son empreinte SHA-256 et sa signature, puis ouvre l’installateur d’Android. Les données restent dans le téléphone ; rien n’est envoyé au site.

## Organisation

- `app/` : sources de l’appli (WebView + pont Java, aucune dépendance).
- `site/modele.html` : page de téléchargement.
- `outils/publier.py` : compile, signe et prépare le site (page, `version.json`, APK).
- `.github/workflows/publier.yml` : publication automatique à chaque modification sur `main`.

## Publier une version

1. Monter `android:versionCode` (et `versionName`) dans `app/AndroidManifest.xml`, mettre à jour `VERSION_NOUVEAUTES` / `NOUVEAUTES` dans `app/assets/js/vues.js`.
2. Pousser sur `main`. Le workflow compile, signe avec la clé (secrets `TABLEAU_CLE` en base64 et `TABLEAU_CLE_MDP`) et met le site à jour.

La clé de signature ne doit jamais être dans le dépôt : sans elle, une nouvelle version ne s’installe pas par-dessus l’ancienne.
