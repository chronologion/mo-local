import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from '../../providers/AppProvider';
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
        const aggregateEncoded: Record<string, string> = {};
        for (const [aggregateId, wrappedKey] of Object.entries(
          backup.aggregateKeys
        )) {
          if (!(wrappedKey instanceof Uint8Array)) {
            throw new Error('Unexpected aggregate key format in keystore');
          }
          aggregateEncoded[aggregateId] = toBase64(wrappedKey);
        }
        const payload = {
          userId,
          identityKeys: identityEncoded,
          aggregateKeys: aggregateEncoded,
          exportedAt: new Date().toISOString(),
        };
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Backup identity keys (not goal data)</DialogTitle>
          <DialogDescription>
            Save this file securely. It only contains your signing and per-goal
            keys; it does not include your goals or event history. Until sync or
            log export exists, your goals stay on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {backupLoading ? (
            <div className="flex items-center gap-2 text-foreground">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Loading keys…
            </div>
          ) : backupError ? (
            <p className="text-sm text-destructive">{backupError}</p>
          ) : backupCipher ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
              Encrypted backup ready. Use Download or Copy to save it securely.
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              onClick={downloadBackup}
              disabled={!backupCipher || backupLoading}
              variant="secondary"
            >
              Download .json
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
          </div>

          <p className="text-xs text-muted-foreground">
            Keep backups offline. Anyone with this file can impersonate you. To
            see your goals on another device you will also need their event data
            (future sync/export), not just this key backup.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
