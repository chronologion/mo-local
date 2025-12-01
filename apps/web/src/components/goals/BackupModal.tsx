import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useApp } from '../../providers/AppProvider';
import { Button } from '../ui/button';
import { deriveSaltForUser } from '../../lib/deriveSalt';

const toBase64 = (data: Uint8Array): string =>
  btoa(String.fromCharCode(...Array.from(data)));

type BackupModalProps = {
  open: boolean;
  onClose: () => void;
};

export function BackupModal({ open, onClose }: BackupModalProps) {
  const { session, services, masterKey } = useApp();
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
        const aggregateEncoded = Object.fromEntries(
          Object.entries(backup.aggregateKeys).map(([id, key]) => [
            id,
            toBase64(key as Uint8Array),
          ])
        );
        const payload = {
          userId: backup.userId ?? userId ?? 'user',
          identityKeys: identityEncoded,
          aggregateKeys: aggregateEncoded,
          exportedAt: new Date().toISOString(),
        };
        const plaintext = new TextEncoder().encode(JSON.stringify(payload));
        const encrypted = await services.crypto.encrypt(plaintext, masterKey);
        const b64 = toBase64(encrypted);
        const salt = await deriveSaltForUser(payload.userId);
        const saltB64 = toBase64(salt);
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
  }, [open, masterKey, services, session, userId]);

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-panel/90 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Backup identity keys
            </h3>
            <p className="text-sm text-slate-400">
              Save this file securely. It contains your signing/encryption
              keypairs.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {backupLoading ? (
            <div className="flex items-center gap-2 text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Loading keys…
            </div>
          ) : backupError ? (
            <p className="text-sm text-red-400">{backupError}</p>
          ) : backupCipher ? (
            <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/60 p-3 text-xs text-slate-200 break-all">
              {backupCipher}
            </pre>
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
          <p className="text-xs text-slate-500">
            Keep backups offline. Anyone with this file can impersonate you.
          </p>
        </div>
      </div>
    </div>
  );
}
