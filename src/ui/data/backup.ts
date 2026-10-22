// Backup helpers shared by the reminder banner and Settings → Data.
import type { DataSnapshot } from '../../types';
import { daysBetween } from '../../engine/dates';
import { buildExport, exportFileName } from '../../store/exportImport';
import type { Changes } from '../../store/changes';
import { downloadText } from '../components/common';

/** Download the full backup and return the change that records when it was taken. */
export function exportEverything(snapshot: DataSnapshot): Changes {
  const at = new Date().toISOString();
  const snap: DataSnapshot = { ...snapshot, meta: { ...snapshot.meta, lastBackupAt: at } };
  downloadText(exportFileName(at), JSON.stringify(buildExport(snap, at), null, 1));
  return { meta: snap.meta };
}

/** Days since the last backup, or null if there is nothing worth backing up yet. */
export function backupOverdueDays(snapshot: DataSnapshot, today: string, reminderDays: number): number | null {
  const hasData = snapshot.athletes.some((a) => !a.demo) || snapshot.performances.some((p) => !p.demo);
  if (!hasData) return null;
  if (!snapshot.meta.lastBackupAt) return Infinity;
  const days = daysBetween(snapshot.meta.lastBackupAt.slice(0, 10), today);
  return days >= reminderDays ? days : null;
}
