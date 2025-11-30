import { useEffect, useState } from 'react';
import { GoalListItem } from '../../services/GoalQueries';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Check, RefreshCw, Trash2 } from 'lucide-react';
import {
  GoalFormValues,
  priorityOptions,
  sliceOptions,
} from './goalFormTypes';

type GoalCardProps = {
  goal: GoalListItem;
  onSave: (changes: Partial<GoalFormValues>) => Promise<void>;
  onDelete: () => Promise<void>;
  isUpdating: boolean;
  isDeleting: boolean;
};

const toFormValues = (goal: GoalListItem): GoalFormValues => ({
  summary: goal.summary,
  slice: goal.slice as GoalFormValues['slice'],
  priority: goal.priority as GoalFormValues['priority'],
  targetMonth: goal.targetMonth,
});

export function GoalCard({
  goal,
  onSave,
  onDelete,
  isUpdating,
  isDeleting,
}: GoalCardProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<GoalFormValues>(toFormValues(goal));

  useEffect(() => {
    setValues(toFormValues(goal));
  }, [goal]);

  const saveChanges = async () => {
    const changes: Partial<GoalFormValues> = {};
    if (values.summary !== goal.summary) changes.summary = values.summary;
    if (values.slice !== goal.slice) changes.slice = values.slice;
    if (values.priority !== goal.priority) changes.priority = values.priority;
    if (values.targetMonth !== goal.targetMonth) {
      changes.targetMonth = values.targetMonth;
    }

    if (!Object.keys(changes).length) {
      setEditing(false);
      return;
    }

    await onSave(changes);
    setEditing(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 shadow-inner text-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{goal.slice}</Badge>
          <Badge>{goal.priority}</Badge>
        </div>
        <span className="text-xs text-slate-500">{goal.targetMonth}</span>
      </div>
      <div className="space-y-1">
        <div className="font-semibold text-slate-900 dark:text-white">
          {goal.summary}
        </div>
        <div className="text-[11px] text-slate-500">{goal.id}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing(true)}
          disabled={isUpdating}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await onDelete();
          }}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      {editing && (
        <form
          className="mt-3 grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await saveChanges();
          }}
        >
          <div className="space-y-1">
            <Label>Summary</Label>
            <Input
              value={values.summary}
              onChange={(ev) =>
                setValues((prev) => ({
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
                value={values.slice}
                onValueChange={(val) =>
                  setValues((prev) => ({
                    ...prev,
                    slice: val as GoalFormValues['slice'],
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
            <div className="space-y-1">
              <Label>Target month</Label>
              <Input
                type="month"
                value={values.targetMonth}
                onChange={(ev) =>
                  setValues((prev) => ({
                    ...prev,
                    targetMonth: ev.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isUpdating}>
              <Check className="mr-1 h-4 w-4" />
              {isUpdating ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
