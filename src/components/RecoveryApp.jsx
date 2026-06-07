import { useCallback, useEffect, useRef, useState } from 'react';
import { BreathChart, MoodChart, StreakChart, TomatoChart, WushuChart } from './RecoveryCharts.jsx';
import { ForestPomodoro } from './ForestPomodoro.jsx';
import { BreathPondSection } from './BreathPondSection.jsx';
import { HourlyTodoSection } from './HourlyTodoSection.jsx';
import {
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
  MOOD_LABELS,
  buildDailyReport,
  calcScore,
  exportMarkdown,
  formatCheckInStatus,
  getRecordByDate,
  getTodayRecord,
  initRecoveryMidnightCheck,
  loadAchievements,
  loadStreak,
  markCheckedInToday,
  markSkippedToday,
  todayISO,
  updateTodayRecord,
} from '../utils/recoveryStorage.js';

const MOODS = [
  { v: 1, icon: '😞' },
  { v: 2, icon: '😐' },
  { v: 3, icon: '🙂' },
  { v: 4, icon: '😊' },
  { v: 5, icon: '😌' },
];

const HABITS = [
  { key: 'sleepEarly', label: '早睡早起' },
  { key: 'eatRegular', label: '三餐规律' },
  { key: 'drinkWater', label: '多喝水' },
  { key: 'walk', label: '散步' },
  { key: 'read', label: '阅读' },
  { key: 'meditate', label: '冥想' },
];

const TABS = [
  { key: 'checkin',  icon: '✅', label: '打卡' },
  { key: 'focus',    icon: '🌳', label: '专注' },
  { key: 'journal',  icon: '📊', label: '记录' },
];

function RecoveryCard({ children, className = '', delay = 0 }) {
  return (
    <section className={`recovery-card recovery-card-enter ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </section>
  );
}

function AchievementToast({ achievement, onClose }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 4200);
    return () => clearTimeout(t);
  }, [onClose]);
  if (!achievement) return null;
  return (
    <div className="recovery-achievement-toast" role="status">
      <div className="recovery-achievement-glow" aria-hidden />
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a962]/70">成就解锁</p>
      <p className="mt-1 text-lg font-medium text-[#fff8e7]">{achievement.title}</p>
      <p className="mt-1 text-sm text-[#fff8e7]/55">{achievement.desc}</p>
    </div>
  );
}

// ====== 反向地理编码：坐标 → 地名（多 API 竞争，取最快成功的） ======
async function reverseGeocode(lat, lng) {
  // 方案1: bigdatacloud — 免费无需 key，全球可用
  const p1 = (async () => {
    try {
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const d = await res.json();
      if (d) {
        const parts = [d.city, d.principalSubdivision, d.countryName]
          .filter(Boolean);
        if (parts.length) return parts.join(', ');
        if (d.locality) return d.locality;
      }
      return null;
    } catch { return null; }
  })();

  // 方案2: Nominatim（可能被墙，仅后备）
  const p2 = (async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=zh`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SunlightBox/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const d = await res.json();
      if (d?.display_name) {
        const parts = d.display_name.split(',');
        const short = parts.slice(0, 3).join(',').trim();
        return short.length > 40 ? short.slice(0, 40) + '…' : short;
      }
      return null;
    } catch { return null; }
  })();

  // 谁先返回用谁
  const [r1, r2] = await Promise.allSettled([p1, p2]);
  for (const r of [r1, r2]) {
    if (r.status === 'fulfilled' && r.value) return r.value;
  }
  return null;
}

// ====== IP 地理定位后备方案（多 API 交叉验证） ======
async function fetchFromIpSb() {
  try {
    const res = await fetch('https://api.ip.sb/geoip', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d && d.latitude && d.longitude) {
      return { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region, country: d.country };
    }
    return null;
  } catch { return null; }
}

async function fetchFromIpApi() {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon',
      { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (d?.status === 'success' && d.lat && d.lon) {
      return { lat: d.lat, lng: d.lon, city: d.city, region: d.regionName, country: d.country };
    }
    return null;
  } catch { return null; }
}

async function getIPLocation() {
  // 并行请求两个 API，用先返回的结果
  const [r1, r2] = await Promise.allSettled([fetchFromIpSb(), fetchFromIpApi()]);

  // 优先 ip.sb（国内精度高），其次 ip-api
  let pick = null;
  for (const r of [r1, r2]) {
    if (r.status === 'fulfilled' && r.value?.lat) {
      pick = r.value;
      break;
    }
  }
  if (!pick) return null;

  const nameParts = [pick.city, pick.region, pick.country].filter(Boolean);
  return {
    lat: pick.lat,
    lng: pick.lng,
    name: nameParts.join(', '),
  };
}

// ====== 摄像头拍照打卡 ======
function CameraModal({ onPhoto, onGeo }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError('无法访问摄像头，请检查权限设置');
      }
    })();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || capturing) return;
    setCapturing(true);

    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const time = new Date().toISOString();

    // 立即保存照片并关闭相机，地理位置后台获取
    onPhoto(dataUrl, { lat: null, lng: null, name: null, time, pending: true });

    // 异步获取地理位置
    let geo = null;
    if (navigator.geolocation) {
      geo = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            // 反向地理编码 + IP 地名 并行，取先到的地名
            const [rcName, ipLoc] = await Promise.allSettled([
              reverseGeocode(lat, lng),
              getIPLocation(),
            ]);
            const name = (rcName.status === 'fulfilled' && rcName.value)
              || (ipLoc.status === 'fulfilled' && ipLoc.value?.name)
              || null;
            resolve({ lat, lng, name });
          },
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 300000 }
        );
      });
    }
    if (!geo) {
      geo = await getIPLocation();
    }
    if (geo && geo.lat != null) {
      onGeo(geo);
    }
  };

  return (
    <div className="camera-modal">
      <div className="camera-view">
        {error ? (
          <p className="camera-error">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
      <div className="camera-actions">
        <button type="button" className="camera-btn camera-btn--capture" onClick={capture} disabled={!!error || capturing}>
          {capturing ? '⏳ 处理中...' : '📸 拍照打卡'}
        </button>
      </div>
    </div>
  );
}

// ====== 打卡页 ======
function CheckinTab({ record, streak, score, onCheckIn, onSkip, onPatch, onNote,
                      onExerciseOpen, habitsOpen, setHabitsOpen, onOpenCamera }) {
  const todayPhoto = record.photoDate === todayISO() ? record.photo : null;
  const photoTime = record.photoDate === todayISO() ? record.photoTime : null;
  const photoGeo = record.photoDate === todayISO() ? record.photoGeo : null;
  const cameraInputRef = useRef(null);

  return (
    <div className="recovery-tab-content">
      {/* 打卡概览 */}
      <RecoveryCard delay={0}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs text-[#fff8e7]/40">连续打卡</p>
            <p className="recovery-streak-num mt-1 tabular-nums">{streak.current}</p>
            <p className="mt-2 text-xs text-[#fff8e7]/45">
              历史最高：<span className="text-[#8b5cf6]/80">{streak.max}</span> 天
            </p>
          </div>
          <div className="recovery-score-ring flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full"
            style={{ borderColor: 'rgba(139,92,246,0.35)' }}>
            <span className="text-[10px] text-[#fff8e7]/45">今日评分</span>
            <span className="mt-0.5 text-3xl font-semibold tabular-nums text-[#8b5cf6]">{score}</span>
            <span className="text-[10px] text-[#fff8e7]/35">分</span>
          </div>
        </div>
      </RecoveryCard>

      {/* 打卡按钮 + 拍照 */}
      <RecoveryCard delay={40} className="mt-4">
        <h2 className="recovery-section-title">今日打卡</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button"
            className={`recovery-btn-success flex-1 min-w-[7rem] ${record.checkedIn ? 'tab-btn--active' : ''}`}
            onClick={onCheckIn}>
            ✅ 今日已打卡
          </button>
          <button type="button" className="recovery-btn-ghost flex-1 min-w-[7rem]" onClick={onSkip}>
            ↩️ 重置打卡
          </button>
        </div>
        <p className="mt-2 text-xs text-[#fff8e7]/40">状态：{formatCheckInStatus(record)}</p>

        {/* 拍照打卡 */}
        <div className="mt-5 pt-4 border-t border-[#fff8e7]/[0.06]">
          <button type="button" className="camera-trigger-btn w-full" onClick={onOpenCamera}>
            📷 {todayPhoto ? '更新今日自拍' : '拍照打卡记录心情'}
          </button>
          {todayPhoto && (
            <div className="mt-3 flex flex-col items-center gap-1">
              <img src={todayPhoto} alt="今日打卡照" className="camera-preview-thumb" />
              {photoTime && (
                <div className="mt-1 flex flex-col items-center gap-0.5 text-[11px] text-[#fff8e7]/50">
                  <span>🕐 {new Date(photoTime).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  {photoGeo && photoGeo.lat != null && (
                    photoGeo.name
                      ? <span className="text-[#c9a962]/70">📍 {photoGeo.name}</span>
                      : <span className="text-[#fff8e7]/30">📍 {photoGeo.lat.toFixed(4)}, {photoGeo.lng.toFixed(4)}</span>
                  )}
                </div>
              )}
            </div>
          )}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onPatch({
                photo: reader.result,
                photoDate: todayISO(),
                photoTime: new Date().toISOString(),
                photoGeo: null,
              });
              reader.readAsDataURL(file);
            }} />
        </div>
      </RecoveryCard>

      {/* 情绪 + 运动 + 习惯 + 感悟 */}
      <RecoveryCard delay={80} className="mt-4">
        <div>
          <p className="mb-3 text-xs text-[#fff8e7]/40">今日情绪</p>
          <div className="flex justify-between gap-1 sm:gap-2">
            {MOODS.map((m) => (
              <button key={m.v} type="button" aria-label={MOOD_LABELS[m.v]}
                className={`recovery-mood-btn ${record.mood === m.v ? 'recovery-mood-btn--active' : ''}`}
                onClick={() => onPatch({ mood: m.v })}>
                <span className="text-2xl">{m.icon}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <button type="button" className="recovery-btn-outline w-full" onClick={onExerciseOpen}>
            💪 今日运动
            {record.exerciseMin > 0 && <span className="ml-2 text-[#8b5cf6]">{record.exerciseMin} 分钟</span>}
          </button>
        </div>

        <div className="mt-6">
          <button type="button" className="tab-expand-trigger flex w-full items-center justify-between text-sm text-[#fff8e7]/55"
            onClick={() => setHabitsOpen((o) => !o)} aria-expanded={habitsOpen}>
            <span>作息与习惯</span>
            <span className={`tab-chevron ${habitsOpen ? 'tab-chevron--open' : ''}`}>›</span>
          </button>
          <div className={`tab-collapse ${habitsOpen ? 'tab-collapse--open' : ''}`}>
            <div className="grid grid-cols-2 gap-2 pt-4 sm:grid-cols-3">
              {HABITS.map((h) => (
                <label key={h.key} className="recovery-check">
                  <input type="checkbox" checked={!!record[h.key]} onChange={(e) => onPatch({ [h.key]: e.target.checked })} />
                  <span>{h.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs text-[#fff8e7]/40">今日一句话</p>
          <textarea className="recovery-textarea" rows={3} placeholder="安静记录此刻…"
            value={record.dailyNote || ''} onChange={(e) => onNote(e.target.value)} />
        </div>
      </RecoveryCard>
    </div>
  );
}

// ====== 专注页 ======
function FocusTab({ record, onSave }) {
  const [focusView, setFocusView] = useState('forest');

  return (
    <div className="recovery-tab-content">
      <div className="focus-subnav">
        <button type="button"
          className={`focus-subnav-btn ${focusView === 'forest' ? 'focus-subnav-btn--active' : ''}`}
          onClick={() => setFocusView('forest')}>🌳 专注森林</button>
        <button type="button"
          className={`focus-subnav-btn ${focusView === 'breath' ? 'focus-subnav-btn--active' : ''}`}
          onClick={() => setFocusView('breath')}>🫁 呼吸冥想</button>
      </div>

      <div style={{ display: focusView === 'forest' ? 'block' : 'none' }}>
        <RecoveryCard delay={0}>
          <p className="text-xs text-[#fff8e7]/35 mb-4">专注时种一棵树，树随专注时间成长</p>
          <ForestPomodoro record={record} onSave={onSave} />
        </RecoveryCard>
      </div>

      <div style={{ display: focusView === 'breath' ? 'block' : 'none' }}>
        <RecoveryCard delay={0}>
          <p className="text-xs text-[#fff8e7]/35 mb-2">跟随节奏深呼吸，平复心绪</p>
          <BreathPondSection record={record} onSave={onSave} />
        </RecoveryCard>
      </div>
    </div>
  );
}

// ====== 记录页 ======
function JournalTab({ record, onPatch, refreshKey, reportDate, setReportDate,
                      reportText, copyMarkdown, downloadMarkdown, wushuMode, setWushuMode, unlocked }) {
  return (
    <div className="recovery-tab-content">
      <HourlyTodoSection record={record} onPatch={onPatch} />

      <RecoveryCard delay={100} className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="recovery-section-title">今日日报</h2>
          <div className="flex flex-wrap gap-2">
            <input type="date" className="recovery-date-input" value={reportDate} max={todayISO()} onChange={(e) => setReportDate(e.target.value)} />
            <button type="button" className="recovery-btn-ghost text-xs" onClick={copyMarkdown}>复制 MD</button>
            <button type="button" className="recovery-btn-ghost text-xs" onClick={downloadMarkdown}>导出</button>
          </div>
        </div>
        <pre className="recovery-report mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#fff8e7]/65">{reportText}</pre>
      </RecoveryCard>

      <RecoveryCard delay={140} className="mt-4">
        <h2 className="recovery-section-title">趋势</h2>
        <p className="mt-4 mb-2 text-xs text-[#fff8e7]/40">连续打卡</p>
        <StreakChart refreshKey={refreshKey} />
        <p className="mt-6 mb-2 text-xs text-[#fff8e7]/40">情绪波动（30天）</p>
        <MoodChart refreshKey={refreshKey} />
        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-[#fff8e7]/40">运动时长</p>
          <div className="flex gap-1 rounded-full border border-[#fff8e7]/10 p-0.5">
            {['week', 'month'].map((m) => (
              <button key={m} type="button" className={`recovery-tab ${wushuMode === m ? 'recovery-tab--active' : ''}`}
                onClick={() => setWushuMode(m)}>{m === 'week' ? '周' : '月'}</button>
            ))}
          </div>
        </div>
        <WushuChart refreshKey={refreshKey} mode={wushuMode} />
        <p className="mt-6 mb-2 text-xs text-[#fff8e7]/40">近30天有效番茄</p>
        <TomatoChart refreshKey={refreshKey} />
        <p className="mt-6 mb-2 text-xs text-[#fff8e7]/40">近30天呼吸轮次</p>
        <BreathChart refreshKey={refreshKey} />
      </RecoveryCard>

      <RecoveryCard delay={180} className="mt-4 mb-4">
        <h2 className="recovery-section-title">成就</h2>
        <p className="mt-1 text-xs text-[#fff8e7]/35">已解锁 {unlocked.length} / {ACHIEVEMENTS.length}</p>
        {ACHIEVEMENT_GROUPS.map((group) => (
          <div key={group.key} className="mt-5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#c9a962]/55">{group.label}</h3>
            <ul className="mt-2 space-y-2">
              {ACHIEVEMENTS.filter((a) => a.group === group.key).map((a) => {
                const done = unlocked.includes(a.id);
                return (
                  <li key={a.id} className={`recovery-achievement-item ${done ? 'recovery-achievement-item--done' : ''}`}>
                    <span className="recovery-achievement-dot" aria-hidden />
                    <div>
                      <p className="font-medium text-[#fff8e7]/85">{a.title}</p>
                      <p className="text-xs text-[#fff8e7]/40">{a.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </RecoveryCard>
    </div>
  );
}

// ====== 底部 Tab 栏 ======
function BottomTabs({ active, onChange }) {
  return (
    <nav className="bottom-tabs">
      {TABS.map(tab => (
        <button key={tab.key} type="button"
          className={`bottom-tab ${active === tab.key ? 'bottom-tab--active' : ''}`}
          onClick={() => onChange(tab.key)}>
          <span className="bottom-tab-icon">{tab.icon}</span>
          <span className="bottom-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ====== 主组件 ======
export function RecoveryApp({ onBack, entering }) {
  const [record, setRecord] = useState(() => getTodayRecord());
  const [streak, setStreak] = useState(() => loadStreak());
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('checkin');
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [customMin, setCustomMin] = useState('');
  const [reportDate, setReportDate] = useState(todayISO());
  const [exerciseMode, setExerciseMode] = useState('week');
  const [toastAchievement, setToastAchievement] = useState(null);
  const noteTimer = useRef(null);

  const bump = useCallback((result) => {
    setRecord(result.record);
    setStreak(result.streak);
    setRefreshKey((k) => k + 1);
    if (result.newly?.length) {
      setToastAchievement(result.newly[result.newly.length - 1]);
    }
  }, []);

  useEffect(() => initRecoveryMidnightCheck(), []);

  useEffect(() => {
    const r = getTodayRecord();
    setRecord(r);
    setStreak(loadStreak());
  }, []);

  const handleCheckIn = () => bump(markCheckedInToday());
  const handleSkip = () => bump(markSkippedToday());
  const patch = (partial) => bump(updateTodayRecord(partial));
  const saveFullRecord = (fullRecord) => bump(updateTodayRecord(fullRecord));
  const handleNote = (text) => {
    setRecord((prev) => ({ ...prev, dailyNote: text }));
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => bump(updateTodayRecord({ dailyNote: text })), 400);
  };

  const handlePhoto = (dataUrl, geo) => {
    const patchData = {
      photo: dataUrl,
      photoDate: todayISO(),
      photoTime: geo?.time || new Date().toISOString(),
    };
    patch(patchData);
    setCameraOpen(false);
  };

  const handleGeo = (g) => {
    if (g && g.lat != null) {
      bump(updateTodayRecord({ photoGeo: { lat: g.lat, lng: g.lng, name: g.name || null } }));
    }
  };

  const reportRecord = reportDate === todayISO() ? record : getRecordByDate(reportDate);
  const reportText = buildDailyReport(reportRecord ?? getTodayRecord(), streak, reportDate);
  const unlocked = loadAchievements();
  const score = record.score ?? calcScore(record);

  const copyMarkdown = async () => {
    const md = exportMarkdown(reportRecord ?? record, streak);
    try { await navigator.clipboard.writeText(md); } catch {
      const ta = document.createElement('textarea'); ta.value = md;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
  };
  const downloadMarkdown = () => {
    const md = exportMarkdown(reportRecord ?? record, streak);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `recovery-${reportDate}.md`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="recovery-page fixed inset-0 z-[100] overflow-hidden bg-[#8b1515] text-[#fff8e7]/90 flex flex-col">
      {/* 朱红光晕 */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="absolute top-[-15%] left-[30%] w-[70%] h-[140%] rounded-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(240,70,40,0.14) 0%, transparent 65%)' }} />
        <div className="absolute bottom-[-10%] right-[20%] w-[60%] h-[120%] rounded-full"
          style={{ background: 'radial-gradient(ellipse at center, rgba(220,50,30,0.1) 0%, transparent 60%)' }} />
      </div>

      {/* Header */}
      <header className="tab-header shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#fff8e7]/[0.06] bg-[#8b1515]/95">
        <button type="button" onClick={onBack} className="recovery-btn-ghost text-sm">← 日光</button>
        <span className="text-[11px] uppercase tracking-[0.2em] text-[#fff8e7]/30">
          {TABS.find(t => t.key === activeTab)?.label || '打卡'}
        </span>
        <span className="w-12" />
      </header>

      {/* 内容区 — 所有 Tab 常驻，通过 CSS display 切换 */}
      <div className="tab-body flex-1 overflow-y-auto px-4 pb-2">
        <div style={{ display: activeTab === 'checkin' ? 'block' : 'none' }}>
          <CheckinTab record={record} streak={streak} score={score}
            onCheckIn={handleCheckIn} onSkip={handleSkip} onPatch={patch} onNote={handleNote}
            onExerciseOpen={() => setExerciseOpen(true)}
            onOpenCamera={() => setCameraOpen(true)}
            habitsOpen={habitsOpen} setHabitsOpen={setHabitsOpen} />
        </div>
        <div style={{ display: activeTab === 'focus' ? 'block' : 'none' }}>
          <FocusTab record={record} onSave={saveFullRecord} />
        </div>
        <div style={{ display: activeTab === 'journal' ? 'block' : 'none' }}>
          <JournalTab record={record} onPatch={patch}
            refreshKey={refreshKey} reportDate={reportDate} setReportDate={setReportDate}
            reportText={reportText} copyMarkdown={copyMarkdown} downloadMarkdown={downloadMarkdown}
            wushuMode={exerciseMode} setWushuMode={setExerciseMode} unlocked={unlocked} />
        </div>
      </div>

      {/* 底部 Tab */}
      <BottomTabs active={activeTab} onChange={setActiveTab} />

      {/* 运动弹窗 */}
      {exerciseOpen && (
        <div className="recovery-modal-backdrop" onClick={() => setExerciseOpen(false)}>
          <div className="recovery-modal recovery-modal--fade" onClick={(e) => e.stopPropagation()}>
            <h3 className="recovery-modal-title">今日运动</h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[15, 30, 60].map((min) => (
                <button key={min} type="button" className="recovery-btn-outline"
                  onClick={() => { patch({ exerciseMin: min }); setExerciseOpen(false); }}>{min} 分</button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <input type="number" min={1} max={300} placeholder="自定义分钟" className="recovery-input flex-1"
                value={customMin} onChange={(e) => setCustomMin(e.target.value)} />
              <button type="button" className="recovery-btn-primary" onClick={() => {
                const n = parseInt(customMin, 10);
                if (n > 0) { patch({ exerciseMin: n }); setExerciseOpen(false); setCustomMin(''); }
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 拍照弹窗 */}
      {cameraOpen && (
        <div className="recovery-modal-backdrop" onClick={() => setCameraOpen(false)}>
          <div className="recovery-modal recovery-modal--fade" onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="recovery-modal-header">
              <h3 className="recovery-modal-title">拍照打卡</h3>
              <button type="button" className="recovery-modal-close" onClick={() => setCameraOpen(false)}
                aria-label="关闭">✕</button>
            </div>
            <CameraModal onPhoto={handlePhoto} onGeo={handleGeo} />
            <button type="button" className="recovery-btn-ghost w-full mt-3 text-xs"
              onClick={() => setCameraOpen(false)}>取消</button>
          </div>
        </div>
      )}

      <AchievementToast achievement={toastAchievement} onClose={() => setToastAchievement(null)} />
    </div>
  );
}