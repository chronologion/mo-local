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
  const [step, setStep] = useState<'password' | 'backup'>('password');
  const [phrase, setPhrase] = useState<string[]>([]);
  const [challenge, setChallenge] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const generatePhrase = () => {
    const words = [
      'anchor',
      'beacon',
      'canyon',
      'daring',
      'ember',
      'fabric',
      'galaxy',
      'harbor',
      'island',
      'jungle',
      'kernel',
      'lantern',
      'meadow',
      'nectar',
      'opal',
      'prairie',
      'quartz',
      'ripple',
      'signal',
      'timber',
      'uplift',
      'valor',
      'willow',
      'zenith',
    ];
    const chosen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const idx = Math.floor(Math.random() * words.length);
      chosen.push(words[idx]);
    }
    return chosen;
  };

  const handleSubmitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const generated = generatePhrase();
    const picks = [
      Math.floor(Math.random() * generated.length),
      Math.floor(Math.random() * generated.length),
      Math.floor(Math.random() * generated.length),
    ];
    setPhrase(generated);
    setChallenge(picks);
    setStep('backup');
    setError(null);
  };

  const handleSubmitBackup = async (event: FormEvent) => {
    event.preventDefault();
    const mismatched = challenge.some(
      (idx) => (answers[idx] ?? '').trim().toLowerCase() !== phrase[idx]
    );
    if (mismatched) {
      setError('Recovery words do not match. Please retype them.');
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
        {step === 'password' && (
          <>
            <h2>Welcome to MO Local</h2>
            <p className="muted">
              Offline-first workspace. We create an identity locally and keep
              keys on this device only. No sync or sharing yet.
            </p>
            <form className="form-grid" onSubmit={handleSubmitPassword}>
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
                  Next: backup keys
                </button>
                {error && <span className="danger">{error}</span>}
              </div>
            </form>
          </>
        )}
        {step === 'backup' && (
          <>
            <h2>Backup your recovery phrase</h2>
            <p className="muted">
              Write these 12 words down. If you lose them, you lose access to
              your data. We never send keys to a server.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                background: '#0b1221',
                padding: 12,
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 13,
              }}
            >
              {phrase.map((word, idx) => (
                <div key={idx}>
                  {idx + 1}. {word}
                </div>
              ))}
            </div>
            <form className="form-grid" onSubmit={handleSubmitBackup}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Confirm selected words</label>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {challenge.map((idx) => (
                    <input
                      key={idx}
                      className="input"
                      style={{ width: 120 }}
                      placeholder={`Word ${idx + 1}`}
                      value={answers[idx] ?? ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [idx]: e.target.value,
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12 }}>
                <button className="button" type="submit" disabled={loading}>
                  {loading ? 'Creating keys…' : 'Finish onboarding'}
                </button>
                <button
                  className="button"
                  type="button"
                  style={{ background: 'transparent', color: '#e2e8f0' }}
                  onClick={() => setStep('password')}
                >
                  Back
                </button>
                {error && <span className="danger">{error}</span>}
              </div>
            </form>
          </>
        )}
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
    updateGoal,
    loading: mutating,
    error: mutationError,
  } = useGoalCommands();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [editSlice, setEditSlice] = useState<SliceValue>('Health');
  const [editPriority, setEditPriority] = useState<'must' | 'should' | 'maybe'>(
    'must'
  );
  const [editTargetMonth, setEditTargetMonth] = useState('');

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
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="button"
                    style={{ background: 'transparent', color: '#e2e8f0' }}
                    onClick={() => {
                      setEditingId(goal.id);
                      setEditSummary(goal.summary);
                      setEditSlice(goal.slice as SliceValue);
                      setEditPriority(
                        goal.priority as 'must' | 'should' | 'maybe'
                      );
                      setEditTargetMonth(goal.targetMonth);
                    }}
                  >
                    Edit
                  </button>
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
                    {mutating && deletingId === goal.id
                      ? 'Deleting…'
                      : 'Delete'}
                  </button>
                </div>
              </div>
              {editingId === goal.id && (
                <form
                  className="form-grid"
                  style={{
                    marginTop: 12,
                    borderTop: '1px solid #2d3748',
                    paddingTop: 12,
                  }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await updateGoal({
                      goalId: goal.id,
                      summary: editSummary,
                      slice: editSlice,
                      priority: editPriority,
                      targetMonth: editTargetMonth,
                    });
                    await refresh();
                    setEditingId(null);
                  }}
                >
                  <div className="field">
                    <label>Summary</label>
                    <input
                      className="input"
                      value={editSummary}
                      onChange={(ev) => setEditSummary(ev.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Slice</label>
                    <select
                      className="input"
                      value={editSlice}
                      onChange={(ev) =>
                        setEditSlice(ev.target.value as SliceValue)
                      }
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
                      value={editPriority}
                      onChange={(ev) =>
                        setEditPriority(
                          ev.target.value as 'must' | 'should' | 'maybe'
                        )
                      }
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
                      value={editTargetMonth}
                      onChange={(ev) => setEditTargetMonth(ev.target.value)}
                    />
                  </div>
                  <div
                    style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}
                  >
                    <button
                      className="button"
                      type="submit"
                      disabled={mutating}
                    >
                      {mutating ? 'Saving…' : 'Save changes'}
                    </button>
                    <button
                      className="button"
                      type="button"
                      style={{ background: 'transparent', color: '#e2e8f0' }}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
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
