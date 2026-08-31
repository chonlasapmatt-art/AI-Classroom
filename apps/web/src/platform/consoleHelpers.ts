// Small pieces the console screens share.
//
// They live apart from the screens for a mundane reason: a module that exports both components and
// plain functions loses fast refresh during development, and an operations console is exactly the
// kind of thing that gets edited while it is open on a live incident.

import { useCallback, useState } from 'react';

export function formatMoment(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export interface DangerousAction {
  /** What the operator is about to do, in a sentence they can check before agreeing to it. */
  summary: string;
  /** Shown above the reason box: what will happen, stated plainly and without softening. */
  consequence: string;
  confirmLabel: string;
  minimumReasonLength?: number;
  run(reason: string): Promise<void>;
}

/** Holds the one action waiting on a password and a reason. */
export function useDangerousAction() {
  const [pending, setPending] = useState<DangerousAction | null>(null);
  const request = useCallback((action: DangerousAction) => setPending(action), []);
  const dismiss = useCallback(() => setPending(null), []);
  return { pending, request, dismiss };
}
