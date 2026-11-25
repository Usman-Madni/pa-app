// Picking the bucket a One list widget shows: when it's put on the home screen, and again from holding it
// (Reconfigure). The buckets are the ones Butler last sent (Widgets.java).
package app.butler.home;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

public class ListConfigActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        final int widgetId = getIntent() == null ? AppWidgetManager.INVALID_APPWIDGET_ID
            : getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        setTitle("Which bucket?");

        JSONArray buckets = Widgets.data(this).optJSONArray("buckets");
        final List<String> ids = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (int i = 0; buckets != null && i < buckets.length(); i++) {
            JSONObject b = buckets.optJSONObject(i);
            if (b == null) continue;
            ids.add(b.optString("id"));
            names.add(b.optString("name"));
        }
        if (ids.isEmpty()) {
            TextView t = new TextView(this);
            t.setPadding(48, 48, 48, 48);
            t.setText("Open Butler once (with a bucket or two on the Tasks board), then add this widget again.");
            setContentView(t);
            return;
        }
        ListView list = new ListView(this);
        list.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, names));
        list.setOnItemClickListener((parent, view, position, rowId) -> {
            Widgets.setBucket(this, widgetId, ids.get(position));
            AppWidgetManager m = AppWidgetManager.getInstance(this);
            Widgets.draw(this, m, widgetId, Widgets.LIST);
            m.notifyAppWidgetViewDataChanged(new int[] { widgetId }, R.id.widget_list);
            Intent done = new Intent();
            done.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            setResult(RESULT_OK, done);
            finish();
        });
        setContentView(list);
    }
}
