import { useCallback, useEffect, useState } from 'react';
import { RecoveryApp } from './components/RecoveryApp.jsx';
import { RecoveryFab } from './components/RecoveryFab.jsx';
import { SunLight } from './components/SunLight.jsx';
import { PhoenixHost } from './components/PhoenixHost.jsx';
import { pickCuratedBackdrop } from './services/whisperImage.js';
import { SpiritualLeaderPage } from './phoenix/SpiritualLeaderPage.jsx';
import { loadLeaderSettings } from './phoenix/spiritualLeaderStorage.js';

export default function App() {
  const [screen, setScreen] = useState('main');
  const [whisperSession, setWhisperSession] = useState(null);
  const [recoveryEntering, setRecoveryEntering] = useState(false);
  const [leaderReturnScreen, setLeaderReturnScreen] = useState('main');

  useEffect(() => {
    const blockMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', blockMenu);
    return () => document.removeEventListener('contextmenu', blockMenu);
  }, []);

  /** 预热一张精选快图到浏览器缓存，加快首次 Whisper */
  useEffect(() => {
    const warm = pickCuratedBackdrop();
    const url = warm.fastUrl ?? warm.previewUrl;
    if (url) {
      const img = new Image();
      img.src = url;
    }
  }, []);

  const handleWhisperEnter = useCallback((session) => {
    setWhisperSession({
      quote: session.quote,
      forceGate: !!session.forceGate,
      autoOpenRecord: !!session.autoOpenRecord,
    });
    setScreen('phoenix');
  }, []);

  const handleWhisperDismiss = useCallback(() => {
    setScreen('main');
  }, []);

  const handleRecoveryEnter = useCallback(() => {
    setRecoveryEntering(true);
    setScreen('recovery');
    document.documentElement.classList.add('recovery-active');
    document.body.classList.add('recovery-active');
  }, []);

  const handleRecoveryDismiss = useCallback(() => {
    setScreen('main');
    setRecoveryEntering(false);
    document.documentElement.classList.remove('recovery-active');
    document.body.classList.remove('recovery-active');
  }, []);

  const handleLeaderEnter = useCallback(() => {
    if (!loadLeaderSettings().enabled) return;
    setLeaderReturnScreen((prev) => (screen === 'leader' ? prev : screen));
    setScreen('leader');
  }, [screen]);

  const handleLeaderDismiss = useCallback(() => {
    setScreen(leaderReturnScreen || 'main');
  }, [leaderReturnScreen]);

  if (screen === 'leader') {
    return <SpiritualLeaderPage onExit={handleLeaderDismiss} />;
  }

  if (screen === 'phoenix') {
    return (
      <PhoenixHost
        quote={whisperSession?.quote}
        forceGate={whisperSession?.forceGate}
        autoOpenRecord={whisperSession?.autoOpenRecord}
        onLeaderTrigger={handleLeaderEnter}
        onDismiss={handleWhisperDismiss}
      />
    );
  }

  if (screen === 'recovery') {
    return <RecoveryApp onBack={handleRecoveryDismiss} entering={recoveryEntering} />;
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#060e1a]">
      <SunLight onWhisperEnter={handleWhisperEnter} onLeaderEnter={handleLeaderEnter} />
      <RecoveryFab visible onOpen={handleRecoveryEnter} />
    </div>
  );
}
