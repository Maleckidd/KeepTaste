package expo.modules.exactalarm

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.os.SystemClock
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.notifications.model.Notification as ExpoNotification

// Cooking-timer notification presentation (SPEC.md §5.21). expo-notifications
// has no option for notification flags or custom views, so timer
// notifications are post-processed here.
//
// Alarms (identifier "timer:<id>", stage 2):
// - FLAG_INSISTENT: Android loops the channel's sound and vibration until the
//   notification is tapped, swiped, cancelled, or the shade is pulled down.
// - A "Stop" action (label from the content data's `stopLabel`, localized by
//   the JS side) that cancels the notification via TimerAlarmStopReceiver
//   without opening the app. The in-app timer stays done until dismissed.
// - The timer's live countdown ("timer-live:<id>") is cancelled: the alarm
//   replaces it, also while the app process is dead.
//
// Live countdowns (identifier "timer-live:<id>", stage 3): an ongoing, silent
// notification with a custom view whose Chronometer the system ticks itself —
// counting down to the data's `liveEndsAtMs` (running), or showing the frozen
// `livePausedMs` (paused). The JS reconciler (utils/timerAlarm.ts) posts and
// removes it. A failed custom view falls back to the library's notification,
// only made ongoing and alert-once.
//
// Any failure returns the library's notification (nearly) unmodified.
class TimerPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  companion object {
    private const val TIMER_PREFIX = "timer:"
    private const val LIVE_PREFIX = "timer-live:"
    private const val STOP_LABEL_KEY = "stopLabel"
    private const val DEFAULT_STOP_LABEL = "Stop"
    private const val LIVE_ENDS_AT_KEY = "liveEndsAtMs"
    private const val LIVE_PAUSED_KEY = "livePausedMs"
    // expo-notifications posts every notification with tag = identifier and
    // this id (ExpoPresentationDelegate.ANDROID_NOTIFICATION_ID).
    private const val NOTIFY_ID = 0
  }

  override suspend fun createNotification(
    notification: ExpoNotification,
    notificationBehavior: NotificationBehaviorRecord?
  ): Notification {
    val built = super.createNotification(notification, notificationBehavior)
    return try {
      val request = notification.notificationRequest ?: return built
      val identifier = request.identifier ?: return built
      when {
        identifier.startsWith(LIVE_PREFIX) -> makeLive(built, notification)
        identifier.startsWith(TIMER_PREFIX) -> {
          cancelLive(identifier.substring(TIMER_PREFIX.length))
          makeRinging(built, identifier, stopLabel(notification))
        }
        else -> built
      }
    } catch (e: Exception) {
      built
    }
  }

  // --- Alarm ---

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

  /** Removes the timer's live countdown — its alarm is being presented. */
  private fun cancelLive(timerId: String) {
    if (timerId.isEmpty()) return
    try {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
      manager.cancel(LIVE_PREFIX + timerId, NOTIFY_ID)
    } catch (e: Exception) {
      // Not shown, or the OS refused — the JS reconciler dismisses it later.
    }
  }

  // --- Live countdown ---

  private fun makeLive(built: Notification, notification: ExpoNotification): Notification {
    return try {
      val content = notification.notificationRequest?.content
      val data = content?.body
      val title = content?.title ?: ""
      val body = content?.text ?: ""
      val nowWall = System.currentTimeMillis()
      val nowElapsed = SystemClock.elapsedRealtime()
      // Running: count down to the end. Paused: the frozen remaining time.
      val endsAtMs = if (data != null && data.has(LIVE_ENDS_AT_KEY)) data.getDouble(LIVE_ENDS_AT_KEY).toLong() else null
      val pausedMs = if (data != null && data.has(LIVE_PAUSED_KEY)) data.getDouble(LIVE_PAUSED_KEY).toLong() else null
      if (endsAtMs == null && pausedMs == null) return fallbackLive(built)

      val collapsed = RemoteViews(context.packageName, R.layout.timer_live_collapsed)
      val expanded = RemoteViews(context.packageName, R.layout.timer_live_expanded)
      for (views in listOf(collapsed, expanded)) {
        views.setTextViewText(R.id.timer_live_title, title)
        if (endsAtMs != null) {
          // +999: the Chronometer floors, the in-app countdown rounds up —
          // keep both showing the same second.
          val base = nowElapsed + (endsAtMs - nowWall) + 999L
          views.setChronometer(R.id.timer_live_chrono, base, null, true)
          views.setChronometerCountDown(R.id.timer_live_chrono, true)
          views.setViewVisibility(R.id.timer_live_chrono, View.VISIBLE)
          views.setViewVisibility(R.id.timer_live_frozen, View.GONE)
        } else {
          // A stopped Chronometer recomputes its text from "now" on every
          // re-inflation, so the frozen time is a static text instead.
          val seconds = ((pausedMs ?: 0L) + 999L) / 1000L
          views.setTextViewText(R.id.timer_live_frozen, DateUtils.formatElapsedTime(seconds))
          views.setViewVisibility(R.id.timer_live_frozen, View.VISIBLE)
          views.setViewVisibility(R.id.timer_live_chrono, View.GONE)
        }
      }
      expanded.setTextViewText(R.id.timer_live_body, body)

      val builder = Notification.Builder.recoverBuilder(context, built)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setStyle(Notification.DecoratedCustomViewStyle())
        .setCustomContentView(collapsed)
        .setCustomBigContentView(expanded)
      // Silent already: the `timers-live` channel has no sound or vibration,
      // the JS side posts with `sound: false` (the library builder then marks
      // it silent, kept by recoverBuilder), and it alerts only once.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        builder.setCategory(Notification.CATEGORY_STOPWATCH)
      }
      if (endsAtMs != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        // Gone at zero even when the alarm is inexact and comes later — never
        // a countdown running into negative time (also when posted late).
        builder.setTimeoutAfter(maxOf(1L, endsAtMs - nowWall))
      }
      builder.build()
    } catch (e: Exception) {
      fallbackLive(built)
    }
  }

  private fun fallbackLive(built: Notification): Notification {
    built.flags = built.flags or Notification.FLAG_ONGOING_EVENT or Notification.FLAG_ONLY_ALERT_ONCE
    return built
  }
}
