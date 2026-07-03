import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import type { NotificationEvent } from "@/hooks/useNotificationBus";

export type Toast = NotificationEvent & {
  id: string;
};

type ToastContextValue = {
  toasts: Toast[];
  showToast: (event: NotificationEvent) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismissToast = useCallback((id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (event: NotificationEvent) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const toast: Toast = { ...event, id };
      setToasts((prev) => {
        if (prev.length >= 3) return [...prev.slice(1), toast];
        return [...prev, toast];
      });
      timers.current[id] = setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
