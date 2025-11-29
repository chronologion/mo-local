import { FormEvent, useMemo, useState } from 'react';
import { SliceValue } from '@mo/domain';
import { useApp } from './providers/AppProvider';
import { useGoals } from './hooks/useGoals';
import { useGoalCommands } from './hooks/useGoalCommands';

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

function Onboarding() {
  const { completeOnboarding } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
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
    <div className="content">
      <div className="panel">
        <h2>Welcome to MO Local</h2>
        <p className="muted">
          Offline-first workspace. We create an identity locally and keep keys
          on this device only. No sync or sharing yet.
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field">
            <label>Password (for deriving K_pwd)</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Create a password"
            />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              placeholder="Repeat password"
            />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12 }}>
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Creating keys…' : 'Start offline'}
            </button>
            {error && <span className="danger">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

function GoalForm({
  onSubmit,
}: {
  onSubmit: (params: {
    summary: string;
    slice: SliceValue;
    priority: 'must' | 'should' | 'maybe';
    targetMonth: string;
  }) => Promise<void>;
}) {
  const [summary, setSummary] = useState('');
  const [slice, setSlice] = useState<SliceValue>('Health');
  const [priority, setPriority] = useState<'must' | 'should' | 'maybe'>('must');
  const [targetMonth, setTargetMonth] = useState(() => {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    return m;
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit({ summary, slice, priority, targetMonth });
    setSummary('');
  };

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label>Summary</label>
        <input
          className="input"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          placeholder="Define a concrete goal"
        />
      </div>
      <div className="field">
        <label>Slice</label>
        <select
          className="input"
          value={slice}
          onChange={(e) => setSlice(e.target.value as SliceValue)}
        >
          {sliceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Priority</label>
        <select
          className="input"
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
        >
          {priorityOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Target month</label>
        <input
          className="input"
          type="month"
          value={targetMonth}
          onChange={(e) => setTargetMonth(e.target.value)}
        />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <button className="button" type="submit">
          Create goal
        </button>
      </div>
    </form>
  );
}

function GoalDashboard() {
  const { session } = useApp();
  const { goals, loading, error, refresh } = useGoals();
  const {
    createGoal,
    deleteGoal,
    loading: mutating,
    error: mutationError,
  } = useGoalCommands();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => a.targetMonth.localeCompare(b.targetMonth)),
    [goals]
  );

  return (
    <div className="content">
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Goals (offline)</h2>
            <p className="muted" style={{ margin: 0 }}>
              User: {session.status === 'ready' ? session.userId : '—'}
            </p>
          </div>
          <button className="button" onClick={refresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>New goal</h3>
        <GoalForm
          onSubmit={async (params) => {
            await createGoal(params);
            await refresh();
          }}
        />
        {(mutationError || error) && (
          <p className="danger" style={{ marginTop: 10 }}>
            {mutationError || error}
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Your goals</h3>
          {loading && <span className="muted">Loading…</span>}
        </div>
        {sortedGoals.length === 0 && !loading && (
          <p className="muted">No goals yet. Start by creating one.</p>
        )}
        <div className="goal-list">
          {sortedGoals.map((goal) => (
            <div key={goal.id} className="goal-card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{goal.summary}</strong>
                <span className="tag">{goal.priority}</span>
              </div>
              <div className="row">
                <span className="tag">Slice: {goal.slice}</span>
                <span className="tag">Target: {goal.targetMonth}</span>
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <small className="muted">{goal.id}</small>
                <button
                  className="button"
                  style={{ background: 'transparent', color: '#e2e8f0' }}
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
                  {mutating && deletingId === goal.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { session } = useApp();

  return (
    <div className="app-shell">
      <header className="header">
        <div className="title">MO Local · Offline POC</div>
        <div className="muted" style={{ fontSize: 12 }}>
          No sync/sharing yet. Data stored locally.
        </div>
      </header>
      {session.status === 'loading' && (
        <div className="content">
          <div className="panel">
            <p className="muted">Loading identity…</p>
          </div>
        </div>
      )}
      {session.status === 'needs-onboarding' && <Onboarding />}
      {session.status === 'ready' && <GoalDashboard />}
    </div>
  );
}
