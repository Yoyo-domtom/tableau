package fr.nathan.tableau;

import android.app.Activity;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

/** Demande la fréquence d’affichage la plus haute de l’écran (120 Hz si possible) : animations plus fluides. API 23+. */
final class Ecran {
    private Ecran() { }

    static void frequenceMax(Activity a) {
        Window w = a.getWindow();
        Display d = a.getWindowManager().getDefaultDisplay();
        Display.Mode cur = d.getMode();
        Display.Mode best = cur;
        for (Display.Mode m : d.getSupportedModes()) {
            boolean memeTaille = m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight();
            if (memeTaille && m.getRefreshRate() > best.getRefreshRate() + 0.5f) best = m;
        }
        WindowManager.LayoutParams lp = w.getAttributes();
        lp.preferredDisplayModeId = best.getModeId();
        lp.preferredRefreshRate = best.getRefreshRate();
        w.setAttributes(lp);
    }
}
