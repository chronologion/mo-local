import { FormEvent, useState, useEffect } from 'react';
import { Lock, RefreshCw, Key } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { useApp } from '../../providers/AppProvider';
import { getUserPresenceSecret, isUserPresenceSupported } from '@mo/key-service-web';

export function Unlock() {
  const { session, unlock, unlockWithUserPresence, resetLocalState, requestKeyService } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [checkingPasskey, setCheckingPasskey] = useState(true);
  const [enablePasskey, setEnablePasskey] = useState(false);

  useEffect(() => {
    if (!isUserPresenceSupported()) {
      setPasskeyEnabled(false);
      setCheckingPasskey(false);
      return;
    }

    void (async () => {
      try {
        const info = await requestKeyService({
          type: 'getUserPresenceUnlockInfo',
          payload: {},
        });
        setPasskeyEnabled(info.enabled);
      } catch {
        setPasskeyEnabled(false);
      } finally {
        setCheckingPasskey(false);
      }
    })();
  }, [requestKeyService]);

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await unlock({ password, enablePasskey });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    setPasskeyLoading(true);
    setError(null);
    try {
      const info = await requestKeyService({
        type: 'getUserPresenceUnlockInfo',
        payload: {},
      });

      if (!info.enabled || !info.credentialId || !info.prfSalt) {
        throw new Error('Passkey is not enabled or not properly configured');
      }

      const userPresenceSecret = await getUserPresenceSecret({
        credentialId: info.credentialId,
        prfSalt: info.prfSalt,
        rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
        timeoutMs: 60_000,
      });

      await unlockWithUserPresence({ userPresenceSecret });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey unlock failed';
      setError(message);
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Card className="border border-border bg-card/90 shadow-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-wide text-accent2">Unlock</span>
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Unlock your keys with the passphrase you set during onboarding.</CardDescription>
        </CardHeader>
        <CardContent>
          {!checkingPasskey && passkeyEnabled && (
            <div className="mb-6 space-y-3">
              <Button
                type="button"
                onClick={() => void handlePasskeyUnlock()}
                disabled={passkeyLoading}
                className="w-full"
                variant="default"
              >
                {passkeyLoading ? 'Unlocking with passkey…' : 'Unlock with Passkey'}
                <Key className="ml-2 h-4 w-4" />
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or use passphrase</span>
                </div>
              </div>
            </div>
          )}
          <form className="space-y-4" onSubmit={handleUnlock}>
            <div className="space-y-2">
              <Label htmlFor="unlock-passphrase">Passphrase</Label>
              <Input
                id="unlock-passphrase"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {!checkingPasskey && !passkeyEnabled && isUserPresenceSupported() && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enable-passkey-unlock"
                  checked={enablePasskey}
                  onCheckedChange={(checked) => setEnablePasskey(checked === true)}
                />
                <label
                  htmlFor="enable-passkey-unlock"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Enable passkey unlock (fingerprint, face, or security key)
                </label>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading || passkeyLoading}>
                {loading ? 'Unlocking…' : 'Unlock'}
                <Lock className="ml-2 h-4 w-4 text-primary-foreground" />
              </Button>
              {session.status === 'locked' ? (
                <span className="text-sm text-muted-foreground">User: {session.userId}</span>
              ) : null}
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </form>
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Trouble unlocking? Reset local state and re-onboard.</div>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={async () => {
                  const confirmed = window.confirm(
                    'This will clear local data for this app on this device. You will need to onboard again.'
                  );
                  if (!confirmed) return;
                  await resetLocalState();
                  setPassword('');
                  setError(null);
                }}
              >
                Reset local data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {session.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="uppercase tracking-widest">
            session
          </Badge>
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          Loading identity…
        </div>
      )}
    </div>
  );
}
