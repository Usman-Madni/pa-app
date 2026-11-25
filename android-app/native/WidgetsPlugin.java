// How Butler's page hands the widgets their rows: ButlerWidgets.update({data}) stores them and redraws every widget.
package app.butler.home;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ButlerWidgets")
public class WidgetsPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.isEmpty()) { call.reject("No rows"); return; }
        Widgets.save(getContext(), data);
        Widgets.refreshAll(getContext());
        call.resolve();
    }
}
