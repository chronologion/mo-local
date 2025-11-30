import { FormEvent, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  GoalFormValues,
  getDefaultTargetMonth,
  priorityOptions,
  sliceOptions,
} from './goalFormTypes';
import { Sparkles } from 'lucide-react';

type GoalFormProps = {
  onSubmit: (params: GoalFormValues) => Promise<void>;
};

export function GoalForm({ onSubmit }: GoalFormProps) {
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
