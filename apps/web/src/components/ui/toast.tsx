import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { cn } from '../../lib/utils';

type Toast = {
  id: string;
  title?: string;
  description?: string;
};

type ToastContextValue = {
  toast: (input: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((input: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => {
      const duplicate = prev.find(
        (t) => t.title === input.title && t.description === input.description
      );
      if (duplicate) return prev;
      return [...prev, { id, ...input }];
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto rounded-lg border border-border bg-popover p-3 shadow-md',
              'animate-in slide-in-from-top-2 fade-in-0'
            )}
          >
            {item.title ? (
              <div className="text-sm font-semibold text-foreground">
                {item.title}
              </div>
            ) : null}
            {item.description ? (
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('ToastProvider missing');
  return ctx.toast;
}
