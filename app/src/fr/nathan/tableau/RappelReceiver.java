package fr.nathan.tableau;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** Déclenché par Android : à l'heure d'un rappel, à la fin d'une sonnerie, ou par les boutons de la notification. */
public class RappelReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        try {
            String action = i.getAction();
            Bundle ex = i.getExtras() == null ? new Bundle() : i.getExtras();
            String cle = ex.getString("cle", "");
            int id = ex.getInt("nid", Rappels.idNotif(cle != null && cle.length() > 0 ? cle : ex.getString("titre", "Rappel")));
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (Rappels.ACTION_FIN.equals(action)) {
                // La durée de sonnerie est écoulée : on coupe le son, la notification reste visible.
                if (nm != null) nm.cancel(id);
                Rappels.notifier(c, ex, true);
            } else if (Rappels.ACTION_ARRETER.equals(action)) {
                if (nm != null) nm.cancel(id);
                Rappels.annulerFin(c, id);
                Rappels.acquitter(c, cle);
            } else if (Rappels.ACTION_REPORTER.equals(action)) {
                if (nm != null) nm.cancel(id);
                Rappels.annulerFin(c, id);
                Rappels.acquitter(c, cle);
                Rappels.reporter(c, ex, id);
            } else {
                Rappels.notifier(c, ex, false);
            }
        } catch (Throwable ignored) { }
    }
}
