// Manual mock for the local @/modules/safwriter native module. utils/backupArchiveFs
// imports it at load time (pulled in by the backupTrigger chain), but the SAF copy
// is device-only per CLAUDE.md and never exercised in ts-jest.
export async function copyFileToSaf(): Promise<void> {}
