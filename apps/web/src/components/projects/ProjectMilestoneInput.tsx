import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export function ProjectMilestoneInput({
  onAdd,
  startDate,
  targetDate: projectTargetDate,
}: {
  onAdd: (milestone: { name: string; targetDate: string }) => Promise<void>;
  startDate: string;
  targetDate: string;
}) {
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !targetDate) {
      setError('Name and target date are required');
      return;
    }
    if (targetDate < startDate || targetDate > projectTargetDate) {
      setError('Milestone must be within project date range');
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({ name: name.trim(), targetDate });
      setName('');
      setTargetDate('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="grid gap-2" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          placeholder="Milestone name"
        />
      </div>
      <div className="space-y-1">
        <Label>Target date</Label>
        <Input
          type="date"
          value={targetDate}
          onChange={(ev) => setTargetDate(ev.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add milestone'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
