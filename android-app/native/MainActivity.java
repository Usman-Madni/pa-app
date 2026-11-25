// Butler's main screen (copied over the one `npx cap add android` makes, by .github/workflows/android.yml).
// The same as Capacitor's, plus two things: the home-screen widgets' plugin (ButlerWidgets, WidgetsPlugin.java), and
// when sharing to Butler is what started the app, the share is handed to the plugins like one arriving while it runs.
// The share plugin only listens for those, so a share from a closed app would otherwise be lost. It keeps the share
// until Butler's page asks for it.
package app.butler.home;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
}
