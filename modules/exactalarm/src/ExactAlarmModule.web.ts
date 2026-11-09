import type { ExactAlarmModule } from './ExactAlarmModule';

// Web stub — exact alarms are an Android concept. utils/timerAlarm imports this
// module at load time, which the web smoke build also loads.
const stub: ExactAlarmModule = {
  canScheduleExactAlarms(): boolean {
    return true;
  },
  async openExactAlarmSettings(): Promise<void> {},
};

export default stub;
