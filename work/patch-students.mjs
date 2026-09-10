import { patch } from './patchlib.mjs';
const file = 'apps/web/src/features/students/StudentsPage.tsx';

/*
 * `if (destination && term)` silently drops the enrolment when the device holds no academic term,
 * and the toast then says the child was added -- which is true locally and useless to everybody
 * else, because a child with no enrolment is in no room, so no teacher's roster and no
 * administrator's roll shows them. It is also why `sync_change_visible` never hands that child's
 * assignments to their own device: visibility is decided by active enrolment.
 */
const addOld = `      if (destination && term) await repository.enrollStudent(id, destination, term.id);`;
const addNew = `      if (destination) {
        if (!term) throw new Error('ยังไม่มีภาคเรียนในเครื่องนี้ · ซิงก์ข้อมูลก่อน แล้วจึงเพิ่มนักเรียนเข้าห้อง');
        await repository.enrollStudent(id, destination, term.id);
      }`;

const bulkOld = `        if (destination && term) await repository.enrollStudent(id, destination, term.id);`;
const bulkNew = `        if (destination) {
          if (!term) throw new Error('ยังไม่มีภาคเรียนในเครื่องนี้ · ซิงก์ข้อมูลก่อน แล้วจึงเพิ่มนักเรียนเข้าห้อง');
          await repository.enrollStudent(id, destination, term.id);
        }`;

patch(file, [[addOld, addNew], [bulkOld, bulkNew]]);
console.log('enrolment no longer skipped in silence');
