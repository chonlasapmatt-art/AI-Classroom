import { patch } from './patchlib.mjs';
const file = 'apps/web/src/layouts/navigation.ts';

/*
 * The register loses its menu entry and keeps its route.
 *
 * "เปิดคาบเรียน · เช็กชื่อ" was still a top-level errand -- a menu item that opens a screen which
 * then has to be told which room. The room card already offers the two jobs separately and knows
 * which room it is: "เช็กชื่อ" goes straight to the period's sheet, "ดูรายชื่อนักเรียน" opens the
 * roll. So the way in is ห้องเรียน, and the menu stops offering a third door into the same place.
 *
 * The route stays exactly where it was. Every link to it -- the room cards, the roster panel, the
 * dashboard, the Preview centre -- keeps working, and so does anybody who has bookmarked it.
 */
const adminOld = `    { key: 'classroom', label: 'งาน คะแนน และการเข้าเรียน', items: [
      /*
       * "เช็กชื่อ" is not an errand of its own any more.
       *
       * It was a screen somebody had to remember to visit, pick the room on and pick the period on
       * -- all three of which the timetable already knows the moment a teacher opens the room they
       * are standing in. So the register lives in the room, and what is left here is the screen for
       * reading a past day and correcting it, which is a different job and is named as one.
       */
      destination('/classroom', 'เปิดคาบเรียน · เช็กชื่อ', 'attendance'),
      destination('/quiz', 'Quiz Challenge', 'quiz'),`;

const adminNew = `    { key: 'classroom', label: 'งาน คะแนน และการเข้าเรียน', items: [
      /*
       * "เช็กชื่อ" is not an errand of its own any more, and no longer a menu entry either.
       *
       * It was a screen somebody had to remember to visit, pick the room on and pick the period on
       * -- all three of which the timetable already knows the moment somebody opens the room being
       * taught. The room card in ห้องเรียน offers the two jobs as two buttons: "เช็กชื่อ" goes to
       * that period's sheet, "ดูรายชื่อนักเรียน" opens the roll. The route is untouched; what is
       * gone is a third door into a place two clearer ones already lead to.
       *
       * What is left in the menu is the screen for reading a past day and correcting it, under
       * รายงาน, which is a different job and is named as one.
       */
      destination('/quiz', 'Quiz Challenge', 'quiz'),`;

const teacherOld = `    /*
     * Taking the register is not an errand of its own any more.
     *
     * "เช็กชื่อ" was a screen a teacher had to remember to visit, choose the room on and choose the
     * period on — all of which the timetable already knows the moment they open the room they are
     * teaching. So the register lives in the lesson: opening the class is taking the register, and
     * each period has its own sheet, so the next teacher into the room starts from a clean one.
     */
    { key: 'activities', label: 'สอนวันนี้', items: [
      destination('/classroom', 'เปิดคาบเรียน · เช็กชื่อ', 'attendance'),
      destination('/quiz', 'Quiz Challenge', 'quiz'),`;

const teacherNew = `    /*
     * Taking the register is not an errand of its own any more, and not a menu entry either.
     *
     * "เช็กชื่อ" was a screen a teacher had to remember to visit, choose the room on and choose the
     * period on — all of which the timetable already knows the moment they open the room they are
     * teaching. So the register lives in the lesson, reached from the room: ห้องเรียน lists the
     * rooms this teacher has, and each card carries "เช็กชื่อ" and "ดูรายชื่อนักเรียน" as two
     * separate buttons. Each period still has its own sheet, so the next teacher into the room
     * starts from a clean one.
     */
    { key: 'activities', label: 'สอนวันนี้', items: [
      destination('/quiz', 'Quiz Challenge', 'quiz'),`;

patch(file, [[adminOld, adminNew], [teacherOld, teacherNew]]);
console.log('register reached through the room, not the menu');
