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
  const { session, unlock } = useApp();
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
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-accent">
            <Lock className="h-5 w-5" />
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
                <Lock className="ml-2 h-4 w-4" />
              </Button>
              {session.status === 'locked' ? (
                <span className="text-sm text-slate-400">
                  User: {session.userId}
                </span>
              ) : null}
              {error && <span className="text-sm text-red-400">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>
      {session.status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Badge variant="secondary" className="uppercase tracking-widest">
            session
          </Badge>
          <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
          Loading identity…
        </div>
      )}
    </div>
  );
}
