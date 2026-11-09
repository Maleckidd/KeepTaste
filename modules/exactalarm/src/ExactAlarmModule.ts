import { requireOptionalNativeModule } from 'expo';

export type ExactAlarmModule = {
  /** True when AlarmManager may schedule exact alarms (always below API 31). */
  canScheduleExactAlarms(): boolean;
  /** Opens the system "Alarms & reminders" screen for this app (API 31+). */
  openExactAlarmSettings(): Promise<void>;
};

// Optional, not required: builds made before this module existed (and Expo Go)
// don't have it — callers treat a missing module as "exact alarms allowed".
export default requireOptionalNativeModule<ExactAlarmModule>('ExactAlarm');
