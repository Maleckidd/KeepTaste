package expo.modules.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Exact-alarm access for the cooking-timer alarm (SPEC.md §5.21). The app
// declares SCHEDULE_EXACT_ALARM (never USE_EXACT_ALARM); on Android 14+ it is
// denied by default, and expo-notifications falls back to an inexact alarm
// that may fire up to 3/4 of the duration late. This module only reports the
// state and opens the system "Alarms & reminders" screen — scheduling stays
// in expo-notifications, which picks setExactAndAllowWhileIdle on its own.
class ExactAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExactAlarm")

    Function("canScheduleExactAlarms") {
      canScheduleExactAlarms()
    }

    AsyncFunction("openExactAlarmSettings") {
      openExactAlarmSettings()
    }
  }

  private fun canScheduleExactAlarms(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    // No context / service: report allowed rather than nag about the unknowable.
    val context = appContext.reactContext ?: return true
    val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return true
    return alarmManager.canScheduleExactAlarms()
  }

  private fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val context = appContext.reactContext ?: return
    val packageUri = Uri.parse("package:" + context.packageName)
    try {
      start(context, Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri))
    } catch (e: Exception) {
      // Some OEMs lack the screen — fall back to the app's details page.
      start(context, Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri))
    }
  }

  private fun start(context: Context, intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val activity = appContext.currentActivity
    if (activity != null) activity.startActivity(intent) else context.startActivity(intent)
  }
}
