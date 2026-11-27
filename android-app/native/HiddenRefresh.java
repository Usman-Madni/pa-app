// The widgets' hidden refresh (round 6): on the widgets' refresh button, and about every 15 minutes, Android opens
// Butler's own page with no screen (PA App.html?readonly&widgets) in a WebView that shares the app's storage, so it's
// signed in as the app is. Butler reads the latest from OneDrive and works the rows out with its own code (Hidden and
// Native.widgetData in PA App.html: My Day's rows from todayPlan, so the widget never drifts from the app), then hands
// them over through the "ButlerHidden" link below. This side only stores and draws them: never sort, filter or date
// tasks here. Skipped while Butler is open on screen (it keeps the widgets up to date itself).
package app.butler.home;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class HiddenRefresh extends JobService {
    static final String PAGE = "https://usman-madni.github.io/pa-app/PA%20App.html?readonly&widgets";
    static final String AGENT = " ButlerAndroid/7 ButlerHidden";
    // Far above the numbers WorkManager (the background check) gives its own jobs, which count up from 0.
    static final int NOW = 1112866817;
    static final int EVERY = 1112866818;
    static final long LIMIT_MS = 60000;
    static final long EVERY_MS = 15 * 60 * 1000L;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private JobParameters job;

    // The refresh button: as soon as the phone is online.
    static void now(Context c) {
        JobScheduler s = c.getSystemService(JobScheduler.class);
        if (s == null) return;
        s.schedule(new JobInfo.Builder(NOW, new ComponentName(c, HiddenRefresh.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .build());
    }

    // About every 15 minutes while there's a widget (set again whenever one is drawn, which Android also does after
    // the phone restarts).
    static void every(Context c) {
        JobScheduler s = c.getSystemService(JobScheduler.class);
        if (s == null) return;
        for (JobInfo j : s.getAllPendingJobs()) if (j.getId() == EVERY) return; // already set
        s.schedule(new JobInfo.Builder(EVERY, new ComponentName(c, HiddenRefresh.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(EVERY_MS)
            .build());
    }

    static void stop(Context c) {
        JobScheduler s = c.getSystemService(JobScheduler.class);
        if (s != null) s.cancel(EVERY);
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        if (MainActivity.onScreen) { Widgets.idle(this); Widgets.refreshAll(this); return false; }
        job = params;
        main.post(this::open);
        main.postDelayed(() -> finish(), LIMIT_MS); // never longer than this
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        main.post(this::close);
        return false;
    }

    private void open() {
        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setUserAgentString(ws.getUserAgentString() + AGENT);
        web.setWebViewClient(new WebViewClient());
        web.addJavascriptInterface(new Link(), "ButlerHidden");
        web.loadUrl(PAGE);
    }

    private void close() {
        if (web == null) return;
        web.removeJavascriptInterface("ButlerHidden");
        web.stopLoading();
        web.destroy();
        web = null;
    }

    private void finish() {
        if (job == null) return;
        main.removeCallbacksAndMessages(null); // this run's time limit, so it can't end the next run
        close();
        Widgets.idle(this);
        Widgets.refreshAll(this);
        JobParameters j = job;
        job = null;
        jobFinished(j, false);
    }

    // What Butler's page calls (window.ButlerHidden in PA App.html).
    private class Link {
        @JavascriptInterface
        public void update(String data) {
            if (data == null || data.isEmpty()) return;
            Widgets.save(HiddenRefresh.this, data);
            main.post(() -> Widgets.refreshAll(HiddenRefresh.this));
        }

        @JavascriptInterface
        public void done() { main.post(() -> finish()); }

        // A form POST through Android's networking (Microsoft refuses an app sign-in's tokens to a web page's request);
        // the answer goes back to Hidden.posted(id, status, body).
        @JavascriptInterface
        public void post(String id, String url, String form) {
            new Thread(() -> {
                int status = 0;
                String body = "";
                try {
                    HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
                    h.setRequestMethod("POST");
                    h.setDoOutput(true);
                    h.setConnectTimeout(20000);
                    h.setReadTimeout(20000);
                    h.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                    try (OutputStream o = h.getOutputStream()) { o.write(form.getBytes("UTF-8")); }
                    status = h.getResponseCode();
                    InputStream in = status >= 400 ? h.getErrorStream() : h.getInputStream();
                    if (in != null) {
                        ByteArrayOutputStream b = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                        in.close();
                        body = b.toString("UTF-8");
                    }
                    h.disconnect();
                } catch (Exception e) { /* status 0: the page treats it as failed */ }
                final String js = "window.Hidden && Hidden.posted(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")";
                main.post(() -> { if (web != null) web.evaluateJavascript(js, null); });
            }).start();
        }
    }
}
