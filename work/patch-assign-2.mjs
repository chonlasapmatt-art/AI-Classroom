import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/assignments/AssignmentsPage.tsx';

/* ── 1. A ref on the tracking section, so pressing the button moves the page to it ── */
const stateOld = `  const [selectedTrackingWorkId, setSelectedTrackingWorkId] = useState<string | null>(null);`;
const stateNew = `  const [selectedTrackingWorkId, setSelectedTrackingWorkId] = useState<string | null>(null);
  /*
   * Where "ดูสถานะการส่ง" takes you.
   *
   * The button set the tracked work and nothing else, and the panel it fills is section 2 -- below
   * a list that is often a screenful on its own and always is on a phone. A teacher pressed it,
   * saw the page not move, and reported the button as broken; it had in fact worked every time.
   */
  const trackingSection = useRef<HTMLElement | null>(null);`;

/* ── 2. The button itself ── */
const buttonOld = `                    <Button size="sm" variant="ghost" onClick={() => {
                      if (isTeacher) {
                        setSelectedTrackingWorkId(work.id);
                        setExpanded(null);
                      } else {
                        setExpanded(open ? null : work.id);
                        if (!open && ownStudent) void repository.markWorkOpened(work.id, ownStudent.id);
                      }
                    }}>
                      {open ? 'ซ่อน' : isTeacher ? 'ดูสถานะการส่ง' : 'เปิดงาน'}
                    </Button>`;

const buttonNew = `                    <Button
                      size="sm" variant="ghost"
                      /*
                       * Draft work has no status to show: nobody has been given it, so section 2 --
                       * which lists published work only -- would either sit empty or, worse, jump to
                       * whichever other work happened to be first and show that instead. The button
                       * says why rather than going quiet.
                       */
                      disabled={isTeacher && work.status === 'draft'}
                      title={isTeacher && work.status === 'draft' ? 'เผยแพร่งานก่อน แล้วสถานะของนักเรียนจะแสดงที่ส่วนที่ 2' : undefined}
                      onClick={() => {
                        if (isTeacher) {
                          setSelectedTrackingWorkId(work.id);
                          setExpanded(null);
                          trackingSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else {
                          setExpanded(open ? null : work.id);
                          if (!open && ownStudent) void repository.markWorkOpened(work.id, ownStudent.id);
                        }
                      }}
                    >
                      {open ? 'ซ่อน' : isTeacher ? (work.status === 'draft' ? 'ยังเป็นฉบับร่าง' : 'ดูสถานะการส่ง') : 'เปิดงาน'}
                    </Button>`;

/* ── 3. The section the ref points at ── */
const sectionOld = `        <section className="assignment-section assignment-status-section" aria-labelledby="assignment-status-title">`;
const sectionNew = `        <section ref={trackingSection} className="assignment-section assignment-status-section" aria-labelledby="assignment-status-title">`;

patch(file, [[stateOld, stateNew], [buttonOld, buttonNew], [sectionOld, sectionNew]]);
console.log('tracking jump wired');
