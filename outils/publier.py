#!/usr/bin/env python3
"""Compile et signe l'APK du Tableau, puis prépare le site de téléchargement (page, version.json, APK).

    python3 outils/publier.py --cle chemin/tableau.jks --source https://<pseudo>.github.io/tableau/version.json

Mot de passe de la clé : variable d'environnement TABLEAU_CLE_MDP, ou --mdp-fichier.
Outils Android : ANDROID_HOME (build-tools + platforms, comme sur GitHub Actions) ou ceux du système
(aapt, dalvik-exchange, zipalign, apksigner, /usr/lib/android-sdk). La clé ne doit jamais être dans le dépôt.
"""
import argparse, datetime, glob, hashlib, html, json, os, re, shutil, subprocess, sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(RACINE, "app")


def outils():
    """Chemins de aapt, du dexeur, de zipalign, d'apksigner et d'android.jar."""
    home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if home and os.path.isdir(os.path.join(home, "build-tools")):
        bt = sorted(glob.glob(os.path.join(home, "build-tools", "*")), key=lambda p: [int(x) if x.isdigit() else 0 for x in re.split(r"[.-]", os.path.basename(p))])[-1]
        plats = sorted(glob.glob(os.path.join(home, "platforms", "android-*", "android.jar")), key=lambda p: int(re.sub(r"\D", "", p.split("android-")[-1]) or 0))
        jar = next((p for p in plats if "android-34" in p), plats[-1])
        return {"aapt": os.path.join(bt, "aapt"), "d8": os.path.join(bt, "d8"), "dx": None,
                "zipalign": os.path.join(bt, "zipalign"), "apksigner": os.path.join(bt, "apksigner"), "jar": jar}
    return {"aapt": shutil.which("aapt"), "d8": shutil.which("d8"), "dx": shutil.which("dalvik-exchange"),
            "zipalign": shutil.which("zipalign"), "apksigner": shutil.which("apksigner"),
            "jar": "/usr/lib/android-sdk/platforms/android-23/android.jar"}


def lancer(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    sortie = "\n".join(l for l in (r.stdout + r.stderr).splitlines() if "JAVA_TOOL_OPTIONS" not in l)
    if r.returncode:
        sys.exit("Échec : " + " ".join(cmd[:2]) + "\n" + sortie)
    return sortie


def version():
    m = open(os.path.join(APP, "AndroidManifest.xml"), encoding="utf-8").read()
    code = int(re.search(r'android:versionCode="(\d+)"', m).group(1))
    nom = re.search(r'android:versionName="([^"]+)"', m).group(1)
    return code, nom


def nouveautes():
    """Les nouveautés affichées dans l'appli (vues.js) servent aussi pour le site."""
    v = open(os.path.join(APP, "assets", "js", "vues.js"), encoding="utf-8").read()
    m = re.search(r"const NOUVEAUTES = \[(.*?)\n\];", v, re.S)
    return json.loads("[" + m.group(1).strip().rstrip(",") + "]") if m else []


def compiler(source, cle, mdp_fichier, travail):
    t = outils()
    manquants = [k for k in ("aapt", "zipalign", "apksigner") if not t[k] or not os.path.exists(t[k])]
    if manquants or not os.path.exists(t["jar"]):
        sys.exit("Outils Android introuvables : " + ", ".join(manquants or ["android.jar"]))
    shutil.rmtree(travail, ignore_errors=True)
    src = os.path.join(travail, "app")
    shutil.copytree(APP, src)
    # L'adresse du site est mise dans l'appli seulement à la compilation.
    maj = os.path.join(src, "assets", "js", "maj.js")
    js = open(maj, encoding="utf-8").read()
    assert "__MAJ_SOURCE__" in js
    open(maj, "w", encoding="utf-8").write(js.replace('"__MAJ_SOURCE__"', json.dumps(source)))
    gen, obj, dex = (os.path.join(travail, d) for d in ("gen", "obj", "dex"))
    for d in (gen, obj, dex):
        os.makedirs(d)
    man, res, assets = (os.path.join(src, x) for x in ("AndroidManifest.xml", "res", "assets"))
    lancer([t["aapt"], "package", "-f", "-m", "-J", gen, "-M", man, "-S", res, "-I", t["jar"]])
    javas = [os.path.join(r, f) for base in (os.path.join(src, "src"), gen) for r, _, fs in os.walk(base) for f in fs if f.endswith(".java")]
    lancer(["javac", "-source", "8", "-target", "8", "-Xlint:-options", "-encoding", "UTF-8", "-bootclasspath", t["jar"], "-classpath", t["jar"], "-d", obj] + javas)
    classes = [os.path.join(r, f) for r, _, fs in os.walk(obj) for f in fs if f.endswith(".class")]
    if t["d8"] and os.path.exists(t["d8"]):
        lancer([t["d8"], "--release", "--min-api", "21", "--lib", t["jar"], "--output", dex] + classes)
    else:
        lancer([t["dx"], "--dex", "--output=" + os.path.join(dex, "classes.dex"), obj])
    brut, aligne, signe = (os.path.join(travail, x) for x in ("brut.apk", "aligne.apk", "signe.apk"))
    lancer([t["aapt"], "package", "-f", "-M", man, "-S", res, "-A", assets, "-I", t["jar"], "-F", brut])
    lancer([t["aapt"], "add", brut, "classes.dex"], cwd=dex)
    lancer([t["zipalign"], "-f", "-p", "4", brut, aligne])
    mdp = "file:" + mdp_fichier if mdp_fichier else "env:TABLEAU_CLE_MDP"
    lancer([t["apksigner"], "sign", "--ks", cle, "--ks-key-alias", "tableau", "--ks-pass", mdp, "--out", signe, aligne])
    lancer([t["apksigner"], "verify", signe])
    return signe


def site(apk, sortie, source):
    code, nom = version()
    base = source.rsplit("/", 1)[0] + "/"
    donnees = open(apk, "rb").read()
    sha, taille = hashlib.sha256(donnees).hexdigest(), len(donnees)
    nom_apk = f"Tableau-{nom}.apk"
    jour = datetime.date.today().isoformat()
    nouv = nouveautes()
    shutil.rmtree(sortie, ignore_errors=True)
    os.makedirs(sortie)
    shutil.copy(apk, os.path.join(sortie, nom_apk))
    info = {"app": "fr.nathan.tableau", "versionCode": code, "versionName": nom, "date": jour, "apk": base + nom_apk,
            "sha256": sha, "taille": taille, "nouveautes": nouv, "page": base}
    json.dump(info, open(os.path.join(sortie, "version.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    modele = open(os.path.join(RACINE, "site", "modele.html"), encoding="utf-8").read()
    mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    d = datetime.date.fromisoformat(jour)
    valeurs = {"VERSION": nom, "DATE": f"{d.day} {mois[d.month - 1]} {d.year}", "TAILLE": f"{taille / 1024:.0f} Ko" if taille < 1024 * 1024 else f"{taille / 1048576:.1f} Mo".replace(".", ","),
               "APK": nom_apk, "SHA256": sha}
    page = modele
    for k, v in valeurs.items():
        page = page.replace("{{" + k + "}}", html.escape(v))
    page = page.replace("{{NOUVEAUTES}}", "\n".join(f"<li>{html.escape(x)}</li>" for x in nouv))
    assert "{{" not in page, "modèle : une valeur manque"
    open(os.path.join(sortie, "index.html"), "w", encoding="utf-8").write(page)
    shutil.copy(os.path.join(APP, "res", "mipmap-xxxhdpi", "ic_launcher.png"), os.path.join(sortie, "icone.png"))
    for f in ("archivo-latin-wdth-normal.woff2", "source-sans-3-latin-wght-normal.woff2"):
        shutil.copy(os.path.join(APP, "assets", "fonts", f), os.path.join(sortie, f))
    open(os.path.join(sortie, ".nojekyll"), "w").close()
    return info


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cle", required=True, help="fichier .jks (alias « tableau »)")
    p.add_argument("--mdp-fichier", help="fichier contenant le mot de passe (sinon TABLEAU_CLE_MDP)")
    p.add_argument("--source", required=True, help="adresse publique de version.json")
    p.add_argument("--sortie", default=os.path.join(RACINE, "_site"))
    p.add_argument("--travail", default=os.path.join(RACINE, "build"))
    a = p.parse_args()
    if not re.match(r"^https://[^\s\"'<>]+/version\.json$", a.source):
        sys.exit("--source doit être une adresse https qui finit par /version.json")
    if not a.mdp_fichier and not os.environ.get("TABLEAU_CLE_MDP"):
        sys.exit("Mot de passe de la clé manquant (TABLEAU_CLE_MDP ou --mdp-fichier)")
    apk = compiler(a.source, a.cle, a.mdp_fichier, a.travail)
    info = site(apk, a.sortie, a.source)
    print(f"Tableau {info['versionName']} (code {info['versionCode']}) · {info['taille']} octets · sha256 {info['sha256']}")
    print("Site prêt dans", a.sortie)


if __name__ == "__main__":
    main()
