package fr.nathan.tableau;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Tableau : l'interface est une page web embarquée (assets/), servie depuis une adresse
 * locale réservée par Android. Le tableau est un fichier JSON privé ; les photos et PDF
 * sont rangés dans files/fichiers. La page parle à Android par window.Android.
 */
public class MainActivity extends Activity {
    static final String HOTE = "appassets.androidplatform.net";
    static final String BASE = "https://" + HOTE + "/";
    private static final int REQ_CHOIX = 11;
    private static final int REQ_PHOTO = 12;
    private static final int REQ_SAUVEGARDE = 13;
    private static final int REQ_RESTAURATION = 14;
    private static final int REQ_NOTIF = 15;
    private static final int PAPER_LIGHT = 0xFFF1F4F6;
    private static final int PAPER_DARK = 0xFF0D1319;
    private static final int SHEET_LIGHT = 0xFFFFFFFF;
    private static final int SHEET_DARK = 0xFF151D25;
    private static final int LIGHT_NAV_FLAG = 0x00000010;
    private static final String PERM_NOTIF = "android.permission.POST_NOTIFICATIONS";

    private WebView web;
    private SharedPreferences prefs;
    private boolean pagePrete = false;
    private final ArrayList<String> enAttente = new ArrayList<String>();

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        Journal.installer(getApplicationContext());
        prefs = getSharedPreferences("etat", MODE_PRIVATE);
        appliquerBarres();
        nettoyerTmp();

        web = new WebView(this);
        web.setBackgroundColor(nuit() ? PAPER_DARK : PAPER_LIGHT);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.addJavascriptInterface(new Pont(), "Android");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());
        setContentView(web);
        frequenceMax();
        new Thread(new Runnable() {
            @Override
            public void run() { MiseAJour.nettoyerSiAJour(getApplicationContext()); }
        }).start();
        web.loadUrl(BASE + "assets/index.html");
        if (etat == null) traiterIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        traiterIntent(intent);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) verifierPressePapiers();
    }

    @Override
    public void onBackPressed() {
        if (web == null || !pagePrete) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.tableauRetour && window.tableauRetour()) ? 1 : 0", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"1".equals(value)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ---------- page web ----------

    private class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (u == null || !HOTE.equals(u.getHost())) return vide(403, "Forbidden");
            return servir(u);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri u = Uri.parse(url);
            if (HOTE.equals(u.getHost())) return false;
            ouvrirExterne(url);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            pagePrete = false;
        }
    }

    private WebResourceResponse servir(Uri u) {
        String chemin = u.getPath();
        if (chemin == null) chemin = "/";
        try {
            if (chemin.startsWith("/assets/")) {
                String nom = chemin.substring(8);
                if (nom.contains("..")) return vide(404, "Not Found");
                InputStream in = getAssets().open(nom);
                return reponse(mimeAsset(nom), in, "no-cache");
            }
            List<String> seg = u.getPathSegments();
            if (seg.size() >= 2 && "f".equals(seg.get(0))) {
                File f = Fichiers.original(this, seg.get(1));
                if (f != null) return reponse(Fichiers.mimeDe(f.getName()), new FileInputStream(f), "max-age=31536000");
            }
            if (seg.size() >= 2 && "m".equals(seg.get(0))) {
                File f = Fichiers.miniature(this, seg.get(1));
                if (f != null) return reponse("image/jpeg", new FileInputStream(f), "max-age=31536000");
            }
            if (seg.size() >= 3 && "p".equals(seg.get(0))) {
                int page = Integer.parseInt(seg.get(2));
                int w = 1080;
                try { w = Integer.parseInt(u.getQueryParameter("w")); } catch (Exception ignored) { }
                File f = Fichiers.pagePdf(this, seg.get(1), page, w);
                if (f != null) return reponse("image/jpeg", new FileInputStream(f), "max-age=31536000");
            }
        } catch (Throwable ignored) { }
        return vide(404, "Not Found");
    }

    private static String mimeAsset(String nom) {
        if (nom.endsWith(".html")) return "text/html";
        if (nom.endsWith(".css")) return "text/css";
        if (nom.endsWith(".js")) return "text/javascript";
        if (nom.endsWith(".woff2")) return "font/woff2";
        if (nom.endsWith(".json")) return "application/json";
        if (nom.endsWith(".png")) return "image/png";
        if (nom.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    private static WebResourceResponse reponse(String mime, InputStream in, String cache) {
        Map<String, String> h = new HashMap<String, String>();
        h.put("Cache-Control", cache);
        h.put("Access-Control-Allow-Origin", "*");
        boolean texte = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json");
        return new WebResourceResponse(mime, texte ? "utf-8" : null, 200, "OK", h, in);
    }

    private static WebResourceResponse vide(int code, String raison) {
        return new WebResourceResponse("text/plain", "utf-8", code, raison,
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    /** Envoie un évènement à la page (mis en file tant qu'elle n'est pas prête). */
    void versPage(String type, JSONObject data) {
        String json = data == null ? "{}" : data.toString();
        final String js = "window.Native&&Native.recevoir(" + JSONObject.quote(type) + ","
                + JSONObject.quote(json).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029") + ")";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web == null) return;
                if (!pagePrete) {
                    enAttente.add(js);
                    return;
                }
                web.evaluateJavascript(js, null);
            }
        });
    }

    // ---------- intents reçus (partage vers Tableau, notification) ----------

    private void traiterIntent(Intent i) {
        if (i == null) return;
        String action = i.getAction();
        try {
            if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                CharSequence cs = i.getCharSequenceExtra(Intent.EXTRA_TEXT);
                final String texte = cs == null ? "" : cs.toString();
                final String sujet = i.getStringExtra(Intent.EXTRA_SUBJECT);
                final ArrayList<Uri> uris = new ArrayList<Uri>();
                if (Intent.ACTION_SEND.equals(action)) {
                    Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
                    if (u != null) uris.add(u);
                } else {
                    ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                    if (l != null) uris.addAll(l);
                }
                if (uris.isEmpty() && i.getClipData() != null) {
                    ClipData cd = i.getClipData();
                    for (int k = 0; k < cd.getItemCount(); k++) {
                        Uri u = cd.getItemAt(k).getUri();
                        if (u != null) uris.add(u);
                    }
                }
                if (uris.isEmpty()) {
                    JSONObject o = new JSONObject();
                    o.put("texte", texte);
                    o.put("sujet", sujet == null ? "" : sujet);
                    o.put("fichiers", new JSONArray());
                    versPage("partage", o);
                } else {
                    final Context app = getApplicationContext();
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            JSONObject o = Fichiers.importerUris(app, uris, "", "partage");
                            try {
                                o.put("texte", texte);
                                o.put("sujet", sujet == null ? "" : sujet);
                            } catch (Exception ignored) { }
                            versPage("partage", o);
                        }
                    }).start();
                }
                setIntent(new Intent(this, MainActivity.class));
            } else if (i.hasExtra("aller") || i.hasExtra("cle")) {
                // Notification touchée : le rappel est vu, ses répétitions et sa sonnerie s'arrêtent.
                Rappels.acquitter(getApplicationContext(), i.getStringExtra("cle"));
                String aller = i.getStringExtra("aller");
                if (aller != null && aller.length() > 0) {
                    JSONObject o = new JSONObject();
                    o.put("id", aller);
                    versPage("aller", o);
                }
                i.removeExtra("aller");
                i.removeExtra("cle");
            }
        } catch (Throwable ignored) { }
    }

    private void verifierPressePapiers() {
        try {
            if (System.currentTimeMillis() > prefs.getLong("attente.claude", 0)) return;
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return;
            ClipDescription d = cm.getPrimaryClipDescription();
            if (d == null || !(d.hasMimeType("text/*"))) return;
            ClipData c = cm.getPrimaryClip();
            if (c == null || c.getItemCount() == 0) return;
            CharSequence t = c.getItemAt(0).coerceToText(this);
            if (t == null) return;
            String s = t.toString();
            if (!s.contains("tableau-changes") || s.startsWith("Voici mon Tableau")) return;
            int h = s.hashCode();
            if (prefs.getInt("pp.vu", 0) == h) return;
            prefs.edit().putInt("pp.vu", h).apply();
            JSONObject o = new JSONObject();
            o.put("texte", s);
            versPage("presse-papiers", o);
        } catch (Throwable ignored) { }
    }

    // ---------- choix de fichiers, photo, sauvegarde ----------

    private void lancerChoix(String mode, String cible, String ctx) {
        prefs.edit().putString("choix.cible", cible == null ? "" : cible).putString("choix.ctx", ctx == null ? "" : ctx).apply();
        try {
            if ("photo".equals(mode)) {
                File f = new File(Fichiers.dossierTmp(this), "photo_" + System.currentTimeMillis() + ".jpg");
                Uri uri = FichierProvider.uriTmp(f.getName());
                Intent it = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                it.putExtra(MediaStore.EXTRA_OUTPUT, uri);
                it.setClipData(ClipData.newRawUri("photo", uri));
                it.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                prefs.edit().putString("photo", f.getAbsolutePath()).apply();
                startActivityForResult(it, REQ_PHOTO);
            } else if ("galerie".equals(mode)) {
                Intent it;
                if (Build.VERSION.SDK_INT >= 33) {
                    it = new Intent("android.provider.action.PICK_IMAGES");
                    it.setType("image/*");
                    it.putExtra("android.provider.extra.PICK_IMAGES_MAX", 30);
                } else {
                    it = new Intent(Intent.ACTION_GET_CONTENT);
                    it.setType("image/*");
                    it.addCategory(Intent.CATEGORY_OPENABLE);
                    it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                startActivityForResult(it, REQ_CHOIX);
            } else {
                Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                it.addCategory(Intent.CATEGORY_OPENABLE);
                it.setType("*/*");
                it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                startActivityForResult(it, REQ_CHOIX);
            }
        } catch (ActivityNotFoundException e) {
            if ("galerie".equals(mode)) {
                lancerChoix("fichiers", cible, ctx);
                return;
            }
            resultatVide(cible, ctx, "photo".equals(mode) ? "Aucune appli d’appareil photo trouvée." : "Aucune appli pour choisir un fichier.");
        } catch (Throwable t) {
            resultatVide(cible, ctx, "Impossible d’ouvrir le sélecteur.");
        }
    }

    private void resultatVide(String cible, String ctx, String erreur) {
        try {
            JSONObject o = new JSONObject();
            o.put("cible", cible);
            o.put("ctx", ctx);
            o.put("fichiers", new JSONArray());
            JSONArray e = new JSONArray();
            if (erreur != null) e.put(erreur);
            else o.put("annule", true);
            o.put("erreurs", e);
            versPage("fichiers", o);
        } catch (Exception ignored) { }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        final String cible = prefs.getString("choix.cible", "");
        final String ctx = prefs.getString("choix.ctx", "");
        final Context app = getApplicationContext();
        if (req == REQ_CHOIX) {
            if (res != RESULT_OK || data == null) {
                resultatVide(cible, ctx, null);
                return;
            }
            final ArrayList<Uri> uris = new ArrayList<Uri>();
            ClipData cd = data.getClipData();
            if (cd != null) {
                for (int k = 0; k < cd.getItemCount(); k++) {
                    Uri u = cd.getItemAt(k).getUri();
                    if (u != null) uris.add(u);
                }
            }
            if (uris.isEmpty() && data.getData() != null) uris.add(data.getData());
            if (uris.isEmpty()) {
                resultatVide(cible, ctx, null);
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    versPage("fichiers", Fichiers.importerUris(app, uris, cible, ctx));
                }
            }).start();
        } else if (req == REQ_PHOTO) {
            String chemin = prefs.getString("photo", "");
            prefs.edit().remove("photo").apply();
            final File f = chemin.length() > 0 ? new File(chemin) : null;
            if (res != RESULT_OK || f == null || !f.exists() || f.length() == 0) {
                if (f != null) f.delete();
                resultatVide(cible, ctx, null);
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    JSONObject o = new JSONObject();
                    JSONArray ok = new JSONArray();
                    JSONArray err = new JSONArray();
                    try {
                        String nom = "Photo du " + new SimpleDateFormat("d MMM yyyy, HH:mm", Locale.FRANCE).format(new Date());
                        ok.put(Fichiers.traiter(app, f, "image/jpeg", nom));
                    } catch (Throwable t) {
                        err.put("La photo n’a pas pu être enregistrée.");
                    } finally {
                        if (f.exists()) f.delete();
                    }
                    try {
                        o.put("cible", cible);
                        o.put("ctx", ctx);
                        o.put("fichiers", ok);
                        o.put("erreurs", err);
                    } catch (Exception ignored) { }
                    versPage("fichiers", o);
                }
            }).start();
        } else if (req == REQ_SAUVEGARDE) {
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            final Uri u = data.getData();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    versPage("sauvegarde", Sauvegarde.exporter(app, u));
                }
            }).start();
        } else if (req == REQ_RESTAURATION) {
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            final Uri u = data.getData();
            new Thread(new Runnable() {
                @Override
                public void run() {
                    versPage("restauration", Sauvegarde.importer(app, u));
                }
            }).start();
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req == REQ_NOTIF) envoyerEtatNotifications();
    }

    private void envoyerEtatNotifications() {
        try {
            JSONObject o = new JSONObject();
            o.put("etat", etatNotifications());
            versPage("notif", o);
        } catch (Exception ignored) { }
    }

    private String etatNotifications() {
        boolean actives = Rappels.notificationsActives(this);
        if (Build.VERSION.SDK_INT < 33) return actives ? "oui" : "bloque";
        if (checkSelfPermission(PERM_NOTIF) == PackageManager.PERMISSION_GRANTED) return actives ? "oui" : "bloque";
        if (prefs.getBoolean("notif.demandee", false) && !shouldShowRequestPermissionRationale(PERM_NOTIF)) return "bloque";
        return "a-demander";
    }

    // ---------- outils ----------

    private void ouvrirExterne(String url) {
        try {
            Intent it = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Exception e) {
            Toast.makeText(this, "Aucune appli pour ouvrir ce lien", Toast.LENGTH_SHORT).show();
        }
    }

    private void copierTexte(String texte) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Tableau", texte));
    }

    private static String nomPartage(String affiche, String stocke) {
        String n = affiche == null ? "" : affiche.replaceAll("[\\\\/:*?\"<>|\\n\\r\\t]", " ").trim();
        if (n.length() == 0) n = "Fichier";
        if (n.length() > 80) n = n.substring(0, 80).trim();
        String ext = Fichiers.extension(stocke);
        if (ext.length() > 0 && !Fichiers.extension(n).equals(ext) && !(ext.equals("jpg") && Fichiers.extension(n).equals("jpeg"))) n = n + "." + ext;
        return n;
    }

    /** Écran à sa fréquence la plus haute (120 Hz si possible) pour des animations fluides. */
    private void frequenceMax() {
        try {
            if (Build.VERSION.SDK_INT >= 23) Ecran.frequenceMax(this);
        } catch (Throwable ignored) { }
    }

    private boolean nuit() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private void appliquerBarres() {
        if (Build.VERSION.SDK_INT < 21) return;
        Window w = getWindow();
        boolean n = nuit();
        boolean navClaire = Build.VERSION.SDK_INT >= 26;
        w.setStatusBarColor(n ? PAPER_DARK : PAPER_LIGHT);
        w.setNavigationBarColor(n || !navClaire ? SHEET_DARK : SHEET_LIGHT);
        View decor = w.getDecorView();
        int f = decor.getSystemUiVisibility();
        if (Build.VERSION.SDK_INT >= 23) {
            if (n) f &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else f |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }
        if (navClaire) {
            if (n) f &= ~LIGHT_NAV_FLAG;
            else f |= LIGHT_NAV_FLAG;
        }
        decor.setSystemUiVisibility(f);
    }

    private void nettoyerTmp() {
        try {
            File[] l = Fichiers.dossierTmp(this).listFiles();
            if (l == null) return;
            String garder = prefs.getString("photo", "");
            long limite = System.currentTimeMillis() - 24L * 3600 * 1000;
            for (File f : l) {
                if (f.getAbsolutePath().equals(garder)) continue;
                if (f.lastModified() < limite) f.delete();
            }
        } catch (Throwable ignored) { }
    }

    // ---------- pont avec la page ----------

    private volatile boolean majEnCours = false;

    public class Pont {
        @JavascriptInterface
        public String charger() { return Stockage.charger(MainActivity.this); }

        @JavascriptInterface
        public boolean enregistrer(String json) { return Stockage.enregistrer(MainActivity.this, json); }

        @JavascriptInterface
        public void pret() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pagePrete = true;
                    if (web == null) return;
                    for (String js : enAttente) web.evaluateJavascript(js, null);
                    enAttente.clear();
                }
            });
        }

        @JavascriptInterface
        public String infos() {
            JSONObject o = new JSONObject();
            try {
                PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
                o.put("version", p.versionName);
                o.put("code", p.versionCode);
                o.put("maj", true);
                o.put("android", Build.VERSION.RELEASE);
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("appareil", Build.MANUFACTURER + " " + Build.MODEL);
            } catch (Exception ignored) { }
            return o.toString();
        }

        @JavascriptInterface
        public void copier(final String texte) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { copierTexte(texte); }
            });
        }

        @JavascriptInterface
        public String coller() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm == null || !cm.hasPrimaryClip()) return "";
                ClipData c = cm.getPrimaryClip();
                if (c == null || c.getItemCount() == 0) return "";
                CharSequence t = c.getItemAt(0).coerceToText(MainActivity.this);
                return t == null ? "" : t.toString();
            } catch (Throwable e) {
                return "";
            }
        }

        // ---------- mises à jour depuis le site de l'appli ----------

        /** Lit version.json ; réponse dans Native.recevoir("maj", {ok, texte | erreur}). */
        @JavascriptInterface
        public void majVerifier(final String adresse) {
            new Thread(new Runnable() {
                @Override
                public void run() {
                    JSONObject o = new JSONObject();
                    try {
                        if (!MiseAJour.adresseValide(adresse)) throw new java.io.IOException("adresse");
                        String t = MiseAJour.lireTexte(adresse);
                        o.put("ok", true);
                        o.put("texte", t);
                    } catch (Throwable e) {
                        try {
                            o.put("ok", false);
                            o.put("erreur", MiseAJour.raison(e));
                        } catch (Exception ignored) { }
                    }
                    versPage("maj", o);
                }
            }).start();
        }

        /** Télécharge et contrôle l'APK ; avancement dans "maj-progres", fin dans "maj-pret". */
        @JavascriptInterface
        public void majTelecharger(final String adresse, final String sha256) {
            if (majEnCours) return;
            majEnCours = true;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    JSONObject o = new JSONObject();
                    try {
                        if (!MiseAJour.adresseValide(adresse)) throw new java.io.IOException("adresse");
                        MiseAJour.telecharger(MainActivity.this, adresse, sha256, new MiseAJour.Suivi() {
                            @Override
                            public void progres(long fait, long total) {
                                try {
                                    JSONObject p = new JSONObject();
                                    p.put("fait", fait);
                                    p.put("total", total);
                                    versPage("maj-progres", p);
                                } catch (Exception ignored) { }
                            }
                        });
                        o.put("ok", true);
                    } catch (Throwable e) {
                        try {
                            o.put("ok", false);
                            o.put("erreur", MiseAJour.raison(e));
                        } catch (Exception ignored) { }
                    } finally {
                        majEnCours = false;
                    }
                    versPage("maj-pret", o);
                }
            }).start();
        }

        /** "ok" (l'installateur s'ouvre), "autorisation" (réglage Android ouvert : autoriser Tableau) ou "absent". */
        @JavascriptInterface
        public String majInstaller() {
            if (!MiseAJour.apk(MainActivity.this).exists()) return "absent";
            if (!MiseAJour.installationAutorisee(MainActivity.this)) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() { MiseAJour.ouvrirAutorisation(MainActivity.this); }
                });
                return "autorisation";
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        MiseAJour.installer(MainActivity.this);
                    } catch (Throwable e) {
                        Toast.makeText(MainActivity.this, "Impossible d’ouvrir l’installateur.", Toast.LENGTH_LONG).show();
                    }
                }
            });
            return "ok";
        }

        /** Autorisé à installer, et APK déjà téléchargé ? */
        @JavascriptInterface
        public String majEtat() {
            JSONObject o = new JSONObject();
            try {
                o.put("autorise", MiseAJour.installationAutorisee(MainActivity.this));
                o.put("telecharge", MiseAJour.apk(MainActivity.this).exists());
            } catch (Exception ignored) { }
            return o.toString();
        }

        /** Partage du texte et de fichiers (liste JSON de {fichier, nom}) vers une autre appli. */
        @JavascriptInterface
        public void partager(final String texte, final String fichiersJson) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        ArrayList<Uri> uris = new ArrayList<Uri>();
                        String type = null;
                        JSONArray a = new JSONArray(fichiersJson == null || fichiersJson.length() == 0 ? "[]" : fichiersJson);
                        for (int k = 0; k < a.length(); k++) {
                            JSONObject o = a.getJSONObject(k);
                            String f = o.optString("fichier", "");
                            if (Fichiers.original(MainActivity.this, f) == null) continue;
                            uris.add(FichierProvider.uriFichier(f, nomPartage(o.optString("nom", f), f)));
                            String m = Fichiers.mimeDe(f);
                            if (type == null) type = m;
                            else if (!type.equals(m)) type = (type.startsWith("image/") && m.startsWith("image/")) ? "image/*" : "*/*";
                        }
                        boolean aTexte = texte != null && texte.length() > 0;
                        Intent it;
                        if (uris.isEmpty()) {
                            it = new Intent(Intent.ACTION_SEND);
                            it.setType("text/plain");
                        } else if (uris.size() == 1) {
                            it = new Intent(Intent.ACTION_SEND);
                            it.setType(type);
                            it.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                        } else {
                            it = new Intent(Intent.ACTION_SEND_MULTIPLE);
                            it.setType(type);
                            it.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                        }
                        if (aTexte) it.putExtra(Intent.EXTRA_TEXT, texte);
                        if (!uris.isEmpty()) {
                            ClipData cd = ClipData.newRawUri("Tableau", uris.get(0));
                            for (int k = 1; k < uris.size(); k++) cd.addItem(new ClipData.Item(uris.get(k)));
                            it.setClipData(cd);
                            it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            if (aTexte) copierTexte(texte);
                        }
                        startActivity(Intent.createChooser(it, "Envoyer à Claude"));
                    } catch (Throwable t) {
                        if (texte != null && texte.length() > 0) copierTexte(texte);
                        Toast.makeText(MainActivity.this, "Partage impossible : le texte est copié, colle-le dans Claude.", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void ouvrirAvec(final String fichier, final String nom) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Fichiers.original(MainActivity.this, fichier) == null) return;
                    Intent it = new Intent(Intent.ACTION_VIEW);
                    Uri u = FichierProvider.uriFichier(fichier, nomPartage(nom, fichier));
                    it.setDataAndType(u, Fichiers.mimeDe(fichier));
                    it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(Intent.createChooser(it, "Ouvrir avec"));
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Aucune appli pour ouvrir ce fichier", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void ouvrirLien(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { ouvrirExterne(url); }
            });
        }

        /** mode : photo | galerie | fichiers ; ctx : où ranger le résultat côté page. */
        @JavascriptInterface
        public void choisir(final String mode, final String cible, final String ctx) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { lancerChoix(mode, cible, ctx); }
            });
        }

        @JavascriptInterface
        public void supprimerFichiers(String json) {
            try {
                Fichiers.supprimer(MainActivity.this, new JSONArray(json));
            } catch (Throwable ignored) { }
        }

        @JavascriptInterface
        public String espace() {
            long[] e = Fichiers.espace(MainActivity.this);
            return "{\"octets\":" + e[0] + ",\"nombre\":" + e[1] + "}";
        }

        @JavascriptInterface
        public void planifierRappels(String json) {
            try {
                Rappels.planifier(getApplicationContext(), json);
            } catch (Throwable ignored) { }
        }

        /** json : {mode, duree} — un rappel d'essai dans 5 secondes. */
        @JavascriptInterface
        public void testerRappel(String json) {
            try {
                Rappels.tester(getApplicationContext(), json);
            } catch (Throwable ignored) { }
        }

        /** Petit retour tactile : leger | confirme | long. */
        @JavascriptInterface
        public void vibrer(final String type) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    int k = 3; // KEYBOARD_TAP
                    if ("confirme".equals(type)) k = Build.VERSION.SDK_INT >= 30 ? 16 : 1; // CONFIRM, sinon VIRTUAL_KEY
                    else if ("long".equals(type)) k = 0; // LONG_PRESS
                    else if (Build.VERSION.SDK_INT >= 21) k = 4; // CLOCK_TICK
                    try { web.performHapticFeedback(k); } catch (Throwable ignored) { }
                }
            });
        }

        @JavascriptInterface
        public String etatNotifications() { return MainActivity.this.etatNotifications(); }

        @JavascriptInterface
        public void demanderNotifications() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(PERM_NOTIF) != PackageManager.PERMISSION_GRANTED) {
                        prefs.edit().putBoolean("notif.demandee", true).apply();
                        requestPermissions(new String[]{PERM_NOTIF}, REQ_NOTIF);
                    } else {
                        envoyerEtatNotifications();
                    }
                }
            });
        }

        @JavascriptInterface
        public void reglagesNotifications() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent it;
                        if (Build.VERSION.SDK_INT >= 26) {
                            it = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
                            it.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
                        } else {
                            it = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                        }
                        startActivity(it);
                    } catch (Exception e) {
                        try {
                            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
                        } catch (Exception ignored) { }
                    }
                }
            });
        }

        @JavascriptInterface
        public void sauvegarder(final String nom) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent it = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        it.addCategory(Intent.CATEGORY_OPENABLE);
                        it.setType("application/zip");
                        it.putExtra(Intent.EXTRA_TITLE, nom == null || nom.length() == 0 ? "Tableau-sauvegarde.zip" : nom);
                        startActivityForResult(it, REQ_SAUVEGARDE);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Impossible d’ouvrir l’enregistrement de fichiers", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void restaurer() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        it.addCategory(Intent.CATEGORY_OPENABLE);
                        it.setType("*/*");
                        it.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/octet-stream"});
                        startActivityForResult(it, REQ_RESTAURATION);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "Impossible d’ouvrir le choix de fichier", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public String dernierPlantage() {
            String s = Stockage.lire(Journal.fichier(MainActivity.this));
            return s == null ? "" : s;
        }

        @JavascriptInterface
        public void effacerPlantage() {
            Journal.fichier(MainActivity.this).delete();
        }

        /** La page attend une réponse de Claude jusqu'à cette heure (ms) : on regarde le presse-papiers au retour. */
        @JavascriptInterface
        public void attendreClaude(String jusqua) {
            try {
                prefs.edit().putLong("attente.claude", Long.parseLong(jusqua)).apply();
            } catch (Exception ignored) { }
        }
    }
}
