import { videoProvider, youtubeVideoId } from './video';

describe('videoProvider', () => {
  it('aceita só https de YouTube/Instagram (com subdomínio)', () => {
    expect(videoProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(videoProvider('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(videoProvider('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(videoProvider('https://www.instagram.com/reel/Cx1/')).toBe('instagram');
  });

  it('recusa http, outros hosts e imitações do domínio', () => {
    expect(videoProvider('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoProvider('https://vimeo.com/1')).toBeNull();
    expect(videoProvider('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoProvider('https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoProvider('não é url')).toBeNull();
  });
});

describe('youtubeVideoId', () => {
  it('extrai o id de youtu.be, watch?v=, shorts/, embed/ e live/', () => {
    expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://youtube.com/shorts/aB3_-x9Kz0Q')).toBe('aB3_-x9Kz0Q');
    expect(youtubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('null para link sem vídeo, id inválido ou outro provedor', () => {
    expect(youtubeVideoId('https://www.youtube.com/@nexago')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/watch?v=curto')).toBeNull();
    expect(youtubeVideoId('https://youtu.be/')).toBeNull();
    expect(youtubeVideoId('https://www.instagram.com/reel/dQw4w9WgXcQ/')).toBeNull();
  });
});
