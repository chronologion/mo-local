import { useEffect, useMemo, useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { useRemoteAuth } from '../../providers/RemoteAuthProvider';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

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

  const handleTabChange = (value: string) => {
    if (value !== 'login' && value !== 'signup') return;
    setTab(value);
    setLocalError(null);
    clearError();
  };

  const handleSubmit = async (intent: 'login' | 'signup') => {
    setSubmitting(true);
    setLocalError(null);
    try {
      if (intent === 'signup') {
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <p className="text-xs uppercase tracking-widest text-accent">
            Connect to cloud
          </p>
          <DialogTitle>
            {tab === 'signup' ? 'Create account' : 'Log in'}
          </DialogTitle>
          <DialogDescription>
            Accounts live in Kratos. Password stays with Kratos; keys stay
            local.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="signup" disabled={disableActions}>
              <UserPlus className="h-4 w-4" />
              Sign up
            </TabsTrigger>
            <TabsTrigger value="login" disabled={disableActions}>
              <LogIn className="h-4 w-4" />
              Log in
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signup">
            <div className="space-y-4">
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
                onClick={() => void handleSubmit('signup')}
                disabled={!email || !password || disableActions}
              >
                {state.status === 'connecting' || submitting
                  ? 'Connecting…'
                  : 'Create account'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="login">
            <div className="space-y-4">
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
                onClick={() => void handleSubmit('login')}
                disabled={!email || !password || disableActions}
              >
                {state.status === 'connecting' || submitting
                  ? 'Connecting…'
                  : 'Log in'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
