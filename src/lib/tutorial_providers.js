const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const OEMBED_API = 'https://www.youtube.com/oembed';

export function parseYouTubeId(input) {
  const value = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || '';
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : '';
    }
    if (/(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtube-nocookie\.com$/.test(url.hostname)) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v') || '';
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : '';
      }
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : '';
    }
  } catch { /* no es una URL */ }
  return '';
}

function parseISODuration(value = '') {
  const match = String(value).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return (Number(match[1] || 0) * 86400) + (Number(match[2] || 0) * 3600) + (Number(match[3] || 0) * 60) + Number(match[4] || 0);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function providerInfo() {
  return [
    {
      id: 'youtube',
      name: 'YouTube',
      configured: true,
      searchConfigured: Boolean(process.env.YOUTUBE_API_KEY),
      requiresKeyForSearch: true,
      embedVerified: true,
      description: 'Reproducción mediante iframe y verificación de disponibilidad con oEmbed.'
    },
    {
      id: 'youtube-api',
      name: 'YouTube Data API v3',
      configured: Boolean(process.env.YOUTUBE_API_KEY),
      searchConfigured: Boolean(process.env.YOUTUBE_API_KEY),
      requiresKeyForSearch: true,
      embedVerified: true,
      description: 'Búsqueda e importación con metadatos oficiales; requiere YOUTUBE_API_KEY.'
    }
  ];
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message || `El proveedor respondió HTTP ${response.status}`), { status: 502 });
  }
  return body;
}

export async function verifyYouTubeVideo(input) {
  const videoId = parseYouTubeId(input);
  if (!videoId) throw Object.assign(new Error('Introduce una URL o un ID de YouTube válido.'), { status: 400 });
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const data = await fetchJSON(`${OEMBED_API}?url=${encodeURIComponent(url)}&format=json`);
    return {
      provider: 'youtube',
      videoId,
      url,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      title: String(data.title || '').slice(0, 240),
      channel: String(data.author_name || '').slice(0, 120),
      channelUrl: String(data.author_url || '').slice(0, 500),
      thumbnail: String(data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`).slice(0, 500),
      embeddable: true,
      verificationStatus: 'verified',
      verificationSource: 'YouTube oEmbed',
      lastCheckedAt: new Date().toISOString().slice(0, 10)
    };
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('No se pudo verificar el vídeo. Puede ser privado, eliminado o no permitir inserción.'), { status: 422 });
  }
}

export async function searchYouTube(query, limit = 6) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw Object.assign(new Error('La búsqueda en YouTube requiere configurar YOUTUBE_API_KEY. La biblioteca local sigue disponible.'), { status: 503 });
  }
  const maxResults = Math.max(1, Math.min(12, Number(limit) || 6));
  const searchUrl = new URL(`${YOUTUBE_API}/search`);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('videoEmbeddable', 'true');
  searchUrl.searchParams.set('safeSearch', 'moderate');
  searchUrl.searchParams.set('relevanceLanguage', 'es');
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('key', key);
  const search = await fetchJSON(searchUrl);
  const ids = (search.items || []).map(item => item.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const videosUrl = new URL(`${YOUTUBE_API}/videos`);
  videosUrl.searchParams.set('part', 'snippet,contentDetails,statistics,status');
  videosUrl.searchParams.set('id', ids.join(','));
  videosUrl.searchParams.set('key', key);
  const videos = await fetchJSON(videosUrl);
  const byId = new Map((videos.items || []).map(item => [item.id, item]));
  return ids.map(id => {
    const item = byId.get(id);
    if (!item) return null;
    const seconds = parseISODuration(item.contentDetails?.duration);
    return {
      provider: 'youtube',
      videoId: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      title: String(item.snippet?.title || '').slice(0, 240),
      channel: String(item.snippet?.channelTitle || '').slice(0, 120),
      channelUrl: item.snippet?.channelId ? `https://www.youtube.com/channel/${item.snippet.channelId}` : '',
      thumbnail: String(item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`).slice(0, 500),
      description: String(item.snippet?.description || '').slice(0, 500),
      durationSeconds: seconds,
      durationLabel: formatDuration(seconds),
      publishedAt: item.snippet?.publishedAt || null,
      viewCount: Number(item.statistics?.viewCount || 0) || null,
      embeddable: item.status?.embeddable !== false,
      verificationStatus: 'verified',
      verificationSource: 'YouTube Data API v3',
      lastCheckedAt: new Date().toISOString().slice(0, 10)
    };
  }).filter(Boolean);
}
