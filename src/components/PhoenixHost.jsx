import { useEffect, useRef, useState } from 'react';
import { PhoenixPage } from '../phoenix/PhoenixPage.js';
import { pickCuratedBackdrop } from '../services/whisperImage.js';

/** 凤凰页只用本地高清图，避免在线缩略图发糊 */
function pickPhoenixBackground() {
  const b = pickCuratedBackdrop();
  return b.file || b.imageUrl || b.fastUrl || '';
}
import '../phoenix/phoenix-page.css';
import '../phoenix/anxiety/anxiety-page.css';
import { PhoenixAnxietyModule } from '../phoenix/anxiety/PhoenixAnxietyModule.js';

/**
 * React 挂载层：只负责提供 #phoenix-page 容器与生命周期
 */
export function PhoenixHost({
  quote,
  onDismiss,
  forceGate = false,
  autoOpenRecord = false,
  onLeaderTrigger,
}) {
  const rootRef = useRef(null);
  const pageRef = useRef(null);
  const anxietyRef = useRef(null);
  const [backgroundSrc, setBackgroundSrc] = useState('');

  useEffect(() => {
    setBackgroundSrc(pickPhoenixBackground());
  }, [quote?.id]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const page = new PhoenixPage(el, {
      mainText: quote?.zh || '',
      // TODO: 精神纲领小字 — 可改为你自己的固定句
      mottoText: '向上，是冲破一切黑暗的终极钥匙',
      backgroundSrc: backgroundSrc || '',
      audioSrc: (() => { const a = ['/audio/the_cage.mp3', '/audio/pingpang2.mp3']; return a[Math.floor(Math.random() * a.length)]; })(),
      onBack: onDismiss,
      onLeaderTrigger,
      config: {
        lowPerformanceMode: false,
        enableMusic: true,
        enableEffects: true,
        enableEasterEgg: true,
      },
    });

    pageRef.current = page;
    page.init();

    const forceGateByEnv =
      import.meta.env.VITE_ANXIETY_GATE_DEBUG === '1' ||
      new URLSearchParams(window.location.search).get('anxietyGate') === '1';

    const anxiety = new PhoenixAnxietyModule(el, {
      lowPerformanceMode: false,
      forceGate: forceGate || forceGateByEnv,
      autoOpenRecord,
    });
    anxiety.init();
    anxietyRef.current = anxiety;

    return () => {
      anxiety.cleanup();
      anxietyRef.current = null;
      page.cleanup();
      pageRef.current = null;
    };
  }, [autoOpenRecord, forceGate, onDismiss, onLeaderTrigger, quote?.id, quote?.zh]);

  useEffect(() => {
    const img = pageRef.current?._els?.img;
    if (!img || !backgroundSrc) return;
    img.src = backgroundSrc;
    img.style.display = '';
    img.fetchPriority = 'high';
    img.decoding = 'async';
  }, [backgroundSrc]);

  return <div id="phoenix-page" ref={rootRef} />;
}
