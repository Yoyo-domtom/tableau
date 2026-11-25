package fr.nathan.tableau;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Après un redémarrage du téléphone ou une mise à jour de l'appli : reprogramme les rappels. */
public class DemarrageReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        try {
            Rappels.replanifier(c);
        } catch (Throwable ignored) { }
    }
}
