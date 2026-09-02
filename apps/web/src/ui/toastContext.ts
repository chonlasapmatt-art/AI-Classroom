import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message?: string;
  tone?: ToastTone;
  duration?: number;
}

export interface ToastContextValue {
  toast: (title: string, options?: ToastOptions) => void;
}

// The context and the hook live apart from the provider so that `components.tsx` exports components
// and nothing else. A module that mixes the two loses fast refresh: editing a component in it
// remounts the tree instead of swapping the component, which throws away whatever state the screen
// was holding.
export const ToastContext = createContext<ToastContextValue | null>(null);

/** Raises a toast from anywhere inside a `ToastProvider`. */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used within a ToastProvider');
  return value;
}
