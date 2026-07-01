// Lightweight pub/sub for the auto-backup running state. No React Context —
// just a module-level Set of setState callbacks so any component can subscribe
// without adding a Provider to the tree.
import { useState, useEffect } from 'react';

const listeners = new Set<(running: boolean) => void>();

export function setBackupRunning(running: boolean): void {
  listeners.forEach((fn) => fn(running));
}

export function useBackupRunning(): boolean {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    listeners.add(setRunning);
    return () => {
      listeners.delete(setRunning);
    };
  }, []);
  return running;
}
