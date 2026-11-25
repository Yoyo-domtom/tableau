package fr.nathan.tableau;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.ArrayList;
import java.util.List;

/**
 * Donne accès à un fichier du Tableau à une autre appli (Claude, lecteur PDF, appareil photo),
 * seulement quand l'appli l'accorde au cas par cas.
 *   content://fr.nathan.tableau.fichiers/f/<nom stocké>/<nom affiché>  (lecture)
 *   content://fr.nathan.tableau.fichiers/tmp/<nom>                      (photo à prendre)
 *   content://fr.nathan.tableau.fichiers/maj/<nom>                      (mise à jour, pour l'installateur)
 */
public class FichierProvider extends ContentProvider {
    static final String AUTORITE = "fr.nathan.tableau.fichiers";

    static Uri uriFichier(String stocke, String affiche) {
        return new Uri.Builder().scheme("content").authority(AUTORITE)
                .appendPath("f").appendPath(stocke).appendPath(affiche).build();
    }

    static Uri uriMaj(String nom) {
        return new Uri.Builder().scheme("content").authority(AUTORITE)
                .appendPath("maj").appendPath(nom).build();
    }

    static Uri uriTmp(String nom) {
        return new Uri.Builder().scheme("content").authority(AUTORITE)
                .appendPath("tmp").appendPath(nom).build();
    }

    @Override
    public boolean onCreate() { return true; }

    private File resoudre(Uri u) {
        Context c = getContext();
        if (c == null) return null;
        List<String> s = u.getPathSegments();
        if (s == null || s.size() < 2) return null;
        String zone = s.get(0);
        String nom = s.get(1);
        if (!Fichiers.nomValide(nom)) return null;
        if ("f".equals(zone)) return new File(Fichiers.dossierFichiers(c), nom);
        if ("tmp".equals(zone)) return new File(Fichiers.dossierTmp(c), nom);
        if ("maj".equals(zone) && MiseAJour.NOM_APK.equals(nom)) return new File(MiseAJour.dossier(c), nom);
        return null;
    }

    private String nomAffiche(Uri u, File f) {
        List<String> s = u.getPathSegments();
        if (s != null && s.size() >= 3 && s.get(2).trim().length() > 0) return s.get(2);
        return f.getName();
    }

    @Override
    public String getType(Uri u) {
        File f = resoudre(u);
        if (f != null && f.getName().endsWith(".apk")) return "application/vnd.android.package-archive";
        return f == null ? null : Fichiers.mimeDe(f.getName());
    }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        File f = resoudre(u);
        if (f == null) throw new FileNotFoundException("introuvable");
        boolean ecriture = mode != null && mode.contains("w");
        if (ecriture && !"tmp".equals(u.getPathSegments().get(0))) throw new FileNotFoundException("lecture seule");
        if (!ecriture && !f.exists()) throw new FileNotFoundException("introuvable");
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode == null ? "r" : mode));
    }

    @Override
    public Cursor query(Uri u, String[] projection, String selection, String[] args, String tri) {
        File f = resoudre(u);
        if (f == null) return null;
        String[] proj = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        ArrayList<String> cols = new ArrayList<String>();
        ArrayList<Object> vals = new ArrayList<Object>();
        for (String p : proj) {
            if (OpenableColumns.DISPLAY_NAME.equals(p)) {
                cols.add(p);
                vals.add(nomAffiche(u, f));
            } else if (OpenableColumns.SIZE.equals(p)) {
                cols.add(p);
                vals.add(f.length());
            }
        }
        MatrixCursor c = new MatrixCursor(cols.toArray(new String[0]), 1);
        c.addRow(vals.toArray());
        return c;
    }

    @Override
    public Uri insert(Uri u, ContentValues v) { return null; }

    @Override
    public int delete(Uri u, String s, String[] a) { return 0; }

    @Override
    public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
