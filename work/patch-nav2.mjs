import { patch } from './patchlib.mjs';
const file = 'apps/web/src/layouts/navigation.ts';

patch(file, [
  [
    `export interface NavItem { to: string; label: string; icon: IconName }`,
    `export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /**
   * Reachable, but not offered in the menu.
   *
   * The menu is also what grants a route -- \`isRouteAllowed\` reads this list -- so a screen that
   * should be reached from somewhere else in the product cannot simply be deleted from it without
   * closing the address to the very buttons that lead there. Hidden means the role still holds the
   * screen; only the menu row is gone.
   */
  hidden?: true;
}`
  ],
  [
    `export const destination = (to: string, label: string, icon: IconName): NavItem => ({ to, label, icon });`,
    `export const destination = (to: string, label: string, icon: IconName): NavItem => ({ to, label, icon });

/** The same destination, held by the role but reached from a screen rather than from the menu. */
export const reachedElsewhere = (to: string, label: string, icon: IconName): NavItem =>
  ({ to, label, icon, hidden: true });`
  ],
  [
    `       * gone is a third door into a place two clearer ones already lead to.
       *
       * What is left in the menu is the screen for reading a past day and correcting it, under
       * รายงาน, which is a different job and is named as one.
       */
      destination('/quiz', 'Quiz Challenge', 'quiz'),`,
    `       * gone is a third door into a place two clearer ones already lead to.
       *
       * What is left in the menu is the screen for reading a past day and correcting it, under
       * รายงาน, which is a different job and is named as one.
       */
      reachedElsewhere('/classroom', 'เปิดคาบเรียน · เช็กชื่อ', 'attendance'),
      destination('/quiz', 'Quiz Challenge', 'quiz'),`
  ],
  [
    `     * starts from a clean one.
     */
    { key: 'activities', label: 'สอนวันนี้', items: [
      destination('/quiz', 'Quiz Challenge', 'quiz'),`,
    `     * starts from a clean one.
     */
    { key: 'activities', label: 'สอนวันนี้', items: [
      reachedElsewhere('/classroom', 'เปิดคาบเรียน · เช็กชื่อ', 'attendance'),
      destination('/quiz', 'Quiz Challenge', 'quiz'),`
  ]
]);
console.log('route kept, menu row hidden');
