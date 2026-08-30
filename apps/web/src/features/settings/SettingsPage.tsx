import { useState, type FormEvent } from 'react';
import { useSession } from '../../app/SessionContext';
import { useRepository, useSchoolSnapshot } from '../../data/RepositoryContext';
import { privacyPolicyFrom, scorePolicyFrom } from '../../data/selectors';
import { isCloudConfigured } from '../../services/supabase';
import { APP_VERSION, checkForUpdateNow, formatBuildTime, readLastCheckedAt } from '../../app/appUpdate';
import { AcademicSettingsPanel } from './AcademicSettingsPanel';
import { useTheme } from '../../app/ThemeContext';
import { themeModes, themePresets } from '../../app/theme';

export function SettingsPage() {
  const { membership, mode } = useSession();
  const repository = useRepository();
  const snapshot = useSchoolSnapshot();
  const [message, setMessage] = useState<string | null>(null);
  const theme = useTheme();
  const policy = scorePolicyFrom(snapshot.settings);
  const privacy = privacyPolicyFrom(snapshot.settings);
  const isAdmin = membership.role === 'admin';
  const lastChecked = readLastCheckedAt();

  async function saveScorePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const assignment = Number(data.get('assignment') ?? policy.weights.assignment);
    const activity = Number(data.get('activity') ?? policy.weights.activity);
    const test = Number(data.get('test') ?? policy.weights.test);
    if (assignment + activity + test !== 100) {
      setMessage('น้ำหนักรวมต้องเท่ากับ 100');
      return;
    }
    await repository.saveSetting('score_policy', {
      weights: { assignment, activity, test },
      latePenaltyPercent: Number(data.get('latePenalty') ?? policy.latePenaltyPercent),
      missingItem: String(data.get('missingItem') ?? policy.missingItem),
      decimals: policy.decimals
    });
    setMessage('บันทึกนโยบายคะแนนแล้ว');
  }

  async function savePrivacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await repository.saveSetting('privacy_policy', {
      policyVersion: String(data.get('policyVersion') ?? privacy.policyVersion),
      showLeaderboardToStudents: data.get('showLeaderboard') === 'on',
      shareScoresWithParents: data.get('shareScores') === 'on'
    });
    setMessage('บันทึกนโยบายความเป็นส่วนตัวแล้ว');
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">ตั้งค่า</span>
          <h1>การตั้งค่าโรงเรียน</h1>
          <p>นโยบายคะแนน ความเป็นส่วนตัว และสถานะ environment</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>ธีมและการแสดงผล</h2>
          <p>ตั้งค่าเฉพาะเครื่องนี้ ไม่กระทบผู้ใช้คนอื่นและไม่ถูกส่งขึ้นเซิร์ฟเวอร์</p>
        </div>
        <fieldset className="theme-choice">
          <legend>โหมดสี</legend>
          {themeModes.map((item) => (
            <label key={item.value}>
              <input type="radio" name="theme-mode" checked={theme.mode === item.value}
                onChange={() => theme.setMode(item.value)} />
              {item.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="theme-choice presets">
          <legend>ชุดสี</legend>
          {themePresets.map((item) => (
            <label key={item.value} className={theme.preset === item.value ? 'selected' : ''}>
              <input type="radio" name="theme-preset" checked={theme.preset === item.value}
                onChange={() => theme.setPreset(item.value)} />
              <span className="theme-swatch" style={{ background: item.swatch }} aria-hidden="true" />
              {item.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><h2>นโยบายคะแนน</h2></div>
          <form onSubmit={(event) => void saveScorePolicy(event)}>
            <div className="form-grid">
              <label>น้ำหนักงาน (%)<input name="assignment" type="number" min="0" max="100" defaultValue={policy.weights.assignment} disabled={!isAdmin} /></label>
              <label>น้ำหนักกิจกรรม (%)<input name="activity" type="number" min="0" max="100" defaultValue={policy.weights.activity} disabled={!isAdmin} /></label>
              <label>น้ำหนักสอบ (%)<input name="test" type="number" min="0" max="100" defaultValue={policy.weights.test} disabled={!isAdmin} /></label>
              <label>หักคะแนนงานส่งช้า (%)<input name="latePenalty" type="number" min="0" max="100" defaultValue={policy.latePenaltyPercent} disabled={!isAdmin} /></label>
              <label>
                งานที่ไม่ส่ง
                <select name="missingItem" defaultValue={policy.missingItem} disabled={!isAdmin}>
                  <option value="zero">คิดเป็น 0 คะแนน</option>
                  <option value="exclude">ไม่นำมาคิด</option>
                </select>
              </label>
            </div>
            <button className="primary-button" disabled={!isAdmin}>บันทึกนโยบายคะแนน</button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading"><h2>ความเป็นส่วนตัว</h2></div>
          <form onSubmit={(event) => void savePrivacy(event)}>
            <div className="form-grid">
              <label>เวอร์ชันนโยบายความยินยอม<input name="policyVersion" defaultValue={privacy.policyVersion} disabled={!isAdmin} /></label>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" name="showLeaderboard" defaultChecked={privacy.showLeaderboardToStudents} disabled={!isAdmin} />
              แสดง Leaderboard ให้นักเรียนเห็น
            </label>
            <label className="checkbox-row">
              <input type="checkbox" name="shareScores" defaultChecked={privacy.shareScoresWithParents} disabled={!isAdmin} />
              แชร์คะแนนกับผู้ปกครองที่ยินยอมแล้ว
            </label>
            <button className="primary-button" disabled={!isAdmin}>บันทึกนโยบายความเป็นส่วนตัว</button>
          </form>
        </article>
      </section>

      <AcademicSettingsPanel canEdit={isAdmin} onMessage={setMessage} />

      <section className="panel">
        <div className="panel-heading">
          <h2>เวอร์ชันและการอัปเดต</h2>
          <button
            className="secondary-button"
            onClick={() => void checkForUpdateNow()
              .then((checked) => setMessage(checked ? 'ตรวจหาอัปเดตแล้ว ถ้ามีเวอร์ชันใหม่จะมีแถบแจ้งขึ้นมา' : 'เบราว์เซอร์นี้ไม่รองรับการอัปเดตอัตโนมัติ'))
              .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'ตรวจหาอัปเดตไม่สำเร็จ'))}
          >
            ตรวจหาอัปเดต
          </button>
        </div>
        <ul className="health-list">
          <li><span className="health-dot ok" />เวอร์ชันแอป<strong>{APP_VERSION}</strong></li>
          <li><span className="health-dot ok" />รุ่นที่ build<strong>{formatBuildTime()}</strong></li>
          <li>
            <span className="health-dot ok" />ตรวจหาอัปเดตล่าสุด
            <strong>{lastChecked ? new Date(lastChecked).toLocaleString('th-TH') : 'ยังไม่เคยตรวจ'}</strong>
          </li>
        </ul>
        <p className="muted">
          แอปจะไม่รีโหลดเอง เมื่อพบเวอร์ชันใหม่จะขึ้นแถบให้กด "อัปเดตตอนนี้" งานที่ยังไม่ซิงก์ยังอยู่ในเครื่องหลังอัปเดต
        </p>
      </section>

      <section className="panel">
        <div className="panel-heading"><h2>Environment</h2></div>
        <ul className="health-list">
          <li><span className={`health-dot ${mode === 'cloud' ? 'ok' : 'warn'}`} />โหมดการทำงาน<strong>{mode === 'cloud' ? 'Cloud (Supabase)' : 'Preview (ข้อมูลจำลอง)'}</strong></li>
          <li><span className={`health-dot ${isCloudConfigured ? 'ok' : 'warn'}`} />Supabase configuration<strong>{isCloudConfigured ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}</strong></li>
          <li><span className="health-dot ok" />แหล่งข้อมูลปัจจุบัน<strong>{repository.kind === 'dexie' ? 'Dexie local-first' : 'Fixture (dev only)'}</strong></li>
          <li><span className="health-dot ok" />รายการรอซิงก์<strong>{snapshot.pendingSync}</strong></li>
        </ul>
      </section>

      {message && <div className="toast" role="status" onClick={() => setMessage(null)}>{message}</div>}
    </>
  );
}
