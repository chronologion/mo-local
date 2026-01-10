import { useState } from 'react';
import { AlertCircle, Key } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const PASSKEY_PROMPT_DISMISSED_KEY = 'mo-passkey-prompt-dismissed';

export type PasskeyEnrollmentPromptProps = {
  open: boolean;
  onEnroll: (passphrase: string) => Promise<void>;
  onDismiss: () => void;
  onDontAskAgain: () => void;
};

export function PasskeyEnrollmentPrompt({ open, onEnroll, onDismiss, onDontAskAgain }: PasskeyEnrollmentPromptProps) {
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');

  const handleEnroll = async () => {
    if (!passphrase) {
      setError('Passphrase is required');
      return;
    }
    setEnrolling(true);
    setError(null);
    try {
      await onEnroll(passphrase);
      setPassphrase(''); // Clear passphrase on success
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enroll passkey';
      setError(message);
    } finally {
      setEnrolling(false);
    }
  };

  const handleDontAskAgain = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PASSKEY_PROMPT_DISMISSED_KEY, 'true');
    }
    onDontAskAgain();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-accent2" />
            <DialogTitle>Enable Passkey Unlock</DialogTitle>
          </div>
          <DialogDescription>
            Use your device&apos;s biometric authentication or security key to unlock this app without typing your
            passphrase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="passphrase-confirm">Confirm your passphrase</Label>
            <Input
              id="passphrase-confirm"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter your passphrase"
              disabled={enrolling}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleEnroll();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">Required to verify your identity before enabling passkey</p>
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Uses your fingerprint, face, or security key</li>
              <li>Passkey never leaves your device</li>
              <li>You can still use your passphrase anytime</li>
            </ul>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button onClick={() => void handleEnroll()} disabled={enrolling} className="w-full">
              {enrolling ? 'Setting up...' : 'Enable Passkey'}
            </Button>
            <div className="flex gap-2">
              <Button onClick={onDismiss} variant="ghost" className="flex-1">
                Skip
              </Button>
              <Button onClick={handleDontAskAgain} variant="ghost" className="flex-1">
                Don&apos;t ask again
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function shouldShowPasskeyPrompt(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(PASSKEY_PROMPT_DISMISSED_KEY) !== 'true';
}

export function clearPasskeyPromptDismissal(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(PASSKEY_PROMPT_DISMISSED_KEY);
}
