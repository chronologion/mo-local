import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '../../lib/utils';

const MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});

const MONTH_LABELS = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString(undefined, { month: 'short' })
);

const parseYear = (value: string | undefined): number => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return new Date().getFullYear();
  }
  return Number.parseInt(value.slice(0, 4), 10);
};

const formatMonthLabel = (value: string | undefined): string => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return 'Select month';
  }
  const [year, month] = value
    .split('-')
    .map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(year) || Number.isNaN(month)) {
    return 'Select month';
  }
  const date = new Date(year, month - 1, 1);
  return MONTH_FORMATTER.format(date);
};

export interface MonthPickerProps {
  value?: string;
  onChange: (nextValue: string) => void;
  inputId?: string;
  className?: string;
}

export function MonthPicker({
  value,
  onChange,
  inputId,
  className,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(() => parseYear(value));
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDisplayYear(parseYear(value));
  }, [value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const months = useMemo(
    () =>
      MONTH_LABELS.map((label, index) => {
        const monthNumber = (index + 1).toString().padStart(2, '0');
        const monthValue = `${displayYear}-${monthNumber}`;
        return { label, value: monthValue };
      }),
    [displayYear]
  );

  const handleSelect = (monthValue: string) => {
    onChange(monthValue);
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        id={inputId}
        variant="outline"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'w-full justify-start gap-2',
          !value && 'text-muted-foreground',
          className
        )}
      >
        <CalendarIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>{formatMonthLabel(value)}</span>
      </Button>
      {open ? (
        <div className="absolute z-[130] mt-2 w-[280px] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-md">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDisplayYear((prev) => prev - 1)}
              aria-label="Previous year"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold">{displayYear}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDisplayYear((prev) => prev + 1)}
              aria-label="Next year"
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {months.map((month) => (
              <Button
                key={month.value}
                type="button"
                variant={month.value === value ? 'default' : 'outline'}
                onClick={() => handleSelect(month.value)}
                className="w-full text-sm"
              >
                {month.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MonthPicker;
