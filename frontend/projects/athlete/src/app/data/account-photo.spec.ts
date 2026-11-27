import { ATHLETE_AVATAR_MAX_BYTES } from './athlete-avatar-upload';
import { accountPhotoUrl, fetchAccountPhotoFile, isGenericAccountAvatar } from './account-photo';

function canvasBlob(
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 512,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext('2d')!, size);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

/** O avatar que o Google gera para conta sem foto: inicial branca, fundo liso. */
function googleInitialAvatar(background = '#78909c'): Promise<Blob> {
  return canvasBlob((ctx, size) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${size * 0.45}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', size / 2, size / 2);
  });
}

/** Foto de verdade: a cor varia pela imagem toda. */
function photoLike(): Promise<Blob> {
  return canvasBlob((ctx, size) => {
    const data = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data.data[i] = x;
        data.data[i + 1] = y;
        data.data[i + 2] = (x * y) % 256;
        data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
  }, 256);
}

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

    it('avatar de inicial do Google (conta sem foto) não vira foto de perfil', async () => {
      const blob = await googleInitialAvatar();
      expect(
        await fetchAccountPhotoFile(url, fakeFetch(new Response(blob, { status: 200 }))),
      ).toBeNull();
    });

    it('foto de verdade em PNG continua virando File', async () => {
      const blob = await photoLike();
      const file = await fetchAccountPhotoFile(url, fakeFetch(new Response(blob, { status: 200 })));
      expect(file?.type).toBe('image/png');
    });

    it('para de esperar no prazo', async () => {
      const hanging = ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')));
        })) as typeof fetch;
      expect(await fetchAccountPhotoFile(url, hanging, 10)).toBeNull();
    });
  });

  describe('isGenericAccountAvatar', () => {
    it('reconhece o avatar de inicial, em qualquer cor de fundo', async () => {
      expect(await isGenericAccountAvatar(await googleInitialAvatar())).toBeTrue();
      expect(await isGenericAccountAvatar(await googleInitialAvatar('#ef6c00'))).toBeTrue();
    });

    it('foto de verdade passa', async () => {
      expect(await isGenericAccountAvatar(await photoLike())).toBeFalse();
    });

    it('duas cores sem fundo dominante (logo) passa', async () => {
      const logo = await canvasBlob((ctx, size) => {
        ctx.fillStyle = '#1e3cc8';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(size / 2, 0, size / 2, size);
      }, 200);
      expect(await isGenericAccountAvatar(logo)).toBeFalse();
    });

    it('o que não decodifica não é julgado genérico', async () => {
      const broken = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
      expect(await isGenericAccountAvatar(broken)).toBeFalse();
    });
  });
});
