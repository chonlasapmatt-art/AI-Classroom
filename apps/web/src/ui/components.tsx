import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * The shared building blocks every screen is made of.
 *
 * Pages compose these instead of styling themselves, which is what keeps spacing, radius, colour and
 * touch-target sizes identical across the app — including on a classroom board where every control
 * has to stay comfortably tappable.
 */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`ui-button ui-button-${variant} ui-size-${size} ${className}`.trim()}
    >
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'secondary', size = 'md', children }: {
  to: string; variant?: ButtonVariant; size?: ControlSize; children: ReactNode;
}) {
  return <Link className={`ui-button ui-button-${variant} ui-size-${size}`} to={to}>{children}</Link>;
}

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...rest} aria-label={label} className="ui-icon-button">{children}</button>;
}

export function Card({ children, className = '', as: Element = 'section', padded = true }: {
  children: ReactNode; className?: string; as?: 'section' | 'article' | 'div'; padded?: boolean;
}) {
  return <Element className={`ui-card ${padded ? 'ui-card-padded' : ''} ${className}`.trim()}>{children}</Element>;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="ui-card-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="ui-page-actions">{action}</div>}
    </header>
  );
}

export function Badge({ tone = 'neutral', children, subtle = true }: { tone?: Tone; children: ReactNode; subtle?: boolean }) {
  return <span className={`ui-badge ui-badge-${tone} ${subtle ? '' : 'ui-badge-solid'}`.trim()}>{children}</span>;
}

export function Stat({ label, value, hint, tone = 'brand' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <article className={`ui-stat ui-stat-${tone}`}>
      <span className="ui-stat-label">{label}</span>
      <strong className="ui-stat-value">{value}</strong>
      {hint && <span className="ui-stat-hint">{hint}</span>}
    </article>
  );
}

export function EmptyState({ icon = '✦', title, description, action }: {
  icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ui-empty ui-empty-error" role="alert">
      <span className="ui-empty-icon" aria-hidden="true">!</span>
      <h3>ไม่สามารถโหลดข้อมูลได้</h3>
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>ลองใหม่</Button>}
    </div>
  );
}

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`ui-skeleton ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${100 - index * 12}%` }} />)}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <label className={`ui-field ${error ? 'ui-field-error' : ''}`.trim()}>
      <span className="ui-field-label">{label}</span>
      {children}
      {hint && !error && <span className="ui-field-hint">{hint}</span>}
      {error && <span className="ui-field-message">{error}</span>}
    </label>
  );
}

export function FieldGroup({ title, children, columns = 2 }: { title?: ReactNode; children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <fieldset className="ui-fieldset">
      {title && <legend>{title}</legend>}
      <div className={`ui-field-grid ui-columns-${columns}`}>{children}</div>
    </fieldset>
  );
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>; value: T; onChange: (next: T) => void; ariaLabel: string;
}) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, description, onClose, children, actions, wide }: {
  title: ReactNode; description?: ReactNode; onClose(): void; children?: ReactNode; actions?: ReactNode; wide?: boolean;
}) {
  return (
    <div
      className="ui-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
    >
      <section className={`ui-modal ${wide ? 'ui-modal-wide' : ''}`.trim()}>
        <header className="ui-modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="ปิด" onClick={onClose}>×</IconButton>
        </header>
        {children && <div className="ui-modal-body">{children}</div>}
        {actions && <footer className="ui-modal-actions">{actions}</footer>}
      </section>
    </div>
  );
}

export function ProgressBar({ value, max, tone = 'brand', label }: { value: number; max: number; tone?: Tone; label?: ReactNode }) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="ui-progress">
      <div
        className={`ui-progress-track ui-progress-${tone}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {label && <span className="ui-progress-label">{label}</span>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="ui-toolbar">{children}</div>;
}

export function DataTable({ head, children, caption }: { head: ReactNode; children: ReactNode; caption?: string }) {
  return (
    <div className="ui-table-scroll">
      <table className="ui-table">
        {caption && <caption className="ui-visually-hidden">{caption}</caption>}
        <thead>{head}</thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Confirmation dialog for destructive or important actions. */
export function ConfirmDialog({ title, description, confirmLabel = 'ยืนยัน', cancelLabel = 'ยกเลิก', tone = 'danger', onConfirm, onCancel }: {
  title: ReactNode; description?: ReactNode; confirmLabel?: string; cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'brand'; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      description={description}
      onClose={onCancel}
      actions={<>        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </>}
    />
  );
}

/** Tooltip wrapper that shows hint text on hover or focus. */
export function Tooltip({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  return (
    <span className="ui-tooltip-wrap" title={typeof tip === 'string' ? tip : undefined}>
      {children}
      {typeof tip !== 'string' && <span className="ui-tooltip-bubble" role="tooltip">{tip}</span>}
    </span>
  );
}

/* ---------- Toast / Snackbar ---------- */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  duration: number;
}

interface ToastContextValue {
  toast: (title: string, opts?: { message?: string; tone?: ToastTone; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, duration: 0 } : t)));
  }, []);

  const toast = useCallback(
    (title: string, opts?: { message?: string; tone?: ToastTone; duration?: number }) => {
      const id = ++toastId;
      setItems((prev) => [...prev, { id, title, ...(opts?.message != null ? { message: opts.message } : {}), tone: opts?.tone ?? 'info', duration: opts?.duration ?? 4000 }]);
    },
    [],
  );

  const ctx = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="ui-toast-container" aria-live="polite" aria-relevant="additions removals">
        {items.map((item) => (
          <ToastItemView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [exiting, setExiting] = useState(false);
  const ref = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (item.duration <= 0) {
      setExiting(true);
      const t = setTimeout(() => onDismiss(item.id), 200);
      return () => clearTimeout(t);
    }
    ref.current = setTimeout(() => setExiting(true), item.duration);
    return () => { if (ref.current) clearTimeout(ref.current); };
  }, [item.duration, item.id, onDismiss]);

  const icons: Record<ToastTone, string> = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };

  return (
    <div className={`ui-toast ui-toast-${item.tone} ${exiting ? 'ui-toast-exiting' : ''}`} role="status">
      <span className="ui-toast-icon" aria-hidden="true">{icons[item.tone]}</span>
      <div className="ui-toast-content">
        <div className="ui-toast-title">{item.title}</div>
        {item.message && <div className="ui-toast-message">{item.message}</div>}
      </div>
      <button className="ui-toast-close" aria-label="ปิด" onClick={() => onDismiss(item.id)}>×</button>
    </div>
  );
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ options, value, onChange, ariaLabel }: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>; value: T; onChange: (next: T) => void; ariaLabel: string;
}) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Drawer / Slide-over ---------- */

export function Drawer({ title, onClose, children, footer }: {
  title: ReactNode; onClose(): void; children?: ReactNode; footer?: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="ui-drawer-backdrop" ref={backdropRef} onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} />
      <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="ui-drawer-header">
          <h2>{title}</h2>
          <IconButton label="ปิด" onClick={onClose}>×</IconButton>
        </header>
        {children && <div className="ui-drawer-body">{children}</div>}
        {footer && <footer className="ui-drawer-footer">{footer}</footer>}
      </aside>
    </>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }
  return (
    <nav className="ui-pagination" aria-label="หน้า">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="ก่อนหน้า">‹</button>
      {pages.map((p, idx) =>
        p === '...' ? (
          <span key={`e${idx}`} className="ui-pagination-info">…</span>
        ) : (
          <button key={p} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>{p}</button>
        )
      )}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="ถัดไป">›</button>
    </nav>
  );
}

/* ---------- Search input ---------- */

export function SearchInput({ value, onChange, placeholder = 'ค้นหา...', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`ui-search ${className}`.trim()}>
      <span className="ui-search-icon" aria-hidden="true">🔍</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
