import { useEffect, useState, type ReactNode } from 'react';

/**
 * A premium boot experience shared by the customer app and Operations Center.
 *
 * Shows a branded splash with animated logo, progress bar, and smooth fade-out transition.
 * Respects prefers-reduced-motion and the data-motion="reduced" theme setting.
 */
export function BootSplash({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<'entering' | 'ready' | 'exiting'>('entering');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate a smooth loading progress
    const steps = [
      { delay: 100, value: 30 },
      { delay: 300, value: 60 },
      { delay: 500, value: 85 },
      { delay: 650, value: 100 },
    ];

    const timers = steps.map(({ delay, value }) =>
      window.setTimeout(() => setProgress(value), delay),
    );

    const readyTimer = window.setTimeout(() => setPhase('ready'), 700);
    const exitTimer = window.setTimeout(() => setPhase('exiting'), 850);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(readyTimer);
      window.clearTimeout(exitTimer);
    };
  }, []);

  return (
    <div className="app-root">
      {children}
      {phase !== 'exiting' && (
        <div className="app-boot" aria-hidden="true">
          <div className="app-boot-orbit app-boot-orbit-one" />
          <div className="app-boot-orbit app-boot-orbit-two" />
          <div className="app-boot-orbit app-boot-orbit-three" />
          <div className="app-boot-content">
            <div className="boot-logo-ring">
              <div className="boot-logo-inner">
                <div className="brand-mark boot-mark">SC</div>
              </div>
              <svg className="boot-progress-ring" viewBox="0 0 120 120">
                <circle className="boot-ring-bg" cx="60" cy="60" r="54" />
                <circle
                  className="boot-ring-fill"
                  cx="60"
                  cy="60"
                  r="54"
                  strokeDasharray={`${2 * Math.PI * 54}`}
                  strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress / 100)}`}
                />
              </svg>
            </div>
            <span className="boot-title">SMART CLASSROOM</span>
            <span className="boot-subtitle">ระบบห้องเรียนอัจฉริยะ</span>
            <div className="boot-progress-bar">
              <div className="boot-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
