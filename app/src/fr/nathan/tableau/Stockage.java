package fr.nathan.tableau;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

/** Le tableau lui-même : un fichier JSON dans le stockage privé de l'appli, écrit de façon atomique. */
final class Stockage {
    private Stockage() { }

    static final Object VERROU = new Object();

    static File principal(Context c) { return new File(c.getFilesDir(), "tableau.json"); }

    static File secours(Context c) { return new File(c.getFilesDir(), "tableau.bak.json"); }

    static String lire(File f) {
        if (f == null || !f.exists()) return null;
        FileInputStream in = null;
        try {
            in = new FileInputStream(f);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), "UTF-8");
        } catch (Exception e) {
            return null;
        } finally {
            if (in != null) {
                try { in.close(); } catch (Exception ignored) { }
            }
        }
    }

    static boolean jsonValide(String s) {
        if (s == null || s.length() == 0) return false;
        try {
            new JSONObject(s);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static String charger(Context c) {
        synchronized (VERROU) {
            String s = lire(principal(c));
            if (jsonValide(s)) return s;
            s = lire(secours(c));
            if (jsonValide(s)) return s;
            return "";
        }
    }

    static boolean enregistrer(Context c, String json) {
        if (!jsonValide(json)) return false;
        synchronized (VERROU) {
            return ecrireAtomique(principal(c), json, secours(c));
        }
    }

    /** Écrit dans un fichier temporaire, garde l'ancienne version en secours, puis remplace. */
    static boolean ecrireAtomique(File dst, String contenu, File bak) {
        File tmp = new File(dst.getParentFile(), dst.getName() + ".tmp");
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(tmp);
            out.write(contenu.getBytes("UTF-8"));
            out.getFD().sync();
            out.close();
            out = null;
            if (dst.exists()) {
                if (bak != null) {
                    bak.delete();
                    if (!dst.renameTo(bak)) dst.delete();
                } else {
                    dst.delete();
                }
            }
            return tmp.renameTo(dst);
        } catch (Exception e) {
            return false;
        } finally {
            if (out != null) {
                try { out.close(); } catch (Exception ignored) { }
            }
        }
    }
}
