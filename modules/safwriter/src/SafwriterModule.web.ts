import type { SafwriterModule } from './SafwriterModule';

// Web stub — SAF auto-backup is Android-only, but backupArchiveFs imports this
// module at load time, which the web smoke build also loads. Never called on web.
const stub: SafwriterModule = {
  async copyFileToSaf(): Promise<void> {
    throw new Error('SAF backup is not available on web');
  },
};

export default stub;
