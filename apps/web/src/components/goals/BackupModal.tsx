import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from '../../providers/AppProvider';
import { createBackupPayloadV2 } from '../../backup/backupPayload';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

const toBase64 = (data: Uint8Array): string =>
  btoa(String.fromCharCode(...Array.from(data)));

type BackupModalProps = {
  open: boolean;
  onClose: () => void;
};

export function BackupModal({ open, onClose }: BackupModalProps) {
  const { session, services, masterKey, userMeta } = useApp();
  const [backupCipher, setBackupCipher] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [dbBackupError, setDbBackupError] = useState<string | null>(null);
  const [dbBackupLoading, setDbBackupLoading] = useState(false);

  const userId = useMemo(
    () => (session.status === 'ready' ? session.userId : undefined),
    [session]
  );

  useEffect(() => {
    if (!open || session.status !== 'ready') return;
    setBackupLoading(true);
    setBackupError(null);
    const run = async () => {
      try {
        if (!userId) {
          setBackupError('User unavailable; cannot derive salt');
          setBackupCipher(null);
          return;
        }
        if (!masterKey) {
          setBackupError('Unlock with your passphrase to back up keys.');
          setBackupCipher(null);
          return;
        }
        const backup = await services.keyStore.exportKeys();
        if (!backup.identityKeys) {
          setBackupError('No keys found in keystore');
          setBackupCipher(null);
          return;
        }
        const identityEncoded = backup.identityKeys
          ? {
              signingPrivateKey: toBase64(
                backup.identityKeys.signingPrivateKey
              ),
              signingPublicKey: toBase64(backup.identityKeys.signingPublicKey),
              encryptionPrivateKey: toBase64(
                backup.identityKeys.encryptionPrivateKey
              ),
              encryptionPublicKey: toBase64(
                backup.identityKeys.encryptionPublicKey
              ),
            }
          : null;
        if (!identityEncoded) {
          setBackupError('No keys found in keystore');
          setBackupCipher(null);
          return;
        }
        const payload = createBackupPayloadV2({
          userId,
          identityKeys: identityEncoded,
          exportedAt: new Date().toISOString(),
        });
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const encrypted = await services.crypto.encrypt(plaintext, masterKey);
        const b64 = toBase64(encrypted);
        const saltB64 = userMeta?.pwdSalt;
        if (!saltB64) {
          throw new Error(
            'Password salt missing; please reset local state and re-onboard before exporting a backup.'
          );
        }
        setBackupCipher(
          JSON.stringify({ cipher: b64, salt: saltB64 }, null, 2)
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load keys';
        setBackupError(message);
        setBackupCipher(null);
      } finally {
        setBackupLoading(false);
      }
    };
    void run();
  }, [open, masterKey, services, session, userId, userMeta]);

  const downloadBackup = () => {
    if (!backupCipher) return;
    const blob = new Blob([backupCipher], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mo-local-backup-${userId ?? 'user'}.backup`;
    a.click();
    URL.revokeObjectURL(url);
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
            Download an encrypted key backup (required to unlock this identity
            on another device) and optionally export your local event store DB
            (goal/project data + event history).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm font-bold my-2">
            Important: Remember or store your passphrase in a password manager.
            You will not be able to restore your keys and data without it.
          </p>

          {backupLoading ? (
            <div className="flex items-center gap-2 text-foreground">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Loading keys…
            </div>
          ) : backupError ? (
            <p className="text-sm text-destructive">{backupError}</p>
          ) : null}

          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={downloadBackup}
              disabled={!backupCipher || backupLoading}
              variant="outline"
            >
              Download keys
            </Button>
            <Button
              onClick={() => {
                if (backupCipher) {
                  void navigator.clipboard.writeText(backupCipher);
                }
              }}
              disabled={!backupCipher || backupLoading}
              variant="ghost"
            >
              Copy
            </Button>
            <Button
              onClick={() => void downloadDb()}
              disabled={dbBackupLoading}
              variant="outline"
            >
              {dbBackupLoading ? 'Exporting DB…' : 'Backup DB'}
            </Button>
          </div>

          {dbBackupError ? (
            <p className="text-sm text-destructive">{dbBackupError}</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Keep key backups offline. Anyone with the key backup and your
            passphrase can impersonate you. If you use a simple passphrase, the
            key backup can be used to brute-force your keys even without your
            passphrase. The DB file contains your encrypted full local event
            history and can be restored via the onboarding restore flow.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
