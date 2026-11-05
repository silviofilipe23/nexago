/**
 * Vídeo do bloco `video` do blog: só https em YouTube ou Instagram (mesma lista do servidor,
 * `functions/src/blog.ts`). O site não embute player — mostra a miniatura e abre o link fora.
 */
export type VideoProvider = 'youtube' | 'instagram';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** De onde é o vídeo, ou null se a URL não for https de um host aceito. */
export function videoProvider(url: string): VideoProvider | null {
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (hostIs(host, 'youtube.com') || host === 'youtu.be') return 'youtube';
  if (hostIs(host, 'instagram.com')) return 'instagram';
  return null;
}

/**
 * Id do vídeo do YouTube em `youtu.be/<id>`, `youtube.com/watch?v=<id>`, `/shorts/<id>`,
 * `/embed/<id>` e `/live/<id>`. null quando não há um id válido (link de canal, playlist...).
 */
export function youtubeVideoId(url: string): string | null {
  const u = parse(url);
  if (!u || videoProvider(url) !== 'youtube') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (u.hostname.toLowerCase() === 'youtu.be') {
    id = parts[0];
  } else if (parts[0] === 'watch') {
    id = u.searchParams.get('v');
  } else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) {
    id = parts[1];
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

export function youtubeThumbnailUrl(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
