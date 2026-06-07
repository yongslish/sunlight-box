import { BreathPondSection } from './BreathPondSection.jsx';
import { PomodoroSection } from './PomodoroSection.jsx';

export function FocusBreathModule({ record, onSave, delay = 200 }) {
  return (
    <section
      className="recovery-card recovery-card-enter mt-4"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="recovery-section-title">🍅专注呼吸｜止念定心</h2>
      <p className="mb-4 mt-1 text-xs text-[#fff8e7]/35">番茄锚定行动，荷塘呼吸平复内耗，数据本地保存</p>

      <PomodoroSection record={record} onSave={onSave} />
      <BreathPondSection record={record} onSave={onSave} />
    </section>
  );
}
