import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SQUAD_PHOTOS_LOADER, SquadPhotosStore, photoMapFromDocs, safePhotoUrl } from './squad-photos';

describe('fotos do Squad (espelho público)', () => {
  it('aceita só URL https', () => {
    expect(safePhotoUrl('https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg');
    expect(safePhotoUrl('  https://cdn.test/a.jpg ')).toBe('https://cdn.test/a.jpg');
    expect(safePhotoUrl('http://cdn.test/a.jpg')).toBeNull();
    expect(safePhotoUrl('javascript:alert(1)')).toBeNull();
    expect(safePhotoUrl('')).toBeNull();
    expect(safePhotoUrl(null)).toBeNull();
  });

  it('monta o mapa uid → foto, ignorando quem não tem foto válida', () => {
    const map = photoMapFromDocs([
      { id: 'jv', data: { name: 'João', photoUrl: 'https://cdn.test/jv.jpg' } },
      { id: 'rb', data: { name: 'Rayssa', photoUrl: null } },
      { id: 'x', data: { photoUrl: 'ftp://x' } },
    ]);
    expect(map.get('jv')).toBe('https://cdn.test/jv.jpg');
    expect(map.has('rb')).toBeFalse();
    expect(map.has('x')).toBeFalse();
  });

  describe('SquadPhotosStore', () => {
    function setup(loader: () => Promise<ReadonlyMap<string, string>>) {
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), { provide: SQUAD_PHOTOS_LOADER, useValue: loader }],
      });
      return TestBed.inject(SquadPhotosStore);
    }

    it('carrega uma vez só e devolve a foto por uid', async () => {
      let calls = 0;
      const store = setup(async () => {
        calls += 1;
        return new Map([['jv', 'https://cdn.test/jv.jpg']]);
      });
      store.load();
      store.load();
      await Promise.resolve();
      await Promise.resolve();
      expect(calls).toBe(1);
      expect(store.photoOf('jv')).toBe('https://cdn.test/jv.jpg');
      expect(store.photoOf('rb')).toBeNull();
    });

    it('falha ao carregar: fica sem foto (as iniciais seguem)', async () => {
      const store = setup(() => Promise.reject(new Error('offline')));
      store.load();
      await Promise.resolve();
      await Promise.resolve();
      expect(store.photoOf('jv')).toBeNull();
    });
  });
});
