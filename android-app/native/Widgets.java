// Butler's home-screen widgets (round 5; refresh, round 6): My Day and One list. They only DRAW the rows Butler's page sends
// (Native.widgets in PA App.html: My Day's rows come from todayPlan, the My Day page's own code), so the widget and
// the app never drift apart. Never sort, filter or date tasks here.
// Stored in SharedPreferences "butler_widgets": data = {day, myDay: [rows], lists: {bucket id: {name, rows}},
// buckets: [{id, name}]}, and list_<widget id> = the bucket a One list widget shows.
// A row is {h: heading} or {t: title, s: line under it, id: task id ('' for an event), late}.
package app.butler.home;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

public final class Widgets {
    static final String PREFS = "butler_widgets";
    static final String MY_DAY = "myday";
    static final String LIST = "list";

    private Widgets() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static void save(Context c, String data) { prefs(c).edit().putString("data", data).remove("busy").apply(); }

    // The refresh button pressed: "Bringing this up to date…" until the hidden refresh is done (HiddenRefresh), for
    // two minutes at most (offline, it waits for a connection).
    static final String REFRESH = "app.butler.home.REFRESH";
    static void busy(Context c) { prefs(c).edit().putLong("busy", System.currentTimeMillis()).apply(); }
    static void idle(Context c) { prefs(c).edit().remove("busy").apply(); }
    static boolean isBusy(Context c) { return System.currentTimeMillis() - prefs(c).getLong("busy", 0) < 120000; }

    // A widget's refresh button (MyDayWidget / ListWidget onReceive).
    static void refreshNow(Context c) {
        busy(c);
        refreshAll(c);
        HiddenRefresh.now(c);
    }

    // The last widget of one kind removed: with none of either kind left, the 15-minute refresh stops.
    static void lastGone(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m.getAppWidgetIds(new ComponentName(c, MyDayWidget.class)).length == 0
            && m.getAppWidgetIds(new ComponentName(c, ListWidget.class)).length == 0) HiddenRefresh.stop(c);
    }

    static JSONObject data(Context c) {
        try { return new JSONObject(prefs(c).getString("data", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    static String bucketOf(Context c, int widgetId) { return prefs(c).getString("list_" + widgetId, ""); }

    static void setBucket(Context c, int widgetId, String bucket) { prefs(c).edit().putString("list_" + widgetId, bucket).apply(); }

    static void forget(Context c, int widgetId) { prefs(c).edit().remove("list_" + widgetId).apply(); }

    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    // Every widget of both kinds, drawn again with the latest rows.
    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] days = m.getAppWidgetIds(new ComponentName(c, MyDayWidget.class));
        int[] lists = m.getAppWidgetIds(new ComponentName(c, ListWidget.class));
        for (int id : days) draw(c, m, id, MY_DAY);
        for (int id : lists) draw(c, m, id, LIST);
        if (days.length > 0) m.notifyAppWidgetViewDataChanged(days, R.id.widget_list);
        if (lists.length > 0) m.notifyAppWidgetViewDataChanged(lists, R.id.widget_list);
    }

    static void draw(Context c, AppWidgetManager m, int id, String kind) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        JSONObject d = data(c);
        boolean myDay = MY_DAY.equals(kind);
        String bucket = myDay ? "" : bucketOf(c, id);
        String title = "My Day";
        if (!myDay) {
            JSONObject lists = d.optJSONObject("lists");
            JSONObject b = lists == null || bucket.isEmpty() ? null : lists.optJSONObject(bucket);
            title = b == null ? "One list" : b.optString("name", "One list");
        }
        v.setTextViewText(R.id.widget_title, title);
        String note = isBusy(c) ? "Bringing this up to date…"
            : !d.has("day") ? "Open Butler once to fill this in"
            : !today().equals(d.optString("day")) ? "Not up to date: press ↻ (be signed in and online)" : "";
        v.setTextViewText(R.id.widget_note, note);
        v.setViewVisibility(R.id.widget_note, note.isEmpty() ? View.GONE : View.VISIBLE);

        Intent svc = new Intent(c, WidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.putExtra("kind", kind);
        svc.setData(Uri.parse("butler-widget://" + kind + "/" + id)); // one list per widget
        v.setRemoteAdapter(R.id.widget_list, svc);
        v.setEmptyView(R.id.widget_list, R.id.widget_empty);
        v.setTextViewText(R.id.widget_empty, myDay ? "Nothing due. Enjoy the space."
            : bucket.isEmpty() ? "Hold this widget to pick a bucket" : "Nothing open in this list");

        v.setOnClickPendingIntent(R.id.widget_head, open(c, myDay ? "view=today" : "view=tasks", id * 2));
        Intent r = new Intent(c, myDay ? MyDayWidget.class : ListWidget.class).setAction(REFRESH);
        v.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(c, id * 2, r, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent tpl = new Intent(Intent.ACTION_VIEW);
        tpl.setPackage(c.getPackageName());
        v.setPendingIntentTemplate(R.id.widget_list,
            PendingIntent.getActivity(c, id * 2 + 1, tpl, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));
        m.updateAppWidget(id, v);
    }

    // Opens Butler at app.butler.home://open?… (Native.openLink in PA App.html).
    static PendingIntent open(Context c, String query, int code) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("app.butler.home://open?" + query));
        i.setPackage(c.getPackageName());
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
