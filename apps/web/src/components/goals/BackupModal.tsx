import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from '../../providers/AppProvider';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

type BackupModalProps = {
  open: boolean;
  onClose: () => void;
};

export function BackupModal({ open, onClose }: BackupModalProps) {
  const { session, services, exportKeyVaultBackup } = useApp();
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [dbBackupError, setDbBackupError] = useState<string | null>(null);
  const [dbBackupLoading, setDbBackupLoading] = useState(false);

  const userId = useMemo(() => (session.status === 'ready' ? session.userId : undefined), [session]);

  useEffect(() => {
    if (!open) {
      setBackupError(null);
      setBackupPassphrase('');
    }
  }, [open]);

  const downloadBackup = async () => {
    if (session.status !== 'ready') {
      setBackupError('Unlock with your passphrase to back up keys.');
      return;
    }
    if (!backupPassphrase) {
      setBackupError('Enter your passphrase to export the KeyVault.');
      return;
    }
    setBackupLoading(true);
    setBackupError(null);
    try {
      const backup = await exportKeyVaultBackup({ password: backupPassphrase });
      const blob = new Blob([backup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mo-local-backup-${userId ?? 'user'}.backup`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export KeyVault';
      setBackupError(message);
    } finally {
      setBackupLoading(false);
    }
  };

  const downloadDb = async (): Promise<void> => {
    setDbBackupError(null);
    if (!services.db.exportMainDatabase) {
      setDbBackupError('DB export is not supported in this build.');
      return;
    }
    setDbBackupLoading(true);
    try {
      const bytes = await services.db.exportMainDatabase();
      const stableBytes = new Uint8Array(bytes);
      const blob = new Blob([stableBytes], {
        type: 'application/x-sqlite3',
      });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `mo-eventstore-${userId ?? 'store'}.db`;
        a.rel = 'noopener';
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setDbBackupError(err instanceof Error ? err.message : 'DB export failed');
    } finally {
      setDbBackupLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Backup</DialogTitle>
          <DialogDescription>
            Download an encrypted key backup (required to unlock this identity on another device) and optionally export
            your local event store DB (goal/project data + event history).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm font-bold my-2">
            Important: Remember or store your passphrase in a password manager. You will not be able to restore your
            keys and data without it.
          </p>

          {backupLoading ? (
            <div className="flex items-center gap-2 text-foreground">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Exporting KeyVault…
            </div>
          ) : backupError ? (
            <p className="text-sm text-destructive">{backupError}</p>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">Passphrase</label>
            <input
              type="password"
              value={backupPassphrase}
              onChange={(event) => setBackupPassphrase(event.target.value)}
              placeholder="Enter your passphrase"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">A fresh passphrase entry is required to export KeyVault.</p>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button onClick={() => void downloadBackup()} disabled={backupLoading} variant="outline">
              Download backup
            </Button>
            <Button onClick={() => void downloadDb()} disabled={dbBackupLoading} variant="outline">
              {dbBackupLoading ? 'Exporting DB…' : 'Backup DB'}
            </Button>
          </div>

          {dbBackupError ? <p className="text-sm text-destructive">{dbBackupError}</p> : null}

          <p className="text-xs text-muted-foreground">
            Keep key backups offline. Anyone with the key backup and your passphrase can unlock this identity. The DB
            file contains your encrypted full local event history and can be restored via the onboarding restore flow.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
