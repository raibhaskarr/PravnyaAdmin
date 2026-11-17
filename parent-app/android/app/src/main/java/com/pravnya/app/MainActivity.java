package com.pravnya.app;

import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final String PREFS = "pravnya";
    private static final String ASKED_MEDIA = "askedMediaPermissions";
    private static final int MEDIA_REQUEST = 4101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        askForMediaPermissionsOnce();
    }

    /**
     * Android can't grant the microphone or camera at install time (since Android 6), so ask
     * once, the first time the app opens: voice notes and photos then just work. If the parent
     * says no, the app asks again when they tap record, and if they've blocked it the app
     * explains where in Settings to allow it.
     */
    private void askForMediaPermissionsOnce() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(ASKED_MEDIA, false)) return;
        prefs.edit().putBoolean(ASKED_MEDIA, true).apply();

        List<String> missing = new ArrayList<>();
        for (String permission : new String[] { Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA }) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missing.add(permission);
            }
        }
        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), MEDIA_REQUEST);
        }
    }
}
