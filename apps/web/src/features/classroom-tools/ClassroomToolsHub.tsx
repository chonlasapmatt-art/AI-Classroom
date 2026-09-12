import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchoolSnapshot } from '../../data/RepositoryContext';
import { activeClasses, rosterFor } from '../../data/selectors';
import { useRememberedClass } from '../../app/useRememberedClass';
import { Badge, Button, Field, Modal } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { SpinWheelTool } from './SpinWheelTool';
import { GroupDrawTool } from './GroupDrawTool';
import { StarBoardTool } from './StarBoardTool';
import { QuizLaunchTool } from './QuizLaunchTool';
import {
  classroomTools, toolCategoryDescriptions, toolCategoryLabels, toolCategoryOrder, toolsInCategory,
  type ClassroomToolItem
} from './toolsRegistry';
import styles from './classroomTools.module.css';

/**
 * ศูนย์รวมกิจกรรมหน้าชั้นเรียน — the one door to everything a teacher runs in front of a class.
 *
 * ── Why a hub and not more menu entries ──
 * Each of these arrived as its own thing: a picker on the board, a team split beside it, a quiz
 * screen two sections away in the menu, points typed on a third screen. A teacher standing in front
 * of thirty people does not go looking through a menu; they press the one thing they came for. So
 * there is one entry, and behind it a grid grouped the way the activities actually differ.
 *
 * ── One room at a time ──
 * Every tool in here reads the roster of the class chosen at the top, and that class comes from the
 * snapshot the repository already scoped to this person: a teacher sees the rooms they teach and
 * nothing else, so the wheel cannot draw a name from somebody else's class. The choice is remembered
 * across screens, because it is the same room the register and the board are already on.
 *
 * ── Adding a game ──
 * A row in `toolsRegistry.ts`, and a case here if it opens over the hub. Nothing else in the app has
 * to learn that it exists.
 */
export function ClassroomToolsHub({ onClose, initialClassId }: {
  onClose(): void; initialClassId?: string;
}) {
  const snapshot = useSchoolSnapshot();
  const navigate = useNavigate();
  const classes = activeClasses(snapshot);
  const [classId, setClassId] = useRememberedClass(classes, initialClassId ?? null);
  const roster = useMemo(() => rosterFor(snapshot, classId), [snapshot, classId]);
  const [open, setOpen] = useState<ClassroomToolItem | null>(null);
  /* The module hashes its class names and the compiler cannot promise one exists, so it is read once. */
  const sectionClass = styles.section ?? '';

  function start(tool: ClassroomToolItem) {
    if (!tool.isReady) return;
    if (tool.actionType === 'route' && tool.route) {
      onClose();
      navigate(tool.route + (classId ? `?class=${encodeURIComponent(classId)}` : ''));
      return;
    }
    setOpen(tool);
  }

  if (open) {
    return (
      <Modal
        wide
        title={open.title}
        description={open.description}
        onClose={() => setOpen(null)}
        actions={<Button variant="ghost" onClick={() => setOpen(null)}>กลับไปหน้ารวมกิจกรรม</Button>}
      >
        {open.id === 'spin-wheel' && <SpinWheelTool roster={roster} className={sectionClass} />}
        {open.id === 'group-draw' && <GroupDrawTool roster={roster} className={sectionClass} />}
        {open.id === 'star-board' && (
          <StarBoardTool roster={roster} classId={classId} className={sectionClass} />
        )}
        {open.id === 'quiz-live' && <QuizLaunchTool className={sectionClass} />}
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title="เกมและกิจกรรมหน้าชั้นเรียน"
      description="เลือกเครื่องมือที่ต้องการเพื่อสร้างความสนุกสนานและการมีส่วนร่วมในห้องเรียน"
      onClose={onClose}
      actions={<Button variant="ghost" onClick={onClose}>ปิด</Button>}
    >
      <div className={styles.toolbar}>
        <Field label="ห้องเรียน" hint="กิจกรรมทุกอย่างในหน้านี้ใช้รายชื่อของห้องที่เลือก">
          <select value={classId} onChange={(event) => setClassId(event.target.value)}>
            {classes.length === 0 && <option value="">ยังไม่มีห้องเรียน</option>}
            {classes.map((room) => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
        </Field>
        <Badge tone="info">{roster.length} คนในห้องนี้</Badge>
      </div>

      {toolCategoryOrder.map((category) => {
        const tools = toolsInCategory(category);
        if (tools.length === 0) return null;
        return (
          <section key={category} className={sectionClass}>
            <div className={styles.sectionHead}>
              <h3>{toolCategoryLabels[category]}</h3>
              <p>{toolCategoryDescriptions[category]}</p>
            </div>
            <div className={styles.grid}>
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={styles.tile}
                  style={{ '--tile-ground': tool.bgColor, '--tile-icon': tool.iconBgColor } as CSSProperties}
                  onClick={() => start(tool)}
                  disabled={!tool.isReady}
                  aria-label={`${tool.title} — ${tool.description}`}
                >
                  <span className={styles.tileIcon}><Icon name={tool.iconName} size={20} /></span>
                  <span className={styles.tileTitle}>{tool.title}</span>
                  <p className={styles.tileText}>{tool.description}</p>
                  {tool.badge && <span className={styles.tileBadge}>{tool.badge}</span>}
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <p className={styles.tileText}>
        กิจกรรมทั้งหมด {classroomTools.length} รายการ · เพิ่มเกมใหม่ได้โดยเพิ่มหนึ่งแถวในทะเบียนกิจกรรม
      </p>
    </Modal>
  );
}
