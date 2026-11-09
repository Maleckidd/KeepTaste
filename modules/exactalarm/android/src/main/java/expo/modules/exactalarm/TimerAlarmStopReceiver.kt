package expo.modules.exactalarm

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// The "Stop" action of a ringing timer notification (TimerPresentationDelegate):
// cancels the notification, which silences its insistent sound and vibration.
// expo-notifications posts it with tag = request identifier. The app is not
// opened and the timer itself stays done until dismissed in the app.
class TimerAlarmStopReceiver : BroadcastReceiver() {
  companion object {
    const val EXTRA_IDENTIFIER = "identifier"
  }

  override fun onReceive(context: Context, intent: Intent) {
    try {
      val identifier = intent.getStringExtra(EXTRA_IDENTIFIER) ?: return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      for (active in manager.activeNotifications) {
        if (active.tag == identifier) manager.cancel(active.tag, active.id)
      }
    } catch (e: Exception) {
      // Nothing to stop, or the OS refused — the notification can still be swiped.
    }
  }
}
