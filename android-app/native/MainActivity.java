// Butler's main screen (copied over the one `npx cap add android` makes, by .github/workflows/android.yml).
// The same as Capacitor's, plus three things: the home-screen widgets' plugin (ButlerWidgets, WidgetsPlugin.java);
// when sharing to Butler is what started the app, the share is handed to the plugins like one arriving while it runs
// (the share plugin only listens for those, so a share from a closed app would otherwise be lost; it keeps the share
// until Butler's page asks for it); and whether Butler is on screen, so the widgets' hidden refresh
// (HiddenRefresh.java) leaves it to the open app.
package app.butler.home;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static volatile boolean onScreen = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetsPlugin.class); // Butler's own plugin: before the bridge starts
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        if (savedInstanceState == null && intent != null && getBridge() != null) {
            String action = intent.getAction();
            if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                getBridge().onNewIntent(intent);
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        onScreen = true;
    }

    @Override
    public void onPause() {
        onScreen = false;
        super.onPause();
    }
}
