package fr.nathan.tableau;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Garde une trace du dernier plantage pour pouvoir l'envoyer à Claude. */
final class Journal implements Thread.UncaughtExceptionHandler {
    private final Context ctx;
    private final Thread.UncaughtExceptionHandler precedent;

    private Journal(Context ctx, Thread.UncaughtExceptionHandler precedent) {
        this.ctx = ctx;
        this.precedent = precedent;
    }

    static void installer(Context app) {
        Thread.UncaughtExceptionHandler h = Thread.getDefaultUncaughtExceptionHandler();
        if (h instanceof Journal) return;
        Thread.setDefaultUncaughtExceptionHandler(new Journal(app, h));
    }

    static File fichier(Context c) { return new File(c.getFilesDir(), "plantage.txt"); }

    @Override
    public void uncaughtException(Thread t, Throwable e) {
        try {
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            pw.println("Tableau " + version(ctx) + " · Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") · " + Build.MANUFACTURER + " " + Build.MODEL);
            pw.println(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.FRANCE).format(new Date()) + " · fil " + t.getName());
            e.printStackTrace(pw);
            pw.flush();
            String s = sw.toString();
            if (s.length() > 12000) s = s.substring(0, 12000);
            FileOutputStream out = new FileOutputStream(fichier(ctx));
            out.write(s.getBytes("UTF-8"));
            out.close();
        } catch (Throwable ignored) { }
        if (precedent != null) precedent.uncaughtException(t, e);
        else System.exit(2);
    }

    static String version(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }
}
