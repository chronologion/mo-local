import { useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { DatePicker } from '../ui/date-picker';
import { Archive, Pencil } from 'lucide-react';

type Milestone = {
  id: string;
  name: string;
  targetDate: string;
};

export function MilestonesList({
  milestones,
  onUpdate,
  onArchive,
  startDate,
  targetDate,
  disabled,
}: {
  milestones: Milestone[];
  onUpdate: (
    milestoneId: string,
    changes: { name?: string; targetDate?: string }
  ) => Promise<void>;
  onArchive: (milestoneId: string) => Promise<void>;
  startDate: string;
  targetDate: string;
  disabled?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; targetDate: string }>({
    name: '',
    targetDate: '',
  });
  const [error, setError] = useState<string | null>(null);

  const sorted = [...milestones].sort((a, b) =>
    a.targetDate.localeCompare(b.targetDate)
  );

  return (
    <div className="space-y-3">
      {milestones.length === 0 ? (
        <div className="text-xs text-muted-foreground">No milestones yet.</div>
      ) : (
        sorted.map((m) => {
          const isEditing = editingId === m.id;
          return (
            <div
              key={m.id}
              className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.name}
                </span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge variant="secondary">{m.targetDate}</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit milestone"
                    disabled={disabled}
                    onClick={() => {
                      setEditingId(m.id);
                      setDraft({ name: m.name, targetDate: m.targetDate });
                      setError(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label="Archive milestone"
                    disabled={disabled}
                    onClick={async () => {
                      await onArchive(m.id);
                    }}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isEditing && (
                <div className="grid gap-2 border-t border-border pt-2">
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input
                      value={draft.name}
                      onChange={(ev) =>
                        setDraft((prev) => ({ ...prev, name: ev.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Target date</Label>
                    <DatePicker
                      value={draft.targetDate}
                      onChange={(next) =>
                        setDraft((prev) => ({ ...prev, targetDate: next }))
                      }
                      min={startDate}
                      max={targetDate}
                      placeholder="Select milestone date"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        setError(null);
                        const changes: { name?: string; targetDate?: string } =
                          {};
                        if (draft.name !== m.name) {
                          changes.name = draft.name;
                        }
                        if (draft.targetDate !== m.targetDate) {
                          changes.targetDate = draft.targetDate;
                        }
                        if (!draft.targetDate) {
                          setError('Target date is required');
                          return;
                        }
                        if (draft.targetDate < startDate) {
                          setError('Milestone must be on/after project start');
                          return;
                        }
                        if (draft.targetDate > targetDate) {
                          setError(
                            'Milestone must be on/before project target'
                          );
                          return;
                        }
                        if (Object.keys(changes).length === 0) {
                          setEditingId(null);
                          return;
                        }
                        await onUpdate(m.id, changes);
                        setEditingId(null);
                      }}
                      disabled={disabled}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setError(null);
                      }}
                      disabled={disabled}
                    >
                      Cancel
                    </Button>
                  </div>
                  {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                  ) : null}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
