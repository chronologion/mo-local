import { FormEvent, useState } from 'react';
import { ArrowRight, Lock, Wand2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { useApp } from '../../providers/AppProvider';

export function Onboarding() {
  const { completeOnboarding, restoreBackup } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restorePass, setRestorePass] = useState('');
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<string | null>(null);
  const [selectedDbFile, setSelectedDbFile] = useState<string | null>(null);
  const [restoreDbBytes, setRestoreDbBytes] = useState<Uint8Array | null>(null);
  const [restoreDbLoading, setRestoreDbLoading] = useState(false);

  const readFileAsUint8Array = async (file: File): Promise<Uint8Array> => {
    if (typeof file.arrayBuffer === 'function') {
      return new Uint8Array(await file.arrayBuffer());
    }
    return await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.onload = () => {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error('Failed to read file bytes'));
          return;
        }
        resolve(new Uint8Array(result));
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSubmitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await completeOnboarding({ password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (event: FormEvent) => {
    event.preventDefault();
    setRestoreError(null);
    if (!restoreInput.trim()) {
      setRestoreError('Choose a backup file first');
      return;
    }
    if (!restorePass) {
      setRestoreError('Enter the passphrase used to create the backup');
      return;
    }
    if (selectedDbFile && !restoreDbBytes) {
      setRestoreError('DB file is still loading (or failed to load)');
      return;
    }
    setRestoreLoading(true);
    try {
      const params: Parameters<typeof restoreBackup>[0] = {
        password: restorePass,
        backup: restoreInput,
      };
      if (restoreDbBytes && selectedDbFile) {
        params.db = { bytes: restoreDbBytes };
      }
      await restoreBackup(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      setRestoreError(message);
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="uppercase tracking-widest">
          Offline-first
        </Badge>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 text-primary" />
          Keys stay local — data stays local (no sync)
        </div>
      </div>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-accent">
            <Wand2 className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">Set passphrase</span>
          </div>
          <CardTitle>Set up your local identity</CardTitle>
          <CardDescription>Generate keys on-device and encrypt them with your passphrase.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmitPassword}>
            <div className="space-y-2">
              <Label>Password (derives KEK)</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                placeholder="Create a passphrase"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm password</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                placeholder="Repeat passphrase"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating keys…' : 'Finish onboarding'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-accent">
            <Wand2 className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wide text-primary">Restore from backup</span>
          </div>
          <CardTitle>Import keys from encrypted backup</CardTitle>
          <CardDescription>
            Select your .backup file and enter the passphrase you used when exporting. Backups contain keys only; goal
            data and event history remain on the original device until sync/log export exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4" onSubmit={handleRestore}>
            <div className="space-y-2">
              <Label>Backup file</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".backup,.json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setSelectedRestoreFile(null);
                      setRestoreInput('');
                      return;
                    }
                    setSelectedRestoreFile(file.name);
                    const text = await file.text();
                    setRestoreInput(text);
                  }}
                  className="text-xs text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
                />
                {selectedRestoreFile && (
                  <span className="text-xs text-muted-foreground">Selected: {selectedRestoreFile}</span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Event store DB (optional)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".db,application/x-sqlite3"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setSelectedDbFile(null);
                      setRestoreDbBytes(null);
                      setRestoreDbLoading(false);
                      return;
                    }
                    setSelectedDbFile(file.name);
                    setRestoreDbLoading(true);
                    try {
                      setRestoreDbBytes(await readFileAsUint8Array(file));
                    } finally {
                      setRestoreDbLoading(false);
                    }
                  }}
                  className="text-xs text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-foreground"
                />
                {selectedDbFile && <span className="text-xs text-muted-foreground">Selected: {selectedDbFile}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                Use the `.db` file downloaded from the debug panel (optional). It should correspond to the same identity
                as the key backup.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Backup passphrase</Label>
              <Input
                type="password"
                value={restorePass}
                onChange={(e) => setRestorePass(e.target.value)}
                placeholder="Passphrase used for backup"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={restoreLoading || restoreDbLoading}>
                {restoreLoading ? 'Restoring…' : restoreDbLoading ? 'Reading DB…' : 'Restore backup'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              {restoreError && <span className="text-sm text-destructive">{restoreError}</span>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
