import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { GoalListItem } from '@mo/infrastructure/browser';

export type ProjectFormValues = {
  name: string;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
};

type ProjectFormProps = {
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  goals: GoalListItem[];
};

const today = () => new Date().toISOString().slice(0, 10);

export function ProjectForm({ onSubmit, goals }: ProjectFormProps) {
  const [values, setValues] = useState<ProjectFormValues>({
    name: '',
    startDate: today(),
    targetDate: today(),
    description: '',
    goalId: null,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(values);
      setValues({
        name: '',
        startDate: today(),
        targetDate: today(),
        description: '',
        goalId: null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input
          value={values.name}
          onChange={(ev) =>
            setValues((prev) => ({ ...prev, name: ev.target.value }))
          }
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Start Date</Label>
          <Input
            type="date"
            value={values.startDate}
            onChange={(ev) =>
              setValues((prev) => ({ ...prev, startDate: ev.target.value }))
            }
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Target Date</Label>
          <Input
            type="date"
            value={values.targetDate}
            onChange={(ev) =>
              setValues((prev) => ({ ...prev, targetDate: ev.target.value }))
            }
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea
          value={values.description}
          onChange={(ev) =>
            setValues((prev) => ({ ...prev, description: ev.target.value }))
          }
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label>Linked Goal (optional)</Label>
        <Select
          value={values.goalId ?? 'none'}
          onValueChange={(value) =>
            setValues((prev) => ({
              ...prev,
              goalId: value === 'none' ? null : value,
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select goal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No goal</SelectItem>
            {goals.map((goal) => (
              <SelectItem key={goal.id} value={goal.id}>
                {goal.summary}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Creating…' : 'Create Project'}
      </Button>
    </form>
  );
}
