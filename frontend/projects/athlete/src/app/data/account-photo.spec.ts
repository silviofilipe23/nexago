import { ATHLETE_AVATAR_MAX_BYTES } from './athlete-avatar-upload';
import { accountPhotoUrl, fetchAccountPhotoFile } from './account-photo';

function fakeFetch(response: Response | Error): typeof fetch {
  return (() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))) as typeof fetch;
}

describe('account-photo', () => {
  describe('accountPhotoUrl', () => {
    it('pede a foto do Google em 512 px', () => {
      expect(accountPhotoUrl('https://lh3.googleusercontent.com/a/ACg8oc=s96-c')).toBe(
        'https://lh3.googleusercontent.com/a/ACg8oc=s512-c',
      );
      expect(accountPhotoUrl('https://lh3.googleusercontent.com/a/x=s96')).toBe(
        'https://lh3.googleusercontent.com/a/x=s512-c',
      );
    });

    it('outra origem passa como veio; vazio ou sem https não serve', () => {
      expect(accountPhotoUrl('https://cdn.example.com/p.jpg')).toBe('https://cdn.example.com/p.jpg');
      expect(accountPhotoUrl(null)).toBeNull();
      expect(accountPhotoUrl('  ')).toBeNull();
      expect(accountPhotoUrl('http://lh3.googleusercontent.com/a/x=s96-c')).toBeNull();
      expect(accountPhotoUrl('não é url')).toBeNull();
    });
  });

  describe('fetchAccountPhotoFile', () => {
    const url = 'https://lh3.googleusercontent.com/a/x=s512-c';

    it('imagem da conta vira um File aceito pelo upload do avatar', async () => {
      const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
      const file = await fetchAccountPhotoFile(url, fakeFetch(new Response(blob, { status: 200 })));
      expect(file).not.toBeNull();
      expect(file!.type).toBe('image/jpeg');
      expect(file!.name).toBe('foto-da-conta.jpg');
    });

    it('erro HTTP, rede, tipo errado, vazio ou grande demais devolvem null', async () => {
      const html = new Blob(['<html>'], { type: 'text/html' });
      const big = new Blob([new Uint8Array(ATHLETE_AVATAR_MAX_BYTES + 1)], { type: 'image/png' });
      const empty = new Blob([], { type: 'image/png' });
      expect(await fetchAccountPhotoFile(url, fakeFetch(new Response(null, { status: 404 })))).toBeNull();
      expect(await fetchAccountPhotoFile(url, fakeFetch(new Error('offline')))).toBeNull();
      expect(await fetchAccountPhotoFile(url, fakeFetch(new Response(html, { status: 200 })))).toBeNull();
      expect(await fetchAccountPhotoFile(url, fakeFetch(new Response(big, { status: 200 })))).toBeNull();
      expect(await fetchAccountPhotoFile(url, fakeFetch(new Response(empty, { status: 200 })))).toBeNull();
    });

    it('para de esperar no prazo', async () => {
      const hanging = ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
        })) as typeof fetch;
      expect(await fetchAccountPhotoFile(url, hanging, 10)).toBeNull();
    });
  });
});
