package expo.modules.exactalarm

import android.content.Context
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.interfaces.PresentationDelegate

// The app's expo-notifications receiver (SPEC.md §5.21). expo-notifications
// routes every NOTIFICATION_EVENT to the highest-priority receiver in the
// package (NotificationsService.findDesignatedBroadcastReceiver); this one is
// registered at priority 0 in this module's manifest, above the library's -1.
// It inherits everything and only swaps the presentation delegate, so timer
// notifications ring until the user acts (TimerPresentationDelegate). The
// library receiver still handles boot / package-replaced, and the triggers it
// re-schedules resolve to this receiver.
class TimerNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    TimerPresentationDelegate(context)
}
