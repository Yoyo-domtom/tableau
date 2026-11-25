package fr.nathan.tableau;

import android.content.Context;
import android.net.Uri;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** Sauvegarde complète (tableau + fichiers) dans un .zip choisi par l'utilisateur, et restauration. */
final class Sauvegarde {
    private Sauvegarde() { }

    static final long MAX_TOTAL = 2000L * 1024 * 1024;

    static JSONObject exporter(Context c, Uri dest) {
        JSONObject r = new JSONObject();
        ZipOutputStream z = null;
        try {
            OutputStream os = c.getContentResolver().openOutputStream(dest, "w");
            if (os == null) throw new Exception("illisible");
            z = new ZipOutputStream(new BufferedOutputStream(os));
            String json = Stockage.charger(c);
            if (json.length() == 0) json = "{}";
            z.putNextEntry(new ZipEntry("tableau.json"));
            z.write(json.getBytes("UTF-8"));
            z.closeEntry();
            z.putNextEntry(new ZipEntry("LISEZMOI.txt"));
            z.write(("Sauvegarde de l'appli Tableau.\n"
                    + "Pour la remettre : Tableau > Paramètres > Restaurer une sauvegarde, puis choisir ce fichier.\n"
                    + "tableau.json contient tout le tableau ; fichiers/ contient les photos et les PDF.\n").getBytes("UTF-8"));
            z.closeEntry();
            int n = ajouterDossier(z, Fichiers.dossierFichiers(c), "fichiers/");
            ajouterDossier(z, Fichiers.dossierMiniatures(c), "miniatures/");
            z.finish();
            z.close();
            z = null;
            r.put("ok", true);
            r.put("fichiers", n);
        } catch (Throwable t) {
            try {
                r.put("ok", false);
                r.put("message", "La sauvegarde n’a pas pu être écrite. Choisis un autre emplacement et réessaie.");
            } catch (Exception ignored) { }
        } finally {
            if (z != null) {
                try { z.close(); } catch (Exception ignored) { }
            }
        }
        return r;
    }

    private static int ajouterDossier(ZipOutputStream z, File d, String prefixe) throws Exception {
        File[] l = d.listFiles();
        if (l == null) return 0;
        int n = 0;
        for (File f : l) {
            if (!f.isFile() || !Fichiers.nomValide(f.getName())) continue;
            z.putNextEntry(new ZipEntry(prefixe + f.getName()));
            InputStream in = new BufferedInputStream(new FileInputStream(f));
            try {
                Fichiers.copier(in, z, 0);
            } finally {
                in.close();
            }
            z.closeEntry();
            n++;
        }
        return n;
    }

    static JSONObject importer(Context c, Uri src) {
        JSONObject r = new JSONObject();
        File tmp = new File(c.getFilesDir(), "restauration");
        try {
            Fichiers.viderDossier(tmp);
            tmp.mkdirs();
            InputStream is = c.getContentResolver().openInputStream(src);
            if (is == null) throw new Exception("illisible");
            ZipInputStream z = new ZipInputStream(new BufferedInputStream(is));
            boolean json = false;
            int n = 0;
            long total = 0;
            try {
                ZipEntry e;
                while ((e = z.getNextEntry()) != null) {
                    if (e.isDirectory()) continue;
                    String nom = e.getName();
                    File out = null;
                    if (nom.equals("tableau.json")) {
                        out = new File(tmp, "tableau.json");
                        json = true;
                    } else if (nom.startsWith("fichiers/") && Fichiers.nomValide(nom.substring(9))) {
                        out = new File(tmp, nom);
                        n++;
                    } else if (nom.startsWith("miniatures/") && Fichiers.nomValide(nom.substring(11))) {
                        out = new File(tmp, nom);
                    }
                    if (out == null) continue;
                    out.getParentFile().mkdirs();
                    OutputStream o = new BufferedOutputStream(new FileOutputStream(out));
                    try {
                        total += Fichiers.copier(z, o, MAX_TOTAL - total);
                    } finally {
                        o.close();
                    }
                }
            } finally {
                z.close();
            }
            String s = Stockage.lire(new File(tmp, "tableau.json"));
            if (!json || !Stockage.jsonValide(s) || !new JSONObject(s).has("nodes")) {
                Fichiers.viderDossier(tmp);
                tmp.delete();
                r.put("ok", false);
                r.put("message", "Ce fichier n’est pas une sauvegarde du Tableau.");
                return r;
            }
            // L'état actuel est mis de côté avant d'être remplacé.
            File ancien = new File(c.getFilesDir(), "avant-restauration");
            Fichiers.viderDossier(ancien);
            ancien.mkdirs();
            String actuel = Stockage.charger(c);
            if (actuel.length() > 0) Stockage.ecrireAtomique(new File(ancien, "tableau.json"), actuel, null);
            remplacer(new File(c.getFilesDir(), "fichiers"), new File(ancien, "fichiers"), new File(tmp, "fichiers"));
            remplacer(new File(c.getFilesDir(), "miniatures"), new File(ancien, "miniatures"), new File(tmp, "miniatures"));
            Fichiers.viderDossier(Fichiers.dossierPages(c));
            if (!Stockage.enregistrer(c, s)) throw new Exception("écriture");
            Fichiers.viderDossier(tmp);
            tmp.delete();
            r.put("ok", true);
            r.put("fichiers", n);
        } catch (Throwable t) {
            try {
                r.put("ok", false);
                r.put("message", "La restauration a échoué. Ton tableau actuel n’a pas changé.");
            } catch (Exception ignored) { }
        }
        return r;
    }

    private static void remplacer(File actuel, File misDeCote, File nouveau) {
        if (actuel.exists() && !actuel.renameTo(misDeCote)) {
            Fichiers.viderDossier(actuel);
            actuel.delete();
        }
        if (nouveau.exists()) {
            if (!nouveau.renameTo(actuel)) actuel.mkdirs();
        } else {
            actuel.mkdirs();
        }
    }
}
