// The One list widget: one bucket's open tasks (picked in ListConfigActivity), as Butler lists them (Widgets.java).
// Its refresh button, and about every 15 minutes, bring it up to date without opening Butler (HiddenRefresh.java).
package app.butler.home;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

public class ListWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) Widgets.draw(c, m, id, Widgets.LIST);
        m.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
        HiddenRefresh.every(c);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        if (i != null && Widgets.REFRESH.equals(i.getAction())) { Widgets.refreshNow(c); return; }
        super.onReceive(c, i);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) Widgets.forget(c, id);
    }

    @Override
    public void onDisabled(Context c) { Widgets.lastGone(c); }
}
