import { FormEvent, useEffect, useMemo, useState } from 'react';
import { SliceValue } from '@mo/domain';
import {
  ArrowRight,
  Check,
  KeyRound,
  Lock,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useApp } from './providers/AppProvider';
import { useGoals } from './hooks/useGoals';
import { useGoalCommands } from './hooks/useGoalCommands';
import { Button } from './components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { Badge } from './components/ui/badge';
import { cn } from './lib/utils';

const sliceOptions: SliceValue[] = [
  'Health',
  'Family',
  'Relationships',
  'Work',
  'Money',
  'Learning',
  'Mindfulness',
  'Leisure',
];

const priorityOptions: Array<'must' | 'should' | 'maybe'> = [
  'must',
  'should',
  'maybe',
];

const getDefaultTargetMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

function Onboarding() {
  const { completeOnboarding } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="uppercase tracking-widest">
          Offline-first
        </Badge>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Lock className="h-4 w-4 text-accent2" />
          Keys stay local — data stays local (no sync)
        </div>
      </div>
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-accent">
            <Wand2 className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wide text-accent2">
              Set passphrase
            </span>
          </div>
          <CardTitle>Set up your local identity</CardTitle>
          <CardDescription>
            Generate keys on-device and encrypt them with your passphrase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={handleSubmitPassword}
          >
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
              {error && <span className="text-sm text-red-400">{error}</span>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Unlock() {
  const { unlock, session } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlock({ password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unlock';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Unlock your vault</CardTitle>
          <CardDescription>
            Keys are stored encrypted. Enter your passphrase to decrypt them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>Passphrase</Label>
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
    </div>
  );
}

type GoalFormValues = {
  summary: string;
  slice: SliceValue;
  priority: 'must' | 'should' | 'maybe';
  targetMonth: string;
};

function GoalForm({
  onSubmit,
}: {
  onSubmit: (params: GoalFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<GoalFormValues>({
    summary: '',
    slice: 'Health',
    priority: 'must',
    targetMonth: getDefaultTargetMonth(),
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
    setValues((prev) => ({ ...prev, summary: '' }));
  };

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label>Summary</Label>
        <Input
          value={values.summary}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, summary: e.target.value }))
          }
          required
          placeholder="Define a concrete goal"
        />
      </div>
      <div className="space-y-2">
        <Label>Slice</Label>
        <Select
          value={values.slice}
          onValueChange={(val) =>
            setValues((prev) => ({
              ...prev,
              slice: val as SliceValue,
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose slice" />
          </SelectTrigger>
          <SelectContent>
            {sliceOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Priority</Label>
        <Select
          value={values.priority}
          onValueChange={(val) =>
            setValues((prev) => ({
              ...prev,
              priority: val as GoalFormValues['priority'],
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            {priorityOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Target month</Label>
        <Input
          type="month"
          value={values.targetMonth}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, targetMonth: e.target.value }))
          }
        />
      </div>
      <div className="md:col-span-2">
        <Button type="submit" className="w-full md:w-auto">
          Create goal
          <Sparkles className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

function GoalDashboard() {
  const { session, services, masterKey } = useApp();
  const { goals, loading, error, refresh } = useGoals();
  const {
    createGoal,
    deleteGoal,
    updateGoal,
    loading: mutating,
    error: mutationError,
  } = useGoalCommands();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<GoalFormValues>({
    summary: '',
    slice: 'Health',
    priority: 'must',
    targetMonth: getDefaultTargetMonth(),
  });
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupCipher, setBackupCipher] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => a.targetMonth.localeCompare(b.targetMonth)),
    [goals]
  );

  const activeGoal = editingId ? goals.find((g) => g.id === editingId) : null;

  const saveEdit = async () => {
    if (!activeGoal) return;
    const changes: Partial<GoalFormValues> & { goalId: string } = {
      goalId: activeGoal.id,
    };
    if (editValues.summary !== activeGoal.summary)
      changes.summary = editValues.summary;
    if (editValues.slice !== (activeGoal.slice as SliceValue))
      changes.slice = editValues.slice;
    if (editValues.priority !== activeGoal.priority)
      changes.priority = editValues.priority;
    if (editValues.targetMonth !== activeGoal.targetMonth)
      changes.targetMonth = editValues.targetMonth;

    if (Object.keys(changes).length === 1) {
      setEditingId(null);
      return;
    }
    await updateGoal(changes);
    await refresh();
    setEditingId(null);
  };

  useEffect(() => {
    if (!backupOpen || session.status !== 'ready') return;
    setBackupLoading(true);
    setBackupError(null);
    const run = async () => {
      try {
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
        const plaintext = new TextEncoder().encode(
          JSON.stringify({
            userId: backup.userId ?? session.userId,
            identityKeys: backup.identityKeys,
            aggregateKeys: backup.aggregateKeys,
            exportedAt: new Date().toISOString(),
          })
        );
        const encrypted = await services.crypto.encrypt(plaintext, masterKey);
        const b64 = btoa(String.fromCharCode(...Array.from(encrypted)));
        setBackupCipher(b64);
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
  }, [backupOpen, masterKey, services, session]);

  const downloadBackup = () => {
    if (!backupCipher) return;
    const bytes = Uint8Array.from(atob(backupCipher), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mo-local-backup-${session.status === 'ready' ? session.userId : 'user'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Badge variant="secondary">local-only</Badge>
              <span className="flex items-center gap-1">
                <KeyRound className="h-4 w-4 text-accent2" /> User:{' '}
                {session.status === 'ready' ? session.userId : '—'}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-white">
              Goals (offline)
            </h1>
            <p className="text-sm text-slate-400">
              No sync or sharing yet. Everything persists in OPFS/LiveStore.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBackupOpen(true)}>
              Backup keys
            </Button>
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              <RefreshCw
                className={cn('mr-2 h-4 w-4', loading && 'animate-spin')}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New goal</CardTitle>
          <CardDescription>
            All data is encrypted locally before hitting storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GoalForm
            onSubmit={async (params) => {
              await createGoal(params);
              await refresh();
            }}
          />
          {(mutationError || error) && (
            <p className="text-sm text-red-400">{mutationError || error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your goals</CardTitle>
            <CardDescription>
              Reacts to LiveStore commits; keeps projections current without
              reload.
            </CardDescription>
          </div>
          {loading && <span className="text-sm text-slate-400">Loading…</span>}
        </CardHeader>
        <CardContent>
          {sortedGoals.length === 0 && !loading ? (
            <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-slate-400">
              No goals yet. Start by creating one.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {sortedGoals.map((goal) => (
              <div
                key={goal.id}
                className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 shadow-inner"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{goal.slice}</Badge>
                    <Badge>{goal.priority}</Badge>
                  </div>
                  <span className="text-xs text-slate-500">
                    {goal.targetMonth}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-white">{goal.summary}</div>
                  <div className="text-[11px] text-slate-500">{goal.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingId(goal.id);
                      setEditValues({
                        summary: goal.summary,
                        slice: goal.slice as SliceValue,
                        priority: goal.priority as GoalFormValues['priority'],
                        targetMonth: goal.targetMonth,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      setDeletingId(goal.id);
                      try {
                        await deleteGoal(goal.id);
                        await refresh();
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    disabled={mutating && deletingId === goal.id}
                  >
                    {mutating && deletingId === goal.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {editingId === goal.id && (
                  <form
                    className="mt-3 grid gap-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await saveEdit();
                    }}
                  >
                    <div className="space-y-1">
                      <Label>Summary</Label>
                      <Input
                        value={editValues.summary}
                        onChange={(ev) =>
                          setEditValues((prev) => ({
                            ...prev,
                            summary: ev.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Slice</Label>
                        <Select
                          value={editValues.slice}
                          onValueChange={(val) =>
                            setEditValues((prev) => ({
                              ...prev,
                              slice: val as SliceValue,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose slice" />
                          </SelectTrigger>
                          <SelectContent>
                            {sliceOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Priority</Label>
                        <Select
                          value={editValues.priority}
                          onValueChange={(val) =>
                            setEditValues((prev) => ({
                              ...prev,
                              priority: val as GoalFormValues['priority'],
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent>
                            {priorityOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Target month</Label>
                        <Input
                          type="month"
                          value={editValues.targetMonth}
                          onChange={(ev) =>
                            setEditValues((prev) => ({
                              ...prev,
                              targetMonth: ev.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="submit" size="sm" disabled={mutating}>
                        <Check className="mr-1 h-4 w-4" />
                        {mutating ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {backupOpen && (
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
              <Button variant="ghost" onClick={() => setBackupOpen(false)}>
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
      )}
    </div>
  );
}

export default function App() {
  const { session } = useApp();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 bg-panel/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent2 text-slate-950 font-bold">
              MO
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500">
                MO Local
              </div>
              <div className="text-sm text-slate-200">
                Offline POC · LiveStore/OPFS
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Sparkles className="h-4 w-4 text-accent2" />
            Zero-knowledge, local-first
          </div>
        </div>
      </header>
      {session.status === 'loading' && (
        <div className="mx-auto max-w-5xl px-4 py-10">
          <Card>
            <CardContent className="flex items-center gap-3 text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin text-accent2" />
              Loading identity…
            </CardContent>
          </Card>
        </div>
      )}
      {session.status === 'needs-onboarding' && <Onboarding />}
      {session.status === 'locked' && <Unlock />}
      {session.status === 'ready' && <GoalDashboard />}
    </div>
  );
}
