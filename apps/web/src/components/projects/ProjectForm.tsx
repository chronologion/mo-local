import { useState } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { GoalListItemDto } from '@mo/application';
import { DatePicker } from '../ui/date-picker';

export type ProjectFormValues = {
  name: string;
  startDate: string;
  targetDate: string;
  description: string;
  goalId: string | null;
};

type ProjectFormProps = {
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  goals: GoalListItemDto[];
  initialValues?: ProjectFormValues;
  submitLabel?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ProjectForm({ onSubmit, goals, initialValues, submitLabel = 'Create Project' }: ProjectFormProps) {
  const [values, setValues] = useState<ProjectFormValues>(
    initialValues ?? {
      name: '',
      startDate: today(),
      targetDate: today(),
      description: '',
      goalId: null,
    }
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(values);
      if (!initialValues) {
        setValues({
          name: '',
          startDate: today(),
          targetDate: today(),
          description: '',
          goalId: null,
        });
      }
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
          onChange={(ev) => setValues((prev) => ({ ...prev, name: ev.target.value }))}
          required
          placeholder="Project name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Start date</Label>
          <DatePicker
            value={values.startDate}
            onChange={(next) => setValues((prev) => ({ ...prev, startDate: next }))}
            max={values.targetDate}
          />
        </div>
        <div className="space-y-1">
          <Label>Target date</Label>
          <DatePicker
            value={values.targetDate}
            onChange={(next) => setValues((prev) => ({ ...prev, targetDate: next }))}
            min={values.startDate}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea
          value={values.description}
          onChange={(ev) => setValues((prev) => ({ ...prev, description: ev.target.value }))}
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
        {submitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
