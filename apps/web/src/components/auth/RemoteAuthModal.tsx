import { useEffect, useMemo, useState } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';
import { useRemoteAuth } from '../../providers/RemoteAuthProvider';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

type RemoteAuthModalProps = {
  open: boolean;
  onClose: () => void;
  mode?: 'login' | 'signup';
};

export function RemoteAuthModal({
  open,
  onClose,
  mode = 'signup',
}: RemoteAuthModalProps) {
  const { signUp, logIn, state, error, clearError } = useRemoteAuth();
  const [tab, setTab] = useState<'login' | 'signup'>(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(mode);
    setEmail('');
    setPassword('');
    setLocalError(null);
    clearError();
  }, [open, mode, clearError]);

  useEffect(() => {
    if (state.status === 'connected') {
      onClose();
    }
  }, [state.status, onClose]);

  const disableActions = useMemo(
    () => submitting || state.status === 'connecting',
    [submitting, state.status]
  );

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setLocalError(null);
    try {
      if (tab === 'signup') {
        await signUp({ email, password });
      } else {
        await logIn({ email, password });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Request failed, try again';
      setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showError = localError ?? error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-panel/90 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-accent">
              Connect to cloud
            </p>
            <h3 className="text-xl font-semibold">
              {tab === 'signup' ? 'Create account' : 'Log in'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Accounts live in Kratos. Password stays with Kratos; keys stay
              local.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              tab === 'signup'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-foreground'
            }`}
            onClick={() => setTab('signup')}
            disabled={disableActions}
          >
            <UserPlus className="h-4 w-4" />
            Sign up
          </button>
          <button
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              tab === 'login'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-foreground'
            }`}
            onClick={() => setTab('login')}
            disabled={disableActions}
          >
            <LogIn className="h-4 w-4" />
            Log in
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              disabled={disableActions}
            />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              placeholder="Min 8 characters"
              onChange={(e) => setPassword(e.target.value)}
              disabled={disableActions}
            />
          </div>
          {showError ? (
            <p className="text-sm text-destructive">{showError}</p>
          ) : null}
          <Button
            className="w-full"
            onClick={() => void handleSubmit()}
            disabled={!email || !password || disableActions}
          >
            {state.status === 'connecting' || submitting
              ? 'Connecting…'
              : tab === 'signup'
                ? 'Create account'
                : 'Log in'}
          </Button>
        </div>
      </div>
    </div>
  );
}
