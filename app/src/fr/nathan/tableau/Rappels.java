package fr.nathan.tableau;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;

/**
 * Rappels : la page calcule les prochains rappels (avec leurs répétitions), Android les déclenche
 * à l'heure, même appli fermée, et les reprogramme après un redémarrage.
 * Façons de sonner : discret (sans son), vibreur, sonnerie, alarme (volume du réveil).
 * Une durée > 0 fait sonner ou vibrer en boucle jusqu'à « Arrêter » ou la fin de la durée.
 */
final class Rappels {
    private Rappels() { }

    static final String ACTION_ARRETER = "fr.nathan.tableau.ARRETER";
    static final String ACTION_REPORTER = "fr.nathan.tableau.REPORTER";
    static final String ACTION_FIN = "fr.nathan.tableau.FIN";
    static final int BASE = 1000;
    static final int MAX = 64;
    static final int TEST = 999;
    static final long[] VIB_COURTE = {0, 300, 200, 300};
    static final long[] VIB_LONGUE = {0, 600, 300, 600};
    static final long[] VIB_ALARME = {0, 900, 400, 900, 400};

    static File fichier(Context c) { return new File(c.getFilesDir(), "rappels.json"); }

    static File planifies(Context c) { return new File(c.getFilesDir(), "rappels_planifies.json"); }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("rappels", Context.MODE_PRIVATE); }

    static String canal(String mode) {
        if ("discret".equals(mode)) return "rappel_discret";
        if ("vibreur".equals(mode)) return "rappel_vibreur";
        if ("alarme".equals(mode)) return "rappel_alarme";
        return "rappel_sonnerie";
    }

    static int idNotif(String cle) {
        return 10000 + ((cle == null ? 0 : cle.hashCode()) & 0x7fffffff) % 80000;
    }

    static AlarmManager am(Context c) { return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE); }

    // ---------- programmation ----------

    static void planifier(Context c, String json) {
        JSONArray a;
        try {
            a = new JSONArray(json == null || json.length() == 0 ? "[]" : json);
        } catch (Exception e) {
            return;
        }
        Stockage.ecrireAtomique(fichier(c), a.toString(), null);
        appliquer(c, a);
    }

    static void replanifier(Context c) {
        try {
            String s = Stockage.lire(fichier(c));
            if (s == null) return;
            appliquer(c, new JSONArray(s));
        } catch (Throwable ignored) { }
    }

    static Intent intentRappel(Context c, String titre, String texte, String aller, String cle, String mode, int duree) {
        Intent it = new Intent(c, RappelReceiver.class);
        it.putExtra("titre", titre);
        it.putExtra("texte", texte);
        it.putExtra("aller", aller);
        it.putExtra("cle", cle);
        it.putExtra("mode", mode);
        it.putExtra("duree", duree);
        return it;
    }

    static void appliquer(Context c, JSONArray a) {
        AlarmManager am = am(c);
        if (am == null) return;
        int avant = prefs(c).getInt("n", MAX);
        for (int i = 0; i < Math.max(avant, MAX); i++) {
            PendingIntent pi = PendingIntent.getBroadcast(c, BASE + i, new Intent(c, RappelReceiver.class),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) {
                am.cancel(pi);
                pi.cancel();
            }
        }
        Set<String> vus = acquittes(c);
        long maintenant = System.currentTimeMillis();
        int n = 0;
        JSONArray plan = new JSONArray();
        for (int i = 0; i < a.length() && n < MAX; i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null) continue;
            long quand = o.optLong("at", 0);
            if (quand < maintenant - 60000) continue;
            String cle = o.optString("cle", "");
            if (cle.length() > 0 && vus.contains(cle)) continue;
            Intent it = intentRappel(c, o.optString("titre", "Rappel"), o.optString("texte", ""), o.optString("aller", ""),
                    cle, o.optString("mode", "sonnerie"), o.optInt("duree", 0));
            PendingIntent pi = PendingIntent.getBroadcast(c, BASE + n, it,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            programmer(am, Math.max(quand, maintenant + 1000), pi);
            try {
                JSONObject p = new JSONObject();
                p.put("rc", BASE + n);
                p.put("cle", cle);
                p.put("at", quand);
                plan.put(p);
            } catch (Exception ignored) { }
            n++;
        }
        prefs(c).edit().putInt("n", n).apply();
        Stockage.ecrireAtomique(planifies(c), plan.toString(), null);
    }

    /** Rappels déjà vus (ouverts, arrêtés ou reportés) : leurs répétitions ne sonnent plus. Oubliés après 3 jours. */
    static Set<String> acquittes(Context c) {
        Set<String> res = new HashSet<String>();
        try {
            JSONObject o = new JSONObject(prefs(c).getString("acquittes", "{}"));
            JSONObject garde = new JSONObject();
            long limite = System.currentTimeMillis() - 3L * 86400000L;
            JSONArray noms = o.names();
            if (noms != null) {
                for (int i = 0; i < noms.length(); i++) {
                    String k = noms.getString(i);
                    long t = o.optLong(k, 0);
                    if (t > limite) {
                        res.add(k);
                        garde.put(k, t);
                    }
                }
            }
            prefs(c).edit().putString("acquittes", garde.toString()).apply();
        } catch (Throwable ignored) { }
        return res;
    }

    static void acquitter(Context c, String cle) {
        if (cle == null || cle.length() == 0) return;
        try {
            JSONObject o = new JSONObject(prefs(c).getString("acquittes", "{}"));
            o.put(cle, System.currentTimeMillis());
            prefs(c).edit().putString("acquittes", o.toString()).apply();
            annulerFin(c, idNotif(cle));
            AlarmManager am = am(c);
            String s = Stockage.lire(planifies(c));
            if (am == null || s == null) return;
            JSONArray a = new JSONArray(s);
            long maintenant = System.currentTimeMillis();
            for (int i = 0; i < a.length(); i++) {
                JSONObject p = a.optJSONObject(i);
                if (p == null || !cle.equals(p.optString("cle")) || p.optLong("at") <= maintenant) continue;
                PendingIntent pi = PendingIntent.getBroadcast(c, p.optInt("rc"), new Intent(c, RappelReceiver.class),
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                }
            }
        } catch (Throwable ignored) { }
    }

    static void tester(Context c, String json) {
        String mode = "sonnerie";
        int duree = 0;
        try {
            JSONObject o = new JSONObject(json == null || json.length() == 0 ? "{}" : json);
            mode = o.optString("mode", mode);
            duree = o.optInt("duree", 0);
        } catch (Throwable ignored) { }
        AlarmManager am = am(c);
        if (am == null) return;
        Intent it = intentRappel(c, "Rappel de test", "Voilà à quoi ressemblera ce rappel.", "", "test", mode, duree);
        PendingIntent pi = PendingIntent.getBroadcast(c, TEST, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        programmer(am, System.currentTimeMillis() + 5000, pi);
    }

    static boolean exactPermis(AlarmManager am) {
        if (Build.VERSION.SDK_INT < 31) return true;
        try {
            return Boolean.TRUE.equals(AlarmManager.class.getMethod("canScheduleExactAlarms").invoke(am));
        } catch (Throwable t) {
            return false;
        }
    }

    static void programmer(AlarmManager am, long quand, PendingIntent pi) {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                if (exactPermis(am)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quand, pi);
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quand, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, quand, pi);
            }
        } catch (SecurityException e) {
            try { am.set(AlarmManager.RTC_WAKEUP, quand, pi); } catch (Throwable ignored) { }
        } catch (Throwable ignored) { }
    }

    // ---------- fin de sonnerie, report ----------

    static void programmerFin(Context c, Bundle ex, int id, int duree) {
        AlarmManager am = am(c);
        if (am == null) return;
        Intent it = new Intent(c, RappelReceiver.class);
        it.setAction(ACTION_FIN);
        it.putExtras(ex);
        it.putExtra("nid", id);
        PendingIntent pi = PendingIntent.getBroadcast(c, 5000 + id % 1000, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        programmer(am, System.currentTimeMillis() + duree * 1000L, pi);
    }

    static void annulerFin(Context c, int id) {
        AlarmManager am = am(c);
        if (am == null) return;
        Intent it = new Intent(c, RappelReceiver.class);
        it.setAction(ACTION_FIN);
        PendingIntent pi = PendingIntent.getBroadcast(c, 5000 + id % 1000, it, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pi != null) {
            am.cancel(pi);
            pi.cancel();
        }
    }

    static void reporter(Context c, Bundle ex, int id) {
        AlarmManager am = am(c);
        if (am == null) return;
        Intent it = new Intent(c, RappelReceiver.class);
        it.putExtras(ex);
        PendingIntent pi = PendingIntent.getBroadcast(c, 8000 + id % 1000, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        programmer(am, System.currentTimeMillis() + 10 * 60000L, pi);
    }

    // ---------- notifications ----------

    static Uri sonAlarme() {
        Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        return u;
    }

    static void creerCanaux(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            Class<?> cc = Class.forName("android.app.NotificationChannel");
            Constructor<?> k = cc.getConstructor(String.class, CharSequence.class, int.class);
            Method son = cc.getMethod("setSound", Uri.class, AudioAttributes.class);
            Method vib = cc.getMethod("enableVibration", boolean.class);
            Method motif = cc.getMethod("setVibrationPattern", long[].class);
            Method desc = cc.getMethod("setDescription", String.class);
            Method creer = NotificationManager.class.getMethod("createNotificationChannel", cc);
            AudioAttributes notif = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            AudioAttributes reveil = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();

            Object d = k.newInstance("rappel_discret", "Rappels discrets", 3);
            son.invoke(d, null, null);
            vib.invoke(d, false);
            desc.invoke(d, "Sans son ni vibration");
            creer.invoke(nm, d);

            Object v = k.newInstance("rappel_vibreur", "Rappels en vibreur", 4);
            son.invoke(v, null, null);
            vib.invoke(v, true);
            motif.invoke(v, (Object) VIB_LONGUE);
            desc.invoke(v, "Vibration seulement");
            creer.invoke(nm, v);

            Object s = k.newInstance("rappel_sonnerie", "Rappels avec sonnerie", 4);
            son.invoke(s, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), notif);
            vib.invoke(s, true);
            motif.invoke(s, (Object) VIB_COURTE);
            desc.invoke(s, "Son de notification et vibration");
            creer.invoke(nm, s);

            Object a = k.newInstance("rappel_alarme", "Alarmes", 4);
            son.invoke(a, sonAlarme(), reveil);
            vib.invoke(a, true);
            motif.invoke(a, (Object) VIB_ALARME);
            desc.invoke(a, "Sonnerie du réveil, au volume des alarmes");
            creer.invoke(nm, a);

            try {
                NotificationManager.class.getMethod("deleteNotificationChannel", String.class).invoke(nm, "rappels");
            } catch (Throwable ignored) { }
        } catch (Throwable ignored) { }
    }

    static boolean notificationsActives(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT < 24) return true;
        try {
            return Boolean.TRUE.equals(NotificationManager.class.getMethod("areNotificationsEnabled").invoke(nm));
        } catch (Throwable t) {
            return true;
        }
    }

    static PendingIntent action(Context c, String act, Bundle ex, int id, int base) {
        Intent it = new Intent(c, RappelReceiver.class);
        it.setAction(act);
        it.putExtras(ex);
        it.putExtra("nid", id);
        return PendingIntent.getBroadcast(c, base + id % 1000, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Affiche le rappel. silencieux : reprise discrète une fois la durée de sonnerie écoulée. */
    @SuppressWarnings("deprecation")
    static void notifier(Context c, Bundle ex, boolean silencieux) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || ex == null) return;
        creerCanaux(nm);
        String titre = ex.getString("titre", "Rappel");
        String texte = ex.getString("texte", "");
        String aller = ex.getString("aller", "");
        String cle = ex.getString("cle", "");
        if (titre == null || titre.length() == 0) titre = "Rappel";
        if (texte == null) texte = "";
        String mode = silencieux ? "discret" : ex.getString("mode", "sonnerie");
        int duree = silencieux ? 0 : ex.getInt("duree", 0);
        int id = idNotif(cle != null && cle.length() > 0 ? cle : titre);

        Intent ouvrir = new Intent(c, MainActivity.class);
        if (aller != null && aller.length() > 0) ouvrir.putExtra("aller", aller);
        ouvrir.putExtra("cle", cle);
        ouvrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, ouvrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = new Notification.Builder(c);
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Notification.Builder.class.getMethod("setChannelId", String.class).invoke(b, canal(mode));
            } catch (Throwable ignored) { }
        } else {
            if ("discret".equals(mode)) {
                b.setPriority(Notification.PRIORITY_DEFAULT);
            } else if ("vibreur".equals(mode)) {
                b.setPriority(Notification.PRIORITY_HIGH);
                b.setVibrate(VIB_LONGUE);
            } else if ("alarme".equals(mode)) {
                b.setPriority(Notification.PRIORITY_MAX);
                Uri u = sonAlarme();
                if (u != null) b.setSound(u, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                b.setVibrate(VIB_ALARME);
            } else {
                b.setPriority(Notification.PRIORITY_HIGH);
                b.setDefaults(Notification.DEFAULT_SOUND);
                b.setVibrate(VIB_COURTE);
            }
        }
        b.setSmallIcon(R.drawable.ic_notif)
                .setContentTitle(titre)
                .setContentText(texte)
                .setStyle(new Notification.BigTextStyle().bigText(texte))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true)
                .setColor(0xFFAD5218)
                .setCategory("alarme".equals(mode) ? Notification.CATEGORY_ALARM : Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PRIVATE);
        if (silencieux) {
            b.setOnlyAlertOnce(true);
        } else {
            b.addAction(R.drawable.ic_notif, "Arrêter", action(c, ACTION_ARRETER, ex, id, 6000));
            b.addAction(R.drawable.ic_notif, "Dans 10 min", action(c, ACTION_REPORTER, ex, id, 7000));
        }
        Notification n = b.build();
        boolean enBoucle = duree > 0 && !"discret".equals(mode);
        if (enBoucle) n.flags |= Notification.FLAG_INSISTENT;
        try {
            nm.notify(id, n);
        } catch (Throwable ignored) { }
        if (enBoucle) programmerFin(c, ex, id, duree);
    }
}
