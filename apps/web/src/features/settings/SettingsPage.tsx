import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { privacyPolicyFrom, scorePolicyFrom } from '../../data/selectors';
import { isCloudConfigured } from '../../services/supabase';
import { APP_VERSION, checkForUpdateNow, formatBuildTime, readLastCheckedAt } from '../../app/appUpdate';
import { AcademicSettingsPanel } from './AcademicSettingsPanel';
import { useTheme } from '../../app/ThemeContext';
import { themeDensities, themeModes, themeMotions, themePresets } from '../../app/theme';
import { Badge, Button, Card, CardHeader, Field, FieldGroup, LinkButton, PageHeader, Stat, Tabs } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toastContext';

type Section = 'display' | 'policy' | 'academic' | 'system';

export function SettingsPage() {
  const { membership, memberships, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const { toast } = useToast();
  const theme = useTheme();
  const policy = scorePolicyFrom(snapshot.settings);
  const privacy = privacyPolicyFrom(snapshot.settings);
  const isAdmin = membership.role === 'admin';
  const adminSchools = memberships.filter((item) => item.role === 'admin');
  const lastChecked = readLastCheckedAt();
  const [section, setSection] = useState<Section>('display');

  /*
    The three weights are held here rather than read out of the form at submit time, because they
    have to add up to 100 and the only way anyone found out they did not was to press save and be
    refused. The running total is now beside the fields while they are being typed.
  */
  const [weights, setWeights] = useState(policy.weights);
  const weightTotal = weights.assignment + weights.activity + weights.test;
  const weightsBalanced = weightTotal === 100;

  async function saveScorePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!weightsBalanced) {
      toast('น้ำหนักรวมต้องเท่ากับ 100', { tone: 'error' });
      return;
    }
    await repository.saveSetting('score_policy', {
      weights,
      latePenaltyPercent: Number(data.get('latePenalty') ?? policy.latePenaltyPercent),
      missingItem: String(data.get('missingItem') ?? policy.missingItem),
      decimals: policy.decimals
    });
    toast('บันทึกนโยบายคะแนนแล้ว');
  }

  async function savePrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await repository.saveSetting('privacy_policy', {
      policyVersion: String(data.get('policyVersion') ?? privacy.policyVersion),
      showLeaderboardToStudents: data.get('showLeaderboard') === 'on',
      shareScoresWithParents: data.get('shareScores') === 'on'
    });
    toast('บันทึกนโยบายความเป็นส่วนตัวแล้ว');
  }

  return (
    <>
      <PageHeader
        eyebrow="ตั้งค่า"
        title="การตั้งค่าโรงเรียน"
        description="ธีมของเครื่องนี้ นโยบายคะแนนและความเป็นส่วนตัวของโรงเรียน ปีการศึกษา และสถานะระบบ"
      />

      {!isAdmin && (
        <Card className="settings-readonly-note">
          <p>
            <Icon name="eye" size={16} />
            คุณกำลังดูในโหมดอ่านอย่างเดียว · ธีมด้านล่างปรับได้เฉพาะบนเครื่องนี้ ส่วนนโยบายของโรงเรียนแก้ไขได้โดยผู้ดูแลระบบเท่านั้น
          </p>
        </Card>
      )}

      {/*
        Six panels stacked in a column meant the thing most people came for — the theme — sat above
        four sections most of them may never change, and an administrator looking for the academic
        year scrolled past all of it. They are four groups now.
      */}
      <Tabs
        ariaLabel="กลุ่มการตั้งค่า"
        value={section}
        onChange={setSection}
        options={[
          { value: 'display' as const, label: 'ธีมและการแสดงผล' },
          { value: 'policy' as const, label: 'นโยบายโรงเรียน' },
          { value: 'academic' as const, label: 'ปีการศึกษา' },
          { value: 'system' as const, label: 'ระบบและเวอร์ชัน' }
        ]}
      />

      {section === 'display' && (
        <Card className="theme-studio">
          <CardHeader
            title="ธีมและการแสดงผล"
            description="ปรับหน้าตาให้เข้ากับสไตล์การทำงานของคุณ ค่านี้จำเฉพาะเครื่องนี้ ไม่กระทบผู้ใช้คนอื่น"
            action={<Badge tone="success">ใช้งานอยู่</Badge>}
          />
          <fieldset className="theme-choice">
            <legend>โหมดสี</legend>
            <div className="theme-option-grid">
              {themeModes.map((item) => (
                <label key={item.value} className={theme.mode === item.value ? 'selected' : ''}>
                  <input type="radio" name="theme-mode" checked={theme.mode === item.value}
                    onChange={() => theme.setMode(item.value)} />
                  <span><strong>{item.label}</strong><small>{item.value === 'system' ? 'ตามอุปกรณ์' : item.value === 'light' ? 'สว่างสะอาด' : 'สบายตาตอนกลางคืน'}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="theme-choice presets">
            <legend>ชุดสีของโรงเรียน</legend>
            <div className="theme-preset-grid">
              {themePresets.map((item) => (
                <label key={item.value} className={`theme-preset-card ${theme.preset === item.value ? 'selected' : ''}`}>
                  <input type="radio" name="theme-preset" checked={theme.preset === item.value}
                    onChange={() => theme.setPreset(item.value)} />
                  <span className="theme-swatch" style={{ background: item.swatch }} aria-hidden="true" />
                  <span><strong>{item.label}</strong><small>{item.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="theme-preference-grid">
            <fieldset className="theme-choice">
              <legend>ความหนาแน่นของข้อมูล</legend>
              <div className="theme-segmented">
                {themeDensities.map((item) => <label key={item.value} className={theme.density === item.value ? 'selected' : ''}><input type="radio" name="theme-density" checked={theme.density === item.value} onChange={() => theme.setDensity(item.value)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}
              </div>
            </fieldset>
            <fieldset className="theme-choice">
              <legend>แอนิเมชัน</legend>
              <div className="theme-segmented">
                {themeMotions.map((item) => <label key={item.value} className={theme.motion === item.value ? 'selected' : ''}><input type="radio" name="theme-motion" checked={theme.motion === item.value} onChange={() => theme.setMotion(item.value)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}
              </div>
            </fieldset>
          </div>
          <div className="theme-preview" aria-label="ตัวอย่างธีมปัจจุบัน">
            <div className="theme-preview-top"><strong>Smart Classroom</strong><span><i /> <i /> <i /></span></div>
            <div className="theme-preview-body"><div className="theme-preview-side" /><div className="theme-preview-content"><span /><span /><span className="wide" /></div><b>{themePresets.find((item) => item.value === theme.preset)?.label}</b></div>
          </div>
        </Card>
      )}

      {section === 'policy' && (
        <>
          <Card>
            <CardHeader
              title="นโยบายคะแนน"
              description="กำหนดว่าคะแนนรวมของนักเรียนคิดจากอะไรบ้าง มีผลกับสมุดเกรดและรายงานทุกฉบับ"
              action={(
                <Badge tone={weightsBalanced ? 'success' : 'danger'}>
                  น้ำหนักรวม {weightTotal}%
                </Badge>
              )}
            />
            <form onSubmit={(event) => void saveScorePolicy(event)}>
              <FieldGroup title="สัดส่วนคะแนน (รวมต้องได้ 100%)" columns={3}>
                <Field
                  label="งานที่มอบหมาย (%)"
                  {...(weightsBalanced ? {} : { error: `ตอนนี้รวมได้ ${weightTotal}% ต้องปรับให้ครบ 100%` })}
                >
                  <input
                    name="assignment" type="number" min="0" max="100" value={weights.assignment} disabled={!isAdmin}
                    onChange={(event) => setWeights((current) => ({ ...current, assignment: Number(event.target.value) || 0 }))}
                  />
                </Field>
                <Field label="กิจกรรม (%)">
                  <input
                    name="activity" type="number" min="0" max="100" value={weights.activity} disabled={!isAdmin}
                    onChange={(event) => setWeights((current) => ({ ...current, activity: Number(event.target.value) || 0 }))}
                  />
                </Field>
                <Field label="สอบ (%)">
                  <input
                    name="test" type="number" min="0" max="100" value={weights.test} disabled={!isAdmin}
                    onChange={(event) => setWeights((current) => ({ ...current, test: Number(event.target.value) || 0 }))}
                  />
                </Field>
              </FieldGroup>
              <FieldGroup title="งานที่ส่งช้าและงานที่ไม่ส่ง" columns={2}>
                <Field label="หักคะแนนงานส่งช้า (%)" hint="หักจากคะแนนเต็มของงานชิ้นนั้น">
                  <input name="latePenalty" type="number" min="0" max="100" defaultValue={policy.latePenaltyPercent} disabled={!isAdmin} />
                </Field>
                <Field label="งานที่ไม่ส่ง">
                  <select name="missingItem" defaultValue={policy.missingItem} disabled={!isAdmin}>
                    <option value="zero">คิดเป็น 0 คะแนน</option>
                    <option value="exclude">ไม่นำมาคิด</option>
                  </select>
                </Field>
              </FieldGroup>
              <div className="ui-form-actions">
                <Button variant="primary" disabled={!isAdmin || !weightsBalanced} icon={<Icon name="check" size={16} />}>
                  บันทึกนโยบายคะแนน
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="ความเป็นส่วนตัว"
              description="ควบคุมว่าใครเห็นอะไรได้บ้าง ปิดไว้เมื่อไม่แน่ใจ"
            />
            <form onSubmit={(event) => void savePrivacy(event)}>
              <FieldGroup columns={1}>
                <Field label="เวอร์ชันนโยบายความยินยอม" hint="เปลี่ยนเลขนี้เมื่อข้อความยินยอมมีการแก้ไข ระบบจะขอความยินยอมใหม่">
                  <input name="policyVersion" defaultValue={privacy.policyVersion} disabled={!isAdmin} />
                </Field>
              </FieldGroup>
              <label className="checkbox-row">
                <input type="checkbox" name="showLeaderboard" defaultChecked={privacy.showLeaderboardToStudents} disabled={!isAdmin} />
                <span>
                  <strong>ให้นักเรียนเห็นกระดานอันดับ</strong>
                  <small>ปิดไว้ถ้าไม่ต้องการให้นักเรียนเปรียบเทียบคะแนนกันเอง</small>
                </span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" name="shareScores" defaultChecked={privacy.shareScoresWithParents} disabled={!isAdmin} />
                <span>
                  <strong>แชร์คะแนนกับผู้ปกครองที่ยินยอมแล้ว</strong>
                  <small>ผู้ปกครองจะเห็นเฉพาะคะแนนของบุตรหลานตนเอง และเฉพาะรายการที่ครูประกาศแล้ว</small>
                </span>
              </label>
              <div className="ui-form-actions">
                <Button variant="primary" disabled={!isAdmin} icon={<Icon name="check" size={16} />}>บันทึกนโยบายความเป็นส่วนตัว</Button>
              </div>
            </form>
          </Card>
        </>
      )}

      {section === 'academic' && <AcademicSettingsPanel canEdit={isAdmin} onMessage={toast} />}

      {section === 'system' && (
        <>
          {/*
            The account, not the campus. An administrator who runs two schools has no other place that
            says so: every other screen answers for the school they are standing in, and the switcher in
            the top bar only appears once the second one exists.
          */}
          {isAdmin && mode === 'cloud' && (
            <Card>
              <CardHeader
                title="โรงเรียนในบัญชีนี้"
                description="บัญชีผู้ดูแลหนึ่งบัญชีเปิดได้หลายโรงเรียน แต่ละแห่งใช้คีย์ผลิตภัณฑ์คนละใบและข้อมูลแยกกันทั้งหมด"
                action={<LinkButton to="/schools/new">เพิ่มโรงเรียนใหม่</LinkButton>}
              />
              <ul className="settings-fact-list">
                {adminSchools.map((item) => (
                  <li key={item.membershipId}>
                    <span className="settings-fact-label">
                      <Icon name={item.schoolId === membership.schoolId ? 'check' : 'classes'} size={16} />
                      {item.schoolName}
                    </span>
                    <Badge tone={item.schoolId === membership.schoolId ? 'success' : 'neutral'}>
                      {item.schoolId === membership.schoolId ? 'กำลังใช้งาน' : 'สลับได้จากแถบบน'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="ui-stat-grid">
            <Stat
              label="โหมดการทำงาน"
              value={mode === 'cloud' ? 'เชื่อมต่อเซิร์ฟเวอร์' : 'โหมดตัวอย่าง'}
              hint={mode === 'cloud' ? 'ข้อมูลจริงของโรงเรียน' : 'ข้อมูลจำลอง ไม่บันทึกถาวร'}
              tone={mode === 'cloud' ? 'success' : 'warning'}
              icon={<Icon name="sync" size={18} />}
            />
            <Stat
              label="รายการรอซิงก์"
              value={snapshot.pendingSync}
              hint={snapshot.pendingSync === 0 ? 'ส่งขึ้นเซิร์ฟเวอร์ครบแล้ว' : 'จะส่งให้เองเมื่อออนไลน์'}
              tone={snapshot.pendingSync === 0 ? 'success' : 'info'}
              icon={<Icon name="upload" size={18} />}
            />
            <Stat label="เวอร์ชันแอป" value={APP_VERSION} hint={`สร้างเมื่อ ${formatBuildTime()}`} tone="brand" icon={<Icon name="settings" size={18} />} />
          </div>

          <Card>
            <CardHeader
              title="เวอร์ชันและการอัปเดต"
              description="แอปจะไม่รีโหลดเอง เมื่อพบเวอร์ชันใหม่จะขึ้นแถบให้กด “อัปเดตตอนนี้” · งานที่ยังไม่ซิงก์ยังอยู่ในเครื่องหลังอัปเดต"
              action={(
                <Button
                  variant="secondary"
                  icon={<Icon name="refresh" size={16} />}
                  onClick={() => void checkForUpdateNow()
                    .then((checked) => toast(checked ? 'ตรวจหาอัปเดตแล้ว ถ้ามีเวอร์ชันใหม่จะมีแถบแจ้งขึ้นมา' : 'เบราว์เซอร์นี้ไม่รองรับการอัปเดตอัตโนมัติ'))
                    .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'ตรวจหาอัปเดตไม่สำเร็จ', { tone: 'error' }))}
                >
                  ตรวจหาอัปเดต
                </Button>
              )}
            />
            <ul className="settings-fact-list">
              <li><span className="settings-fact-label">เวอร์ชันแอป</span><strong>{APP_VERSION}</strong></li>
              <li><span className="settings-fact-label">รุ่นที่สร้าง</span><strong>{formatBuildTime()}</strong></li>
              <li>
                <span className="settings-fact-label">ตรวจหาอัปเดตล่าสุด</span>
                <strong>{lastChecked ? new Date(lastChecked).toLocaleString('th-TH') : 'ยังไม่เคยตรวจ'}</strong>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="สถานะระบบ" description="ไว้ตรวจสอบเวลามีปัญหา ไม่ต้องแก้อะไรที่นี่" />
            <ul className="settings-fact-list">
              <li>
                <span className="settings-fact-label">การเชื่อมต่อเซิร์ฟเวอร์</span>
                <Badge tone={isCloudConfigured ? 'success' : 'warning'}>{isCloudConfigured ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}</Badge>
              </li>
              <li>
                <span className="settings-fact-label">ที่เก็บข้อมูลบนเครื่องนี้</span>
                <strong>{repository.kind === 'dexie' ? 'ฐานข้อมูลในเครื่อง · ทำงานออฟไลน์ได้' : 'ข้อมูลตัวอย่างสำหรับนักพัฒนา'}</strong>
              </li>
              <li>
                <span className="settings-fact-label">รายการที่รอส่งขึ้นเซิร์ฟเวอร์</span>
                <strong>{snapshot.pendingSync} รายการ</strong>
              </li>
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
