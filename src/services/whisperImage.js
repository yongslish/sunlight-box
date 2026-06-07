/**
 * Sun Whisper / Phoenix 背景图
 * 全部使用本地图片，不依赖网络
 */

const RECENT_PHOTOS_KEY = 'sunbox_whisper_recent_photos';
const RECENT_PHOTOS_MAX = 6;

/** 本地自然风景（林木主题为主） */
const LOCAL_BACKDROPS = [
  { file: '/whisper/01.jpg', photographer: 'Luca Bravo' },
  { file: '/whisper/02.jpg', photographer: 'Luca Bravo' },
  { file: '/whisper/03.jpg', photographer: 'Bryan Garcia' },
  { file: '/whisper/06.jpg', photographer: 'Luca Bravo' },
  { file: '/whisper/forest-02.webp', photographer: 'Nature Woods' },
];

function loadRecentPhotoIds() {
  try {
    const raw = sessionStorage.getItem(RECENT_PHOTOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentPhotoId(id) {
  const recent = loadRecentPhotoIds().filter((x) => x !== id);
  recent.unshift(id);
  sessionStorage.setItem(
    RECENT_PHOTOS_KEY,
    JSON.stringify(recent.slice(0, RECENT_PHOTOS_MAX))
  );
}

function buildLocalBackdrop(item) {
  const url = item.file;
  return {
    id: url,
    file: url,
    fastUrl: url,
    previewUrl: url,
    imageUrl: url,
    blurUrl: url,
    credit: { photographer: item.photographer, source: 'local' },
    source: 'local',
  };
}

/** 随机本地图 */
export function pickCuratedBackdrop() {
  const recent = loadRecentPhotoIds();
  let pool = LOCAL_BACKDROPS.filter((p) => !recent.includes(p.file));
  if (pool.length === 0) pool = LOCAL_BACKDROPS;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  saveRecentPhotoId(picked.file);
  return buildLocalBackdrop(picked);
}
