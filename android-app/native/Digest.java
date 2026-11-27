// Morning and evening (round 7): a summary of My Day on the phone at the times set in Butler's Settings, even when
// Butler is closed. Butler works everything out with its own code (Digest in PA App.html: the wording from todayPlan,
// the My Day page's own code, and the next times as instants) and sends it with the widgets' rows ("digest" in
// Widgets' data). This side only sets the alarms for those instants and shows the words: never sort, filter or date
// tasks here. Five minutes before each, the widgets' hidden refresh brings the words up to date.
package app.butler.home;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

public class Digest extends BroadcastReceiver {
    static final String CHANNEL = "butler_digest";
    static final String SHOW = "app.butler.home.DIGEST_SHOW";
    static final String FRESH = "app.butler.home.DIGEST_FRESH";
    static final long EARLY_MS = 5 * 60 * 1000L;

    static JSONObject sent(Context c) { return Widgets.data(c).optJSONObject("digest"); }

    static boolean on(Context c) {
        JSONObject d = sent(c);
        return d != null && d.optBoolean("on", false);
    }

    private static PendingIntent pending(Context c, String action, String which) {
        Intent i = new Intent(c, Digest.class).setAction(action).putExtra("which", which);
        return PendingIntent.getBroadcast(c, SHOW.equals(action) ? 7101 : 7102, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void set(AlarmManager am, long at, PendingIntent p) {
        try { am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p); }
        catch (SecurityException e) { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p); }
    }

    // The next one Butler sent (the first instant still to come), and a refresh just before it. Called whenever
    // Butler sends new data (Widgets.save), after each one shows, and after the phone restarts.
    static void plan(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        am.cancel(pending(c, SHOW, ""));
        am.cancel(pending(c, FRESH, ""));
        JSONObject d = sent(c);
        if (d == null || !d.optBoolean("on", false)) return;
        JSONArray times = d.optJSONArray("times");
        if (times == null) return;
        long now = System.currentTimeMillis();
        for (int i = 0; i < times.length(); i++) {
            JSONObject t = times.optJSONObject(i);
            if (t == null || t.optLong("at", 0) <= now) continue;
            long at = t.optLong("at", 0);
            String which = t.optString("which", "am");
            set(am, at, pending(c, SHOW, which));
            if (at - EARLY_MS > now) set(am, at - EARLY_MS, pending(c, FRESH, which));
            HiddenRefresh.every(c); // keeps the words up to date with no widget on the home screen too
            return;
        }
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        String a = intent.getAction();
        if (FRESH.equals(a)) { HiddenRefresh.now(c); return; }
        if (SHOW.equals(a)) { show(c, intent.getStringExtra("which")); plan(c); return; }
        plan(c); // the phone restarted, or the app was updated: alarms are gone, set them again
    }

    // Butler's words for today; if Butler hasn't been able to work today's out (offline since yesterday), the morning
    // only says to look, and the evening says nothing.
    static void show(Context c, String which) {
        boolean morning = !"pm".equals(which);
        JSONObject d = sent(c);
        JSONObject m = d != null && Widgets.today().equals(d.optString("day")) ? d.optJSONObject(morning ? "am" : "pm") : null;
        String title;
        String body;
        if (m != null) { title = m.optString("title", "My Day"); body = m.optString("body", ""); }
        else if (morning) { title = "Good morning"; body = "Open My Day to see what's on today."; }
        else return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Morning and evening", NotificationManager.IMPORTANCE_DEFAULT));
            b = new Notification.Builder(c, CHANNEL);
        } else b = new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_butler)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(Widgets.open(c, "view=today", morning ? 7201 : 7202));
        try { nm.notify(morning ? 7001 : 7002, b.build()); } catch (SecurityException e) { /* notifications turned off */ }
    }
}
