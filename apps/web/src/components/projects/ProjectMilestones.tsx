import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useState } from 'react';

type Milestone = {
  id: string;
  name: string;
  targetDate: string;
};

export function MilestonesList({
  milestones,
  onUpdate,
  onDelete,
  disabled,
}: {
  milestones: Milestone[];
  onUpdate: (
    milestoneId: string,
    changes: { name?: string; targetDate?: string }
  ) => Promise<void>;
  onDelete: (milestoneId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; targetDate: string }>({
    name: '',
    targetDate: '',
  });

  return (
    <div className="space-y-3">
      {milestones.length === 0 ? (
        <div className="text-xs text-muted-foreground">No milestones yet.</div>
      ) : (
        milestones.map((m) => {
          const isEditing = editingId === m.id;
          return (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{m.targetDate}</Badge>
                  <span className="font-medium">{m.name}</span>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <button
                    className="underline"
                    disabled={disabled}
                    onClick={() => {
                      setEditingId(m.id);
                      setDraft({ name: m.name, targetDate: m.targetDate });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="underline text-destructive"
                    disabled={disabled}
                    onClick={async () => {
                      await onDelete(m.id);
                    }}
                  >
                    Delete
                  </button>
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
                    <Input
                      type="date"
                      value={draft.targetDate}
                      onChange={(ev) =>
                        setDraft((prev) => ({
                          ...prev,
                          targetDate: ev.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await onUpdate(m.id, {
                          name: draft.name,
                          targetDate: draft.targetDate,
                        });
                        setEditingId(null);
                      }}
                      disabled={disabled}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      disabled={disabled}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
