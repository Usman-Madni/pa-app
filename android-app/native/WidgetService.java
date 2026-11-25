// The rows inside a Butler widget, exactly as Butler's page sent them (see Widgets.java): headings and tasks, in order.
package app.butler.home;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import org.json.JSONArray;
import org.json.JSONObject;

public class WidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext(), intent.getStringExtra("kind"),
            intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID));
    }

    static class Rows implements RemoteViewsFactory {
        private final Context c;
        private final String kind;
        private final int widgetId;
        private JSONArray rows = new JSONArray();

        Rows(Context c, String kind, int widgetId) { this.c = c; this.kind = kind; this.widgetId = widgetId; }

        private void load() {
            JSONObject d = Widgets.data(c);
            JSONArray r = null;
            if (Widgets.MY_DAY.equals(kind)) r = d.optJSONArray("myDay");
            else {
                JSONObject lists = d.optJSONObject("lists");
                JSONObject b = lists == null ? null : lists.optJSONObject(Widgets.bucketOf(c, widgetId));
                r = b == null ? null : b.optJSONArray("rows");
            }
            rows = r == null ? new JSONArray() : r;
        }

        @Override public void onCreate() { load(); }
        @Override public void onDataSetChanged() { load(); }
        @Override public void onDestroy() {}
        @Override public int getCount() { return rows.length(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public long getItemId(int position) { return position; }
        @Override public boolean hasStableIds() { return false; }

        @Override
        public RemoteViews getViewAt(int position) {
            JSONObject r = rows.optJSONObject(position);
            if (r == null) r = new JSONObject();
            if (r.has("h")) {
                RemoteViews h = new RemoteViews(c.getPackageName(), R.layout.widget_heading);
                h.setTextViewText(R.id.heading_text, r.optString("h"));
                return h;
            }
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_row);
            v.setTextViewText(R.id.row_title, r.optString("t"));
            String sub = r.optString("s", "");
            v.setTextViewText(R.id.row_sub, sub);
            v.setViewVisibility(R.id.row_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextColor(R.id.row_sub, c.getColor(r.optBoolean("late") ? R.color.widget_late : R.color.widget_muted));
            String id = r.optString("id", "");
            Intent fill = new Intent();
            fill.setData(Uri.parse("app.butler.home://open?" + (id.isEmpty() ? "view=today" : "task=" + Uri.encode(id))));
            v.setOnClickFillInIntent(R.id.row_root, fill);
            return v;
        }
    }
}
