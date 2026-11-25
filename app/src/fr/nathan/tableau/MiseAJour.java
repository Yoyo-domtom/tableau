package fr.nathan.tableau;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.security.MessageDigest;
import java.util.Arrays;

/**
 * Mises à jour depuis le site de l'appli : lire version.json, télécharger le nouvel APK
 * (empreinte SHA-256 et signature vérifiées : même clé que l'appli installée), puis ouvrir
 * l'installateur d'Android. Les données restent en place (même appli, même signature).
 */
final class MiseAJour {
    static final String NOM_APK = "tableau-maj.apk";
    private static final long MAX_APK = 80L * 1024 * 1024;
    private static final int MAX_JSON = 256 * 1024;

    private MiseAJour() { }

    interface Suivi { void progres(long fait, long total); }

    static File dossier(Context c) {
        File d = new File(c.getCacheDir(), "maj");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static File apk(Context c) { return new File(dossier(c), NOM_APK); }

    /** Seulement https. */
    static boolean adresseValide(String u) {
        if (u == null || u.length() > 500) return false;
        try {
            URL x = new URL(u);
            return "https".equals(x.getProtocol()) && x.getHost() != null && x.getHost().length() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static HttpURLConnection ouvrir(String adresse) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(adresse).openConnection();
        c.setConnectTimeout(12000);
        c.setReadTimeout(25000);
        c.setInstanceFollowRedirects(true);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "Tableau-Android");
        c.setRequestProperty("Cache-Control", "no-cache");
        return c;
    }

    /** Lit le fichier version.json du site (court). */
    static String lireTexte(String adresse) throws IOException {
        String u = adresse + (adresse.indexOf('?') >= 0 ? "&" : "?") + "t=" + System.currentTimeMillis();
        HttpURLConnection c = ouvrir(u);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            InputStream in = c.getInputStream();
            try {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] b = new byte[8192];
                int n, total = 0;
                while ((n = in.read(b)) > 0) {
                    total += n;
                    if (total > MAX_JSON) throw new IOException("trop gros");
                    out.write(b, 0, n);
                }
                return out.toString("UTF-8");
            } finally {
                in.close();
            }
        } finally {
            c.disconnect();
        }
    }

    /** Télécharge l'APK et le contrôle ; renvoie le fichier prêt à installer. */
    static File telecharger(Context ctx, String adresse, String sha256, Suivi suivi) throws Exception {
        File dest = apk(ctx), tmp = new File(dossier(ctx), NOM_APK + ".part");
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        HttpURLConnection c = ouvrir(adresse);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            long total = c.getContentLength();
            InputStream in = c.getInputStream();
            OutputStream out = new FileOutputStream(tmp);
            try {
                byte[] b = new byte[65536];
                int n;
                long fait = 0, dernier = 0;
                while ((n = in.read(b)) > 0) {
                    out.write(b, 0, n);
                    md.update(b, 0, n);
                    fait += n;
                    if (fait > MAX_APK) throw new IOException("trop gros");
                    long t = System.currentTimeMillis();
                    if (suivi != null && t - dernier > 150) {
                        dernier = t;
                        suivi.progres(fait, total);
                    }
                }
                if (suivi != null) suivi.progres(fait, total);
            } finally {
                out.close();
                in.close();
            }
        } finally {
            c.disconnect();
        }
        String attendu = sha256 == null ? "" : sha256.trim();
        if (attendu.length() > 0 && !hex(md.digest()).equalsIgnoreCase(attendu)) {
            tmp.delete();
            throw new SecurityException("empreinte");
        }
        if (!memeSignature(ctx, tmp)) {
            tmp.delete();
            throw new SecurityException("signature");
        }
        if (dest.exists()) dest.delete();
        if (!tmp.renameTo(dest)) throw new IOException("renommage");
        dest.setReadable(true, false);
        return dest;
    }

    /** Le nouvel APK est-il bien cette appli, signée avec la même clé ? (Android refuserait sinon, mais on le dit plus clairement.) */
    @SuppressWarnings("deprecation")
    static boolean memeSignature(Context c, File f) {
        try {
            PackageManager pm = c.getPackageManager();
            PackageInfo neuf = pm.getPackageArchiveInfo(f.getAbsolutePath(), PackageManager.GET_SIGNATURES);
            if (neuf == null) return false;
            if (!c.getPackageName().equals(neuf.packageName)) return false;
            PackageInfo actuel = pm.getPackageInfo(c.getPackageName(), PackageManager.GET_SIGNATURES);
            if (neuf.signatures == null || neuf.signatures.length == 0 || actuel.signatures == null) return true; // Android vérifiera à l'installation
            return Arrays.equals(empreintes(neuf.signatures), empreintes(actuel.signatures));
        } catch (Throwable e) {
            return false;
        }
    }

    private static String[] empreintes(Signature[] sigs) throws Exception {
        String[] r = new String[sigs.length];
        for (int i = 0; i < sigs.length; i++) r[i] = hex(MessageDigest.getInstance("SHA-256").digest(sigs[i].toByteArray()));
        Arrays.sort(r);
        return r;
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format("%02x", x & 0xff));
        return s.toString();
    }

    /** Android 8+ : l'utilisateur doit autoriser Tableau à installer des applis (une seule fois). */
    static boolean installationAutorisee(Context c) {
        if (Build.VERSION.SDK_INT < 26) return true;
        try {
            Object r = PackageManager.class.getMethod("canRequestPackageInstalls").invoke(c.getPackageManager());
            return Boolean.TRUE.equals(r);
        } catch (Throwable e) {
            return true;
        }
    }

    static void ouvrirAutorisation(Activity a) {
        try {
            a.startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + a.getPackageName())));
        } catch (Throwable e) {
            a.startActivity(new Intent(android.provider.Settings.ACTION_SECURITY_SETTINGS));
        }
    }

    /** Ouvre l'installateur d'Android sur l'APK téléchargé. */
    static void installer(Activity a) throws Exception {
        File f = apk(a);
        if (!f.exists()) throw new IOException("absent");
        Intent i = new Intent(Intent.ACTION_VIEW);
        if (Build.VERSION.SDK_INT >= 24) {
            i.setDataAndType(FichierProvider.uriMaj(NOM_APK), "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            File ext = a.getExternalCacheDir();
            File copie = new File(ext != null ? ext : a.getCacheDir(), NOM_APK);
            Fichiers.copierVersFichier(new java.io.FileInputStream(f), copie, MAX_APK);
            copie.setReadable(true, false);
            i.setDataAndType(Uri.fromFile(copie), "application/vnd.android.package-archive");
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        a.startActivity(i);
    }

    /** Raison courte pour la page. */
    static String raison(Throwable e) {
        if (e instanceof UnknownHostException || e instanceof ConnectException) return "reseau";
        if (e instanceof SocketTimeoutException) return "lent";
        if (e instanceof SecurityException) return "signature".equals(e.getMessage()) ? "signature" : "empreinte";
        String m = e.getMessage() == null ? "" : e.getMessage();
        if (m.startsWith("HTTP 404")) return "introuvable";
        if (m.startsWith("HTTP")) return "serveur";
        if (m.equals("absent")) return "absent";
        return "erreur";
    }

    /** Ménage : l'APK téléchargé ne sert plus une fois l'appli à jour (ou s'il est plus ancien). */
    @SuppressWarnings("deprecation")
    static void nettoyerSiAJour(Context c) {
        try {
            File f = apk(c);
            if (!f.exists()) return;
            PackageInfo neuf = c.getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
            PackageInfo actuel = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            if (neuf == null || neuf.versionCode <= actuel.versionCode) {
                File[] l = dossier(c).listFiles();
                if (l != null) for (File x : l) x.delete();
            }
        } catch (Throwable ignored) { }
    }
}
