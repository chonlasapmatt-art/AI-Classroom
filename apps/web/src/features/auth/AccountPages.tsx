import { useAuth, type PublicRegistrationRole } from '../../app/AuthContext';
import { ChildLinkPanel } from '../parents/ChildLinkPanel';
import { Button } from '../../ui/components';
import { BrandMark } from '../../ui/BrandMark';

/**
 * What this account has to do to get into a school, said in the order it has to be done.
 *
 * This screen used to offer a field for an eight-digit invitation code. The code was real — the
 * server can issue one — but no screen in this product ever issued it, so the only thing that field
 * could do was hold somebody at a door with a key that does not exist. What actually puts a person
 * in a school is their own entrance: an administrator records them, and they sign in through the
 * door for their role, which binds the account on the spot. So the screen says that instead.
 */
/** What this account calls itself, so the person can tell the school which list to look in. */
const roleLabels: Record<PublicRegistrationRole | 'admin', string> = {
  teacher: 'ครู', student: 'นักเรียน', parent: 'ผู้ปกครอง', admin: 'ผู้ดูแล'
};

interface JoinRoute {
  /** What is missing, in one sentence, without blaming the person reading it. */
  lead: string;
  steps: string[];
  /** The door this person should come back through, once the school has recorded them. */
  door?: { path: string; label: string };
}

const joinRoutes: Record<PublicRegistrationRole | 'unknown', JoinRoute> = {
  teacher: {
    lead: 'บัญชีครูจะเข้าโรงเรียนได้เมื่อผู้ดูแลโรงเรียนบันทึกชื่อคุณไว้ในรายชื่อครูแล้ว',
    steps: [
      'แจ้งผู้ดูแลโรงเรียนให้เพิ่มชื่อคุณที่หน้า “ครู” และขอรหัสครูของโรงเรียน',
      'กลับมาที่หน้าเข้าสู่ระบบของครู แล้วกรอกชื่อของคุณกับรหัสครูนั้น',
      'ระบบจะผูกบัญชีนี้เข้ากับโรงเรียนให้ทันทีที่เข้าสำเร็จ ไม่ต้องรออนุมัติซ้ำ'
    ],
    door: { path: '/login?as=teacher', label: 'ออกจากระบบแล้วไปหน้าเข้าสู่ระบบครู' }
  },
  student: {
    lead: 'บัญชีนักเรียนจะเข้าโรงเรียนได้เมื่อโรงเรียนบันทึกชื่อและเลขประจำตัวของคุณไว้แล้ว',
    steps: [
      'แจ้งครูหรือผู้ดูแลโรงเรียนให้ตรวจว่ามีชื่อคุณอยู่ในรายชื่อนักเรียน',
      'กลับมาที่หน้าเข้าสู่ระบบของนักเรียน แล้วกรอกชื่อของคุณกับเลขประจำตัวนักเรียน',
      'ถ้าชื่อซ้ำกับเพื่อน ระบบจะให้เลือกโรงเรียนของคุณเอง'
    ],
    door: { path: '/login?as=student', label: 'ออกจากระบบแล้วไปหน้าเข้าสู่ระบบนักเรียน' }
  },
  parent: {
    lead: 'บัญชีผู้ปกครองจะเห็นข้อมูลได้เมื่อเชื่อมกับลูกที่อยู่ในโรงเรียนแล้ว',
    steps: [
      'เพิ่มลูกด้วยชื่อจริงของลูกที่ใช้กับโรงเรียน',
      'รอผู้ดูแลโรงเรียนยืนยันการเชื่อม แล้วข้อมูลของลูกจะแสดงทันที'
    ]
  },
  unknown: {
    lead: 'บัญชีนี้ยังไม่ได้ถูกผูกกับโรงเรียนใด ระบบนี้ไม่มีการสมัครสมาชิกด้วยตัวเอง ทุกบัญชีสร้างโดยผู้ดูแลโรงเรียน',
    steps: [
      'แจ้งผู้ดูแลโรงเรียนพร้อมบอกชื่อบัญชีที่แสดงด้านล่างนี้ เพื่อให้เพิ่มคุณเข้าโรงเรียน',
      'เมื่อเพิ่มแล้ว ให้ออกจากระบบและเข้าใหม่ผ่านประตูของบทบาทคุณที่หน้าแรก'
    ]
  }
};

/** บัญชีทั้งหมดสร้างโดยแอดมินโรงเรียน หน้านี้รองรับเฉพาะบัญชีที่รอถูกผูกกับโรงเรียน */
export function AwaitingMembershipPage() {
  const auth = useAuth();
  const metadata = auth.session?.user.user_metadata ?? {};
  const requestedRole = metadata.requested_role as PublicRegistrationRole | undefined;
  const accountName = typeof metadata.display_name === 'string' ? metadata.display_name : '';
  const route = joinRoutes[requestedRole ?? 'unknown'] ?? joinRoutes.unknown;

  /*
   * Signing out first is the point of this control, not a side effect.
   *
   * The sign-in screen sends anybody who already has a session back to the app, and the app sends an
   * account with no school straight back here — so the old "กลับไปหน้าเข้าสู่ระบบ" link was a loop
   * that returned people to the screen they were trying to leave. A full page load also drops every
   * projection this session had, which is what somebody about to sign in as somebody else wants.
   */
  async function leaveFor(path: string) {
    await auth.signOut();
    window.location.assign(path);
  }

  if (requestedRole === 'parent') {
    return (
      <main className="center-state account-state onboarding-state parent-onboarding">
        <div className="brand-mark" aria-hidden="true"><BrandMark size={44} /></div>
        <h1>ลูกของฉัน</h1>
        <p>เพิ่มลูกด้วยชื่อจริงของลูกเท่านั้น เมื่อเชื่อมแล้วข้อมูลของลูกจะแสดงทันที</p>
        <ChildLinkPanel onChanged={() => void auth.refreshMemberships()} />
        <button className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
      </main>
    );
  }

  return (
    <main className="center-state account-state onboarding-state">
      <div className="brand-mark" aria-hidden="true"><BrandMark size={44} /></div>
      {/* "ไม่มีสิทธิ์" reads as an accusation for what is almost always a step nobody has taken yet. */}
      <h1>บัญชีนี้ยังไม่ได้อยู่ในโรงเรียนใด</h1>
      <p>{route.lead}</p>
      {(accountName || requestedRole) && (
        <p className="account-identity">
          <strong>{accountName || 'บัญชีนี้'}{requestedRole ? ` · ประเภทบัญชี ${roleLabels[requestedRole]}` : ''}</strong>
          <span>บอกชื่อนี้กับผู้ดูแลโรงเรียน เพื่อให้หาบัญชีของคุณเจอ</span>
        </p>
      )}
      <ol className="join-steps">
        {route.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <div className="join-actions">
        {route.door && (
          <Button variant="primary" onClick={() => void leaveFor(route.door!.path)}>{route.door.label}</Button>
        )}
        <Button variant="secondary" onClick={() => void auth.refreshMemberships()}>ตรวจสอบสถานะอีกครั้ง</Button>
      </div>
      <button className="text-button" onClick={() => void auth.signOut()}>ออกจากระบบ</button>
    </main>
  );
}
