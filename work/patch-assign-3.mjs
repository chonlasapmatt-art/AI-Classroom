import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/assignments/AssignmentsPage.tsx';

/* ── The withdraw handler, beside turnIn ── */
const turnInEnd = `    toast(driveUrl
      ? 'ส่งงานเรียบร้อยแล้ว · ครูเปิดลิงก์ได้ทันที'
      : \`ส่งงานเรียบร้อยแล้ว\${attachedFiles > 0 ? \` · แนบไฟล์ \${attachedFiles} ไฟล์\` : ''}\`);
  }`;

const withdraw = turnInEnd + `

  /**
   * Taking a turn-in back.
   *
   * Handing in the wrong photograph used to be final: the only way out was to find the teacher and
   * ask for a revision request, which meant the child sat looking at "ส่งแล้ว" over work they knew
   * was wrong. Withdrawing puts the submission back where it was and leaves the recorded versions
   * alone, so the first hand-in time survives for anybody who later asks about the deadline. Once a
   * mark exists the repository refuses, and the refusal is what the child is shown.
   */
  async function withdraw(work: Assignment) {
    if (!ownStudent) return;
    try {
      await repository.withdrawWork(work.id, ownStudent.id);
      toast('ยกเลิกการส่งงานแล้ว · แก้ไขแล้วส่งใหม่ได้');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'ยกเลิกการส่งงานไม่สำเร็จ', { tone: 'error' });
    }
  }`;

/* ── The button, in the turned-in panel ── */
const actionsOld = `                    <div className="turn-in-actions">
                      {!submission?.acknowledgedAt && (`;

const actionsNew = `                    <div className="turn-in-actions">
                      {/* Work already handed in and not yet marked: the child can take it back. */}
                      {submission?.submittedAt && !['graded', 'returned'].includes(submission.status) && (
                        <Button variant="secondary" onClick={() => void withdraw(work)}>
                          ยกเลิกการส่งงาน
                        </Button>
                      )}
                      {!submission?.acknowledgedAt && (`;

patch(file, [[turnInEnd, withdraw], [actionsOld, actionsNew]]);
console.log('withdraw wired');
