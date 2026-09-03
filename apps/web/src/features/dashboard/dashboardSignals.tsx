// The four things the home screen has to answer that the rest of it did not.
//
// The dashboard already showed what is due and who is behind. What it never said was whether
// anything had gone wrong, whether the school had announced something, what had just happened, and
// whether this device's work had actually left the building. Each of those is a question people were
// answering by opening a different screen and guessing.
//
// The reasoning lives in `dashboardData.ts`; these are only the shapes it is drawn in.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, CardHeader, EmptyState } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import type { AcademicAuditEntry, Announcement } from '../../domain/types';
import type { SyncStatus } from '../../sync/useBackgroundSync';
import { auditLabels, auditTone, lastSyncedLabel, type DashboardAlert, type QuickAction } from './dashboardData';

export function AlertStack({ alerts }: { alerts: DashboardAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section className="dashboard-alerts" aria-label="สิ่งที่ต้องจัดการ">
      {alerts.map((alert) => (
        <article key={alert.id} className={`dashboard-alert dashboard-alert-${alert.tone}`}>
          <span className="dashboard-alert-icon" aria-hidden="true">
            <Icon name={alert.tone === 'info' ? 'sync' : 'warning'} size={18} />
          </span>
          <div>
            <strong>{alert.title}</strong>
            <span>{alert.detail}</span>
          </div>
          {alert.to && <Link className="dashboard-alert-action" to={alert.to}>{alert.actionLabel ?? 'เปิด'}</Link>}
        </article>
      ))}
    </section>
  );
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <section className="quick-actions" aria-label="ทางลัดที่ใช้บ่อย">
      {actions.map((action) => (
        <Link key={action.to + action.label} to={action.to} className="quick-action">
          <span className="quick-action-icon" aria-hidden="true"><Icon name={action.icon} size={20} /></span>
          <span className="quick-action-copy">
            <strong>{action.label}</strong>
            <span>{action.hint}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

export function AnnouncementCard({ announcements, action }: { announcements: Announcement[]; action?: ReactNode }) {
  return (
    <Card>
      <CardHeader title="ประกาศล่าสุด" description="ข่าวสารจากโรงเรียนและครูประจำวิชา" action={action} />
      {announcements.length === 0 ? (
        <EmptyState
          icon={<Icon name="announcements" size={28} />}
          title="ยังไม่มีประกาศใหม่"
          description="เมื่อโรงเรียนหรือคุณครูประกาศอะไร จะขึ้นที่นี่"
        />
      ) : (
        <ul className="announcement-list">
          {announcements.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ActivityCard({ entries, resolveName }: {
  entries: AcademicAuditEntry[];
  resolveName: (profileId: string) => string;
}) {
  return (
    <Card>
      <CardHeader title="ความเคลื่อนไหวล่าสุด" description="การเปลี่ยนแปลงด้านคะแนนและงานที่ถูกบันทึกไว้" />
      {entries.length === 0 ? (
        <EmptyState
          icon={<Icon name="operations" size={28} />}
          title="ยังไม่มีความเคลื่อนไหว"
          description="เมื่อมีการบันทึกคะแนนหรือเผยแพร่งาน รายการจะขึ้นที่นี่"
        />
      ) : (
        <ol className="activity-timeline">
          {entries.map((entry) => (
            <li key={entry.id}>
              {/* The dot is a second channel, not the message: the action is always spelled out. */}
              <span className={`activity-dot activity-dot-${auditTone[entry.action]}`} aria-hidden="true" />
              <div>
                <strong>{auditLabels[entry.action]}</strong>
                <span>
                  {resolveName(entry.actorProfileId)}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </span>
              </div>
              <time dateTime={entry.occurredAt}>
                {new Date(entry.occurredAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function SyncLine({ sync, pending }: { sync: SyncStatus | null; pending: number }) {
  // Preview Mode has no server to agree with, so there is nothing honest to report.
  if (!sync) return null;
  return (
    <p className="dashboard-sync-line" role="status" aria-live="polite">
      <Icon name="sync" size={14} />
      <span>ซิงก์ล่าสุด: {lastSyncedLabel(sync.lastSyncedAt)}</span>
      {pending > 0 && <Badge tone="info">รอซิงก์ {pending}</Badge>}
    </p>
  );
}
