import { arenaImagePath, productImagePath, replacedProductImagePath, storagePathFromDownloadUrl } from './arena-image-path';

const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/volley-track-dev-4596c.firebasestorage.app/o/';
const urlOf = (path: string, token = 't1') => `${BUCKET}${encodeURIComponent(path)}?alt=media&token=${token}`;

describe('arenaImagePath', () => {
  it('põe o instante do envio no nome, pra nunca sobrescrever a imagem já salva', () => {
    expect(arenaImagePath('a1', 'cover', 1731500000000)).toBe('arenas/a1/cover-1731500000000');
    expect(arenaImagePath('a1', 'logo', 1731500000000)).toBe('arenas/a1/logo-1731500000000');
    expect(arenaImagePath('a1', 'site-about-2', 5)).toBe('arenas/a1/site-about-2-5');
    expect(arenaImagePath('a1', 'classes-cover', 5)).toBe('arenas/a1/classes-cover-5');
  });

  it('dois envios seguidos dão caminhos diferentes', () => {
    expect(arenaImagePath('a1', 'cover', 1)).not.toBe(arenaImagePath('a1', 'cover', 2));
  });

  it('capa e logo saem no formato que o storage.rules aceita do gestor', () => {
    const rulesName = /^(cover|logo)-[0-9]+$/;
    expect(arenaImagePath('a1', 'cover').split('/')[2]).toMatch(rulesName);
    expect(arenaImagePath('a1', 'logo').split('/')[2]).toMatch(rulesName);
  });
});

describe('productImagePath', () => {
  it('um arquivo por envio dentro da pasta de produtos, no formato do app', () => {
    expect(productImagePath('a1', 'p1', 1731500000000)).toBe('arenas/a1/products/p1-1731500000000.jpg');
  });
});

describe('storagePathFromDownloadUrl', () => {
  it('decodifica o caminho da download URL', () => {
    expect(storagePathFromDownloadUrl(urlOf('arenas/a1/products/p1-9.jpg'))).toBe('arenas/a1/products/p1-9.jpg');
  });

  it('URL externa, vazia ou malformada não vira caminho', () => {
    expect(storagePathFromDownloadUrl('https://example.com/o/arenas%2Fa1%2Fcover')).toBeNull();
    expect(storagePathFromDownloadUrl('')).toBeNull();
    expect(storagePathFromDownloadUrl(null)).toBeNull();
    expect(storagePathFromDownloadUrl(`${BUCKET}%E0%A4%A`)).toBeNull();
  });
});

describe('replacedProductImagePath', () => {
  const old = urlOf('arenas/a1/products/p1.jpg');
  const next = urlOf('arenas/a1/products/p1-9.jpg');

  it('foto trocada: apaga a antiga (inclusive a do nome fixo de antes)', () => {
    expect(replacedProductImagePath('a1', old, next)).toBe('arenas/a1/products/p1.jpg');
  });

  it('foto removida: apaga a antiga', () => {
    expect(replacedProductImagePath('a1', next, null)).toBe('arenas/a1/products/p1-9.jpg');
  });

  it('mesma foto (só o token mudou) não apaga nada', () => {
    expect(replacedProductImagePath('a1', next, urlOf('arenas/a1/products/p1-9.jpg', 't2'))).toBeNull();
  });

  it('nunca apaga fora da pasta de produtos desta arena', () => {
    expect(replacedProductImagePath('a1', urlOf('arenas/a1/cover-1'), next)).toBeNull();
    expect(replacedProductImagePath('a1', urlOf('arenas/a2/products/p1.jpg'), next)).toBeNull();
    expect(replacedProductImagePath('a1', 'https://example.com/foto.jpg', next)).toBeNull();
    expect(replacedProductImagePath('a1', undefined, next)).toBeNull();
  });
});
