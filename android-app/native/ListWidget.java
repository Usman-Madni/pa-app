// The One list widget: one bucket's open tasks (picked in ListConfigActivity), as Butler lists them (Widgets.java).
package app.butler.home;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class ListWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) Widgets.draw(c, m, id, Widgets.LIST);
        m.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) Widgets.forget(c, id);
    }
}
