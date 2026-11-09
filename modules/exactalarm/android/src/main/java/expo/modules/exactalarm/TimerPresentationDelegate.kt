package expo.modules.exactalarm

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.notifications.model.Notification as ExpoNotification

// Cooking-timer alarm presentation (SPEC.md §5.21). expo-notifications has no
// option for notification flags, so timer notifications (identifier "timer:…")
// are post-processed here:
// - FLAG_INSISTENT: Android loops the channel's sound and vibration until the
//   notification is tapped, swiped, cancelled, or the shade is pulled down.
// - A "Stop" action (label from the content data's `stopLabel`, localized by
//   the JS side) that cancels the notification via TimerAlarmStopReceiver
//   without opening the app. The in-app timer stays done until dismissed.
// Any failure returns the library's notification unmodified.
class TimerPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  companion object {
    private const val TIMER_PREFIX = "timer:"
    private const val STOP_LABEL_KEY = "stopLabel"
    private const val DEFAULT_STOP_LABEL = "Stop"
  }

  override suspend fun createNotification(
    notification: ExpoNotification,
    notificationBehavior: NotificationBehaviorRecord?
  ): Notification {
    val built = super.createNotification(notification, notificationBehavior)
    return try {
      val request = notification.notificationRequest ?: return built
      val identifier = request.identifier ?: return built
      if (!identifier.startsWith(TIMER_PREFIX)) return built
      makeRinging(built, identifier, stopLabel(notification))
    } catch (e: Exception) {
      built
    }
  }

  private fun stopLabel(notification: ExpoNotification): String {
    return try {
      val label = notification.notificationRequest?.content?.body?.optString(STOP_LABEL_KEY, "")
      if (label.isNullOrBlank()) DEFAULT_STOP_LABEL else label
    } catch (e: Exception) {
      DEFAULT_STOP_LABEL
    }
  }

  private fun makeRinging(n: Notification, identifier: String, label: String): Notification {
    n.flags = n.flags or Notification.FLAG_INSISTENT
    val intent = Intent(context, TimerAlarmStopReceiver::class.java)
      .putExtra(TimerAlarmStopReceiver.EXTRA_IDENTIFIER, identifier)
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      identifier.hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val action = Notification.Action.Builder(null as Icon?, label, pendingIntent).build()
    val existing: Array<Notification.Action> = n.actions ?: emptyArray()
    n.actions = existing + action
    return n
  }
}
