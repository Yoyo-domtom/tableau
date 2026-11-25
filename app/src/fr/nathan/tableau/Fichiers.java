package fr.nathan.tableau;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * Photos, PDF et autres fichiers joints : copie dans le stockage privé,
 * miniatures, rendu des pages PDF pour la visionneuse.
 */
final class Fichiers {
    private Fichiers() { }

    static final long MAX = 60L * 1024 * 1024;
    static final int COTE_MAX = 2400;
    static final int COTE_MINI = 480;
    static final Object VERROU_PDF = new Object();
    private static final Random RND = new Random();

    static final class TropGros extends IOException {
        TropGros() { super("trop gros"); }
    }

    static File dossier(Context c, String nom) {
        File d = new File(c.getFilesDir(), nom);
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static File dossierFichiers(Context c) { return dossier(c, "fichiers"); }

    static File dossierMiniatures(Context c) { return dossier(c, "miniatures"); }

    static File dossierTmp(Context c) { return dossier(c, "tmp"); }

    static File dossierPages(Context c) {
        File d = new File(c.getCacheDir(), "pages");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static boolean nomValide(String n) {
        return n != null && n.matches("[A-Za-z0-9_-]{1,64}(\\.[A-Za-z0-9]{1,8})?");
    }

    static String base(String n) {
        int i = n.lastIndexOf('.');
        return i > 0 ? n.substring(0, i) : n;
    }

    static String extension(String n) {
        if (n == null) return "";
        int i = n.lastIndexOf('.');
        return (i >= 0 && i < n.length() - 1) ? n.substring(i + 1).toLowerCase(Locale.ROOT) : "";
    }

    static String mimeDe(String nom) {
        String ext = extension(nom);
        if (ext.length() == 0) return "application/octet-stream";
        if (ext.equals("jpg") || ext.equals("jpeg")) return "image/jpeg";
        if (ext.equals("pdf")) return "application/pdf";
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null ? m : "application/octet-stream";
    }

    static String nouvelId() {
        String r = Integer.toString(RND.nextInt(1679616), 36);
        while (r.length() < 4) r = "0" + r;
        return "f" + Long.toString(System.currentTimeMillis(), 36) + r;
    }

    static File original(Context c, String nom) {
        if (!nomValide(nom)) return null;
        File f = new File(dossierFichiers(c), nom);
        return f.exists() ? f : null;
    }

    static File miniature(Context c, String nom) {
        if (!nomValide(nom)) return null;
        File f = new File(dossierMiniatures(c), base(nom) + ".jpg");
        return f.exists() ? f : null;
    }

    // ---------- import ----------

    static JSONObject importerUris(Context c, List<Uri> uris, String cible, String ctx) {
        JSONObject res = new JSONObject();
        JSONArray ok = new JSONArray();
        JSONArray erreurs = new JSONArray();
        try {
            res.put("cible", cible == null ? "" : cible);
            res.put("ctx", ctx == null ? "" : ctx);
            for (Uri u : uris) {
                String nom = "Un fichier";
                try {
                    String[] infos = infos(c, u);
                    if (infos[0] != null) nom = infos[0];
                    JSONObject m = importerUri(c, u, infos);
                    if (m != null) ok.put(m);
                } catch (TropGros e) {
                    erreurs.put(nom + " est trop gros (60 Mo maximum).");
                } catch (Throwable t) {
                    erreurs.put(nom + " n’a pas pu être ajouté.");
                }
            }
            res.put("fichiers", ok);
            res.put("erreurs", erreurs);
        } catch (Exception ignored) { }
        return res;
    }

    /** [nom affiché, taille] tels que l'appli d'origine les donne. */
    static String[] infos(Context c, Uri u) {
        String nom = null;
        String taille = null;
        Cursor q = null;
        try {
            q = c.getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null);
            if (q != null && q.moveToFirst()) {
                int i = q.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) nom = q.getString(i);
                int j = q.getColumnIndex(OpenableColumns.SIZE);
                if (j >= 0 && !q.isNull(j)) taille = String.valueOf(q.getLong(j));
            }
        } catch (Throwable ignored) {
        } finally {
            if (q != null) q.close();
        }
        if ((nom == null || nom.trim().length() == 0) && u.getLastPathSegment() != null) nom = u.getLastPathSegment();
        return new String[]{nom, taille};
    }

    static JSONObject importerUri(Context c, Uri u, String[] infos) throws Exception {
        ContentResolver cr = c.getContentResolver();
        String nom = infos[0] == null || infos[0].trim().length() == 0 ? "Fichier" : infos[0].trim();
        if (infos[1] != null) {
            try {
                if (Long.parseLong(infos[1]) > MAX) throw new TropGros();
            } catch (NumberFormatException ignored) { }
        }
        String mime = null;
        try { mime = cr.getType(u); } catch (Throwable ignored) { }
        if (mime == null || mime.equals("application/octet-stream") || mime.equals("*/*")) mime = mimeDe(nom);
        File src = new File(dossierTmp(c), nouvelId() + ".src");
        InputStream in = cr.openInputStream(u);
        if (in == null) throw new IOException("illisible");
        copierVersFichier(in, src, MAX);
        try {
            return traiter(c, src, mime, nom);
        } finally {
            if (src.exists()) src.delete();
        }
    }

    /** Range un fichier local (photo prise, fichier reçu) et renvoie sa fiche. */
    static JSONObject traiter(Context c, File src, String mime, String nom) throws Exception {
        String id = nouvelId();
        JSONObject m = new JSONObject();
        m.put("id", id);
        m.put("nom", nom);
        if (mime == null) mime = "application/octet-stream";
        if (mime.startsWith("image/")) {
            if (traiterImage(c, src, id, m)) return m;
        }
        if (mime.equals("application/pdf") || nom.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
            traiterPdf(c, src, id, m);
            return m;
        }
        String ext = extension(nom);
        if (ext.length() == 0 || ext.length() > 8 || !ext.matches("[a-z0-9]+")) {
            String e2 = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            ext = e2 != null ? e2 : "bin";
        }
        File dst = new File(dossierFichiers(c), id + "." + ext);
        deplacer(src, dst);
        m.put("fichier", dst.getName());
        m.put("mime", mime);
        m.put("taille", dst.length());
        m.put("apercu", false);
        return m;
    }

    static boolean traiterImage(Context c, File src, String id, JSONObject m) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(src.getAbsolutePath(), o);
        if (o.outWidth <= 0 || o.outHeight <= 0) return false;
        int w = o.outWidth;
        int h = o.outHeight;
        String type = o.outMimeType != null ? o.outMimeType : "image/jpeg";
        int rot = rotationExif(src);
        long len = src.length();
        boolean garder = rot == 0 && Math.max(w, h) <= COTE_MAX && (
                (type.equals("image/jpeg") && len <= 3500000L)
                        || ((type.equals("image/png") || type.equals("image/webp") || type.equals("image/gif")) && len <= 6000000L));
        File dst;
        if (garder) {
            String ext = type.equals("image/jpeg") ? "jpg" : type.substring(6);
            dst = new File(dossierFichiers(c), id + "." + ext);
            deplacer(src, dst);
        } else {
            Bitmap b = decoderReduit(src.getAbsolutePath(), w, h, COTE_MAX);
            if (b == null) return false;
            b = tourner(b, rot);
            dst = new File(dossierFichiers(c), id + ".jpg");
            ecrireJpeg(b, dst, 88);
            w = b.getWidth();
            h = b.getHeight();
            b.recycle();
            type = "image/jpeg";
        }
        Bitmap t = decoderReduit(dst.getAbsolutePath(), w, h, COTE_MINI);
        if (t != null) {
            ecrireJpeg(t, new File(dossierMiniatures(c), id + ".jpg"), 82);
            t.recycle();
            m.put("apercu", true);
        } else {
            m.put("apercu", false);
        }
        m.put("fichier", dst.getName());
        m.put("mime", type);
        m.put("taille", dst.length());
        m.put("w", w);
        m.put("h", h);
        return true;
    }

    static void traiterPdf(Context c, File src, String id, JSONObject m) throws Exception {
        File dst = new File(dossierFichiers(c), id + ".pdf");
        deplacer(src, dst);
        m.put("fichier", dst.getName());
        m.put("mime", "application/pdf");
        m.put("taille", dst.length());
        m.put("apercu", false);
        m.put("pages", 0);
        synchronized (VERROU_PDF) {
            ParcelFileDescriptor pfd = null;
            PdfRenderer r = null;
            try {
                pfd = ParcelFileDescriptor.open(dst, ParcelFileDescriptor.MODE_READ_ONLY);
                r = new PdfRenderer(pfd);
                int n = r.getPageCount();
                m.put("pages", n);
                if (n > 0) {
                    PdfRenderer.Page p = r.openPage(0);
                    int pw = Math.max(1, p.getWidth());
                    int ph = Math.max(1, p.getHeight());
                    m.put("w", pw);
                    m.put("h", ph);
                    int th = Math.max(1, Math.min(COTE_MINI * 3, Math.round((float) COTE_MINI * ph / pw)));
                    Bitmap b = Bitmap.createBitmap(COTE_MINI, th, Bitmap.Config.ARGB_8888);
                    b.eraseColor(Color.WHITE);
                    p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    p.close();
                    ecrireJpeg(b, new File(dossierMiniatures(c), id + ".jpg"), 82);
                    b.recycle();
                    m.put("apercu", true);
                }
            } catch (SecurityException e) {
                m.put("protege", true);
            } catch (Throwable ignored) {
            } finally {
                try { if (r != null) r.close(); } catch (Throwable ignored) { }
                try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
            }
        }
    }

    /** Une page de PDF rendue en image (mise en cache), pour la visionneuse. */
    static File pagePdf(Context c, String nom, int page, int largeur) throws Exception {
        if (!nomValide(nom) || !nom.toLowerCase(Locale.ROOT).endsWith(".pdf") || page < 0) return null;
        int w = Math.max(200, Math.min(1600, largeur));
        w = ((w + 199) / 200) * 200;
        if (w > 1600) w = 1600;
        File cache = new File(dossierPages(c), base(nom) + "_" + page + "_" + w + ".jpg");
        if (cache.exists() && cache.length() > 0) return cache;
        File src = new File(dossierFichiers(c), nom);
        if (!src.exists()) return null;
        synchronized (VERROU_PDF) {
            if (cache.exists() && cache.length() > 0) return cache;
            ParcelFileDescriptor pfd = null;
            PdfRenderer r = null;
            try {
                pfd = ParcelFileDescriptor.open(src, ParcelFileDescriptor.MODE_READ_ONLY);
                r = new PdfRenderer(pfd);
                if (page >= r.getPageCount()) return null;
                PdfRenderer.Page p = r.openPage(page);
                int pw = Math.max(1, p.getWidth());
                int ph = Math.max(1, p.getHeight());
                int h = Math.max(1, Math.min(w * 4, Math.round((float) w * ph / pw)));
                Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                b.eraseColor(Color.WHITE);
                p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                p.close();
                ecrireJpeg(b, cache, 85);
                b.recycle();
            } finally {
                try { if (r != null) r.close(); } catch (Throwable ignored) { }
                try { if (pfd != null) pfd.close(); } catch (Throwable ignored) { }
            }
        }
        return cache.exists() ? cache : null;
    }

    static void supprimer(Context c, JSONArray noms) {
        File pages = dossierPages(c);
        for (int i = 0; i < noms.length(); i++) {
            String n = noms.optString(i, "");
            if (!nomValide(n)) continue;
            new File(dossierFichiers(c), n).delete();
            String b = base(n);
            new File(dossierMiniatures(c), b + ".jpg").delete();
            File[] l = pages.listFiles();
            if (l != null) {
                for (File f : l) {
                    if (f.getName().startsWith(b + "_")) f.delete();
                }
            }
        }
    }

    static long[] espace(Context c) {
        long total = 0;
        long n = 0;
        File[] l = dossierFichiers(c).listFiles();
        if (l != null) {
            for (File f : l) {
                total += f.length();
                n++;
            }
        }
        return new long[]{total, n};
    }

    // ---------- outils ----------

    static int rotationExif(File f) {
        try {
            ExifInterface e = new ExifInterface(f.getAbsolutePath());
            int o = e.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (o == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (o == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (Throwable ignored) { }
        return 0;
    }

    static Bitmap decoderReduit(String chemin, int w, int h, int cote) {
        try {
            int s = 1;
            while (Math.max(w, h) / (s * 2) >= cote) s *= 2;
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inSampleSize = s;
            Bitmap b = BitmapFactory.decodeFile(chemin, o);
            if (b == null) return null;
            int bw = b.getWidth();
            int bh = b.getHeight();
            float k = (float) cote / Math.max(bw, bh);
            if (k < 1f) {
                Bitmap r = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(bw * k)), Math.max(1, Math.round(bh * k)), true);
                if (r != b) b.recycle();
                b = r;
            }
            return b;
        } catch (OutOfMemoryError e) {
            return null;
        }
    }

    static Bitmap tourner(Bitmap b, int deg) {
        if (deg == 0) return b;
        Matrix m = new Matrix();
        m.postRotate(deg);
        Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
        if (r != b) b.recycle();
        return r;
    }

    static void ecrireJpeg(Bitmap b, File f, int q) throws IOException {
        Bitmap src = b;
        if (b.hasAlpha()) {
            Bitmap o = Bitmap.createBitmap(b.getWidth(), b.getHeight(), Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(o);
            cv.drawColor(Color.WHITE);
            cv.drawBitmap(b, 0, 0, null);
            src = o;
        }
        OutputStream out = new BufferedOutputStream(new FileOutputStream(f));
        try {
            src.compress(Bitmap.CompressFormat.JPEG, q, out);
        } finally {
            out.close();
            if (src != b) src.recycle();
        }
    }

    static long copier(InputStream in, OutputStream out, long max) throws IOException {
        byte[] buf = new byte[65536];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (max > 0 && total > max) throw new TropGros();
            out.write(buf, 0, n);
        }
        return total;
    }

    static void copierVersFichier(InputStream in, File dst, long max) throws IOException {
        OutputStream out = new BufferedOutputStream(new FileOutputStream(dst));
        boolean ok = false;
        try {
            copier(in, out, max);
            ok = true;
        } finally {
            try { out.close(); } catch (Exception ignored) { }
            try { in.close(); } catch (Exception ignored) { }
            if (!ok) dst.delete();
        }
    }

    static void deplacer(File src, File dst) throws IOException {
        if (src.renameTo(dst)) return;
        copierVersFichier(new FileInputStream(src), dst, 0);
        src.delete();
    }

    static void viderDossier(File d) {
        File[] l = d.listFiles();
        if (l == null) return;
        for (File f : l) {
            if (f.isDirectory()) viderDossier(f);
            f.delete();
        }
    }
}
