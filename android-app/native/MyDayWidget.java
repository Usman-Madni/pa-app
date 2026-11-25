// The My Day widget: Late, Today, Any time today and Coming up, as Butler's My Day page works them out (Widgets.java).
// Its refresh button, and about every 15 minutes, bring it up to date without opening Butler (HiddenRefresh.java).
package app.butler.home;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

public class MyDayWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) Widgets.draw(c, m, id, Widgets.MY_DAY);
        m.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        HiddenRefresh.every(c);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (i != null && Widgets.REFRESH.equals(i.getAction())) { Widgets.refreshNow(c); return; }
        super.onReceive(c, i);
    }

    @Override
    public void onDisabled(Context c) { Widgets.lastGone(c); }
}
