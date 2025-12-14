import { FormEvent, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { Badge } from '../ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { useApp } from '../../providers/AppProvider';

export function Unlock() {
  const { session, unlock, resetLocalState } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await unlock({ password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Card className="border border-border bg-card/90 shadow-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold uppercase tracking-wide text-accent2">
              Unlock
            </span>
          </div>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>
            Unlock your keys with the passphrase you set during onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleUnlock}>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? 'Unlocking…' : 'Unlock'}
                <Lock className="ml-2 h-4 w-4 text-primary-foreground" />
              </Button>
              {session.status === 'locked' ? (
                <span className="text-sm text-muted-foreground">
                  User: {session.userId}
                </span>
              ) : null}
              {error && (
                <span className="text-sm text-destructive">{error}</span>
              )}
            </div>
          </form>
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Trouble unlocking? Reset local state and re-onboard.
              </div>
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
