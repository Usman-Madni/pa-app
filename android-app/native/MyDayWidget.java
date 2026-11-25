// The My Day widget: Late, Today, Any time today and Coming up, as Butler's My Day page works them out (Widgets.java).
package app.butler.home;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class MyDayWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) Widgets.draw(c, m, id, Widgets.MY_DAY);
        m.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
    }
}
