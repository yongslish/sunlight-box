/**
 * 预加载图片；超时后 reject，避免一直卡在 10s+
 */
export function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

export function preloadImageWithTimeout(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ok ? resolve(url) : reject(new Error('image load failed'));
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}
