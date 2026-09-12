import type { IconName } from '../../ui/Icon';

/**
 * Every activity the front of a classroom can start, named in one place.
 *
 * ── Why a registry rather than a screen with buttons on it ──
 * The list is going to grow, and the growth is the point: games arrive one at a time, each written
 * by somebody who should not have to understand the hub to add one. A row here is the whole of
 * adding an activity — a title, a colour, what pressing it does — and the hub renders whatever it
 * finds. Nothing else in the app has to know a new game exists.
 *
 * ── `isReady` is a promise, not a flag ──
 * An activity that is planned but not built stays in the list and says so. A hub that hides what is
 * coming teaches a teacher to stop looking; one that shows a locked card with a date on it does not.
 * The card is not pressable while it is false, so nothing can open a half-built tool by accident.
 */
export interface ClassroomToolItem {
  id: string;
  title: string;
  description: string;
  category: ClassroomToolCategory;
  iconName: IconName;
  /** The card's own ground. Soft, because ten saturated cards in a grid is a fairground. */
  bgColor: string;
  /** The circle the icon sits in, which is the one saturated thing on the card. */
  iconBgColor: string;
  badge?: string;
  /**
   * What pressing it does.
   *
   * `overlay` opens the tool over the hub, which is what an activity run in front of a class wants:
   * the room sees one thing at a time. `route` leaves for a screen of its own — the question rounds
   * do, because they are a lesson-long activity rather than a thirty-second one. `modal` is for a
   * tool that asks something small and returns.
   */
  actionType: 'modal' | 'route' | 'overlay';
  /** Where `route` goes. Meaningless for the other two. */
  route?: string;
  isReady: boolean;
}

export type ClassroomToolCategory = 'randomizer' | 'timer' | 'game' | 'gamification' | 'utility';

/** The headings the grid is grouped under, in the order a teacher meets them. */
export const toolCategoryOrder: ClassroomToolCategory[] = [
  'randomizer', 'game', 'gamification', 'timer', 'utility'
];

export const toolCategoryLabels: Record<ClassroomToolCategory, string> = {
  randomizer: 'สุ่มและจับกลุ่ม',
  game: 'เกมในห้องเรียน',
  gamification: 'ให้รางวัลและแต้ม',
  timer: 'จับเวลาและจังหวะคาบ',
  utility: 'เครื่องมือช่วยสอน'
};

export const toolCategoryDescriptions: Record<ClassroomToolCategory, string> = {
  randomizer: 'เลือกคนหรือแบ่งกลุ่มแบบที่ทั้งห้องเห็นว่ายุติธรรม',
  game: 'กิจกรรมที่ทั้งห้องเล่นพร้อมกันบนจอหน้าชั้น',
  gamification: 'ดาว แต้ม และค่าประสบการณ์ที่ต่อยอดไปถึงอวาตาร์',
  timer: 'ตั้งเวลาให้กิจกรรมจบตรงตามที่บอกนักเรียนไว้',
  utility: 'ของที่หยิบใช้ระหว่างสอนโดยไม่ต้องออกจากหน้าชั้น'
};

/**
 * The activities themselves.
 *
 * The colours are stated per row rather than derived from the category, because a grid where every
 * card in a section is the same colour reads as one block of colour rather than as four things to
 * choose between. They are soft on purpose: the saturated half is the icon's circle, which is small
 * enough to be a signal instead of a wall.
 */
export const classroomTools: ClassroomToolItem[] = [
  {
    id: 'spin-wheel',
    title: 'วงล้อสุ่มชื่อ',
    description: 'หมุนวงล้อเลือกนักเรียนออกมาหน้าห้อง ทุกคนได้ครบหนึ่งรอบก่อนจะซ้ำใคร',
    category: 'randomizer',
    iconName: 'wheel',
    bgColor: '#FBF3D5',
    iconBgColor: '#F59E0B',
    badge: 'ยอดนิยม',
    actionType: 'overlay',
    isReady: true
  },
  {
    id: 'group-draw',
    title: 'สุ่มแบ่งกลุ่ม',
    description: 'แบ่งห้องเป็น 2–6 กลุ่มให้จำนวนเท่ากัน สลับคนใหม่ทุกครั้งที่กด',
    category: 'randomizer',
    iconName: 'groups',
    bgColor: '#E5F9FF',
    iconBgColor: '#3B82F6',
    actionType: 'overlay',
    isReady: true
  },
  {
    id: 'quiz-live',
    title: 'ตอบคำถามหน้าชั้น',
    description: 'สร้างชุดคำถามเก็บไว้ แล้วเปิดรอบให้ทั้งห้องตอบพร้อมกันจากเครื่องของตัวเอง',
    category: 'game',
    iconName: 'buzzer',
    bgColor: '#F3E8FF',
    iconBgColor: '#8B5CF6',
    badge: 'ใหม่',
    actionType: 'overlay',
    isReady: true
  },
  {
    id: 'star-board',
    title: 'ให้ดาวกิจกรรม',
    description: 'ให้ดาวกับคนที่ร่วมกิจกรรม หนึ่งดาวได้ค่าประสบการณ์เป็นสองเท่าของงานหนึ่งชิ้น',
    category: 'gamification',
    iconName: 'star',
    bgColor: '#FFF1F2',
    iconBgColor: '#F43F5E',
    actionType: 'overlay',
    isReady: true
  },
  {
    id: 'class-timer',
    title: 'จับเวลากิจกรรม',
    description: 'นาฬิกาตัวใหญ่พอให้ทั้งห้องเห็นจากหลังห้อง พร้อมเวลาที่ตั้งไว้ให้เลือก',
    category: 'timer',
    iconName: 'clock',
    bgColor: '#ECFDF5',
    iconBgColor: '#10B981',
    actionType: 'route',
    route: '/classroom',
    isReady: true
  },
  {
    id: 'question-draw',
    title: 'สุ่มคำถามจากคลัง',
    description: 'ดึงคำถามจากคลังข้อสอบของวิชานั้นขึ้นจอทีละข้อ พร้อมเฉลยที่เปิดเมื่อพร้อม',
    category: 'utility',
    iconName: 'question-bank',
    bgColor: '#EEF2FF',
    iconBgColor: '#6366F1',
    actionType: 'route',
    route: '/classroom',
    isReady: true
  },
  {
    id: 'arcade',
    title: 'เกมสั้นหน้าชั้น',
    description: 'ช่องสำหรับเกมที่จะเพิ่มเข้ามา — เพิ่มหนึ่งเกมคือเพิ่มหนึ่งแถวในทะเบียนนี้',
    category: 'game',
    iconName: 'dice',
    bgColor: '#F1F5F9',
    iconBgColor: '#64748B',
    badge: 'เร็ว ๆ นี้',
    actionType: 'overlay',
    isReady: false
  }
];

export function toolsInCategory(category: ClassroomToolCategory): ClassroomToolItem[] {
  return classroomTools.filter((tool) => tool.category === category);
}
