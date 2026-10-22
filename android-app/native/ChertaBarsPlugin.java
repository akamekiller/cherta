package io.github.akamekiller.cherta;

import android.graphics.Color;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Цвет системных полос (строка состояния, кнопки навигации) и фона окна под тему приложения. */
@CapacitorPlugin(name = "ChertaBars")
public class ChertaBarsPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#111615"));
        } catch (Exception e) {
            call.reject("bad color");
            return;
        }
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                w.getDecorView().setBackgroundColor(color);
                w.setStatusBarColor(color);
                w.setNavigationBarColor(color);
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                c.setAppearanceLightStatusBars(!dark);
                c.setAppearanceLightNavigationBars(!dark);
            } catch (Exception ignored) {
            }
        });
        call.resolve();
    }
}
