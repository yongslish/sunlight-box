import { useCallback, useEffect, useRef, useState } from 'react';
import { pickCuratedBackdrop } from '../services/whisperImage.js';

/**
 * 文案始终可见；图片用 <img onLoad/onError>，失败自动换下一张
 */
export function SunWhisper({ quote, backdropPromise, onDismiss }) {
  const [backdrop, setBackdrop] = useState(null);
  const [displaySrc, setDisplaySrc] = useState(null);
  const [imageReady, setImageReady] = useState(false);
  const [loadStatus, setLoadStatus] = useState('loading');
  const retryRef = useRef(0);

  const applyBackdrop = useCallback((data) => {
    const url = data?.previewUrl ?? data?.imageUrl ?? data?.fastUrl;
    if (!url) return false;
    setBackdrop(data);
    setDisplaySrc(url);
    setLoadStatus('loading');
    setImageReady(false);
    return true;
  }, []);

  const tryNextBackdrop = useCallback(() => {
    if (retryRef.current >= 6) {
      setLoadStatus('fallback');
      setImageReady(false);
      setDisplaySrc(null);
      return;
    }
    retryRef.current += 1;

    const next = pickCuratedBackdrop();
    applyBackdrop(next);
  }, [applyBackdrop]);

  const handleImgLoad = useCallback(() => {
    setImageReady(true);
    setLoadStatus('ready');
  }, []);

  const handleImgError = useCallback(() => {
    tryNextBackdrop();
  }, [tryNextBackdrop]);

  useEffect(() => {
    let cancelled = false;
    retryRef.current = 0;

    const start = async () => {
      const local = pickCuratedBackdrop();
      if (cancelled) return;
      applyBackdrop(local);

      let remote = null;
    try {
      remote = backdropPromise
        ? await Promise.race([
            Promise.resolve(backdropPromise),
            new Promise((_, rej) => setTimeout(() => rej(), 6000)),
          ])
        : null;
    } catch {
      remote = null;
    }

      if (cancelled || !remote) return;

      const remoteUrl = remote.previewUrl ?? remote.imageUrl;
      const localUrl = local.previewUrl ?? local.imageUrl;
      if (remoteUrl && remoteUrl !== localUrl) {
        applyBackdrop(remote);
      }
    };

    void start();

    return () => {
      cancelled = true;
    };
  }, [applyBackdrop, backdropPromise]);

  const showPhoto = Boolean(displaySrc && imageReady && loadStatus === 'ready');

  const creditLabel =
    backdrop?.credit?.source === 'pexels'
      ? 'Pexels'
      : backdrop?.credit?.source === 'unsplash' ||
          backdrop?.credit?.source === 'cdn'
        ? 'Unsplash'
        : backdrop?.credit?.source === 'local'
          ? 'Nature'
          : null;

  return (
    <button
      type="button"
      className="sun-whisper-screen fixed inset-0 z-50 flex cursor-pointer flex-col border-0 p-0 outline-none"
      style={{ backgroundColor: '#0A0A0F' }}
      onClick={onDismiss}
      aria-label="轻触返回主界面"
    >
      <div
        className={`sun-whisper-fallback pointer-events-none absolute inset-0 transition-opacity duration-500 ${showPhoto ? 'opacity-0' : 'opacity-100'}`}
        aria-hidden
      />

      {displaySrc && loadStatus !== 'fallback' && (
        <img
          key={displaySrc}
          src={displaySrc}
          alt=""
          decoding="async"
          onLoad={handleImgLoad}
          onError={handleImgError}
          className={`sun-whisper-photo pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${showPhoto ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            linear-gradient(to top, rgba(10,10,15,0.88) 0%, rgba(10,10,15,0.25) 42%, rgba(10,10,15,0.4) 100%),
            radial-gradient(ellipse 85% 55% at 50% 88%, rgba(255,209,102,0.18) 0%, transparent 58%)
          `,
        }}
        aria-hidden
      />

      <div className="relative z-10 flex min-h-full flex-col items-center justify-center px-8 py-16">
        <p className="sun-whisper-label pointer-events-none mb-8 text-sm font-semibold uppercase tracking-[0.28em] text-[#FFD166]/75">
          Sun Whisper · 日光低语
        </p>

        {quote && (
          <div className="pointer-events-none flex max-w-[min(92vw,32rem)] flex-col items-center gap-5 text-center">
            <p className="sun-whisper-quote-zh text-xl font-semibold leading-relaxed text-[#FFD166] sm:text-2xl">
              {quote.zh}
            </p>
            {quote.en?.trim() ? (
              <p className="sun-whisper-quote-en text-base font-medium leading-relaxed text-[#FFF8E7]/75 sm:text-lg">
                {quote.en}
              </p>
            ) : null}
          </div>
        )}

        {loadStatus === 'loading' && !imageReady && (
          <p className="sun-whisper-loading pointer-events-none mt-10 animate-pulse text-xs text-[#FFD166]/55">
            正在为你寻一片向上的光…
          </p>
        )}

        {loadStatus === 'fallback' && (
          <p className="pointer-events-none mt-10 text-[10px] text-[#FFD166]/40">
            背景光效 · 照片加载中或暂不可用
          </p>
        )}

        <p className="sun-whisper-hint pointer-events-none mt-14 text-xs text-[#FFD166]/45">
          轻触任意处返回
        </p>

        {backdrop?.credit?.photographer && showPhoto && creditLabel && (
          <p className="sun-whisper-credit pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 right-0 px-4 text-center text-[10px] text-white/45">
            Photo by{' '}
            <span className="text-white/60">{backdrop.credit.photographer}</span>
            {' · '}
            {creditLabel}
          </p>
        )}
      </div>
    </button>
  );
}
