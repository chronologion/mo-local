import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { cn } from '../../lib/utils';

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

type DayCell = {
  key: string;
  label: number | null;
  date?: string;
  disabled?: boolean;
};

const toISO = (date: Date) => date.toISOString().slice(0, 10);

const parseValue = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isWithinRange = (iso: string, min?: string, max?: string) => {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
};

export type DatePickerProps = {
  value: string;
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  placeholder?: string;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  className,
  placeholder = 'Select date',
}: DatePickerProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeMonth, setActiveMonth] = useState(() => {
    const parsed = parseValue(value);
    const base = parsed ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    const parsed = parseValue(value);
    if (parsed) {
      setActiveMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }, [value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const label = useMemo(() => {
    if (!value) return placeholder;
    const parsed = parseValue(value);
    if (!parsed) return placeholder;
    return DATE_FORMATTER.format(parsed);
  }, [value, placeholder]);

  const days: DayCell[] = useMemo(() => {
    const monthStart = new Date(
      activeMonth.getFullYear(),
      activeMonth.getMonth(),
      1
    );
    const startWeekday = monthStart.getDay(); // 0 sun
    const daysInMonth = new Date(
      activeMonth.getFullYear(),
      activeMonth.getMonth() + 1,
      0
    ).getDate();
    const cells: DayCell[] = [];
    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ key: `blank-${i}`, label: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(
        activeMonth.getFullYear(),
        activeMonth.getMonth(),
        day
      );
      const iso = toISO(date);
      cells.push({
        key: iso,
        label: day,
        date: iso,
        disabled: !isWithinRange(iso, min, max),
      });
    }
    return cells;
  }, [activeMonth, min, max]);

  const goMonth = (delta: number) => {
    setActiveMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );
  };

  const handleMonthChange = (next: string) => {
    const monthIndex = Number.parseInt(next, 10);
    if (Number.isNaN(monthIndex)) return;
    setActiveMonth(
      (prev) => new Date(prev.getFullYear(), monthIndex, prev.getDate())
    );
  };

  const handleYearChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(event.target.value, 10);
    if (Number.isNaN(value)) return;
    setActiveMonth((prev) => new Date(value, prev.getMonth(), 1));
  };

  return (
    <div className="relative" ref={anchorRef}>
      <Button
        id={id}
        type="button"
        variant="outline"
        className={cn(
          'w-full justify-start gap-2 text-left font-normal',
          !value && 'text-muted-foreground',
          className
        )}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CalendarIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </Button>
      {open ? (
        <div className="absolute z-[160] mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select
              value={String(activeMonth.getMonth())}
              onValueChange={handleMonthChange}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {new Date(2000, idx, 1).toLocaleString(undefined, {
                      month: 'long',
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="w-20"
              value={activeMonth.getFullYear()}
              onChange={handleYearChange}
            />
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-sm">
            {days.map((day) =>
              day.label ? (
                <Button
                  key={day.key}
                  type="button"
                  variant={day.date === value ? 'default' : 'ghost'}
                  disabled={day.disabled}
                  className={cn(
                    'h-9 w-full px-0 text-sm',
                    day.date === value && 'font-semibold'
                  )}
                  onClick={() => {
                    if (day.date) {
                      onChange(day.date);
                      setOpen(false);
                    }
                  }}
                >
                  {day.label}
                </Button>
              ) : (
                <div key={day.key} className="h-9" />
              )
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DatePicker;
