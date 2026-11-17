import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SQUAD_PHOTOS_LOADER } from '../../data/squad-photos';
import { AmbassadorAvatarComponent } from './ambassador-avatar.component';

describe('AmbassadorAvatarComponent', () => {
  async function render(inputs: { id: string; name: string; photoUrl?: string | null }, photos = new Map<string, string>()) {
    TestBed.configureTestingModule({
      imports: [AmbassadorAvatarComponent],
      providers: [provideZonelessChangeDetection(), { provide: SQUAD_PHOTOS_LOADER, useValue: async () => photos }],
    });
    const fixture = TestBed.createComponent(AmbassadorAvatarComponent);
    fixture.componentRef.setInput('id', inputs.id);
    fixture.componentRef.setInput('name', inputs.name);
    if (inputs.photoUrl !== undefined) fixture.componentRef.setInput('photoUrl', inputs.photoUrl);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const img = (el: HTMLElement) => el.querySelector('img');

  it('sem foto: as iniciais no tom da pessoa', async () => {
    const f = await render({ id: 'jv', name: 'João Victor' });
    const el = f.nativeElement as HTMLElement;
    expect(img(el)).toBeNull();
    expect(el.textContent?.trim()).toBe('JV');
  });

  it('foto do espelho público pelo uid', async () => {
    const f = await render({ id: 'jv', name: 'João Victor' }, new Map([['jv', 'https://cdn.test/jv.jpg']]));
    expect(img(f.nativeElement)?.getAttribute('src')).toBe('https://cdn.test/jv.jpg');
  });

  it('foto passada direto vence o espelho; URL insegura é ignorada', async () => {
    const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'https://cdn.test/cand.jpg' }, new Map([['jv', 'https://cdn.test/jv.jpg']]));
    expect(img(f.nativeElement)?.getAttribute('src')).toBe('https://cdn.test/cand.jpg');
    f.componentRef.setInput('photoUrl', 'javascript:alert(1)');
    f.detectChanges();
    await f.whenStable();
    expect(img(f.nativeElement)?.getAttribute('src')).toBe('https://cdn.test/jv.jpg');
  });

  it('imagem que não carrega volta para as iniciais', async () => {
    const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'https://cdn.test/quebrada.jpg' });
    const el = f.nativeElement as HTMLElement;
    img(el)!.dispatchEvent(new Event('error'));
    f.detectChanges();
    await f.whenStable();
    expect(img(el)).toBeNull();
    expect(el.textContent?.trim()).toBe('JV');
  });

  describe('ampliar a foto', () => {
    const zoom = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button.zoom');
    const viewer = (el: HTMLElement) => el.querySelector('bo-photo-viewer');

    async function settle(f: Awaited<ReturnType<typeof render>>) {
      f.detectChanges();
      await f.whenStable();
    }

    it('com foto: o clique abre a foto ampliada', async () => {
      const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'https://cdn.test/jv.jpg' });
      const el = f.nativeElement as HTMLElement;
      expect(zoom(el)?.getAttribute('aria-label')).toBe('Ampliar foto de João Victor');
      expect(viewer(el)).toBeNull();
      zoom(el)!.click();
      await settle(f);
      expect(viewer(el)?.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/jv.jpg');
      expect(viewer(el)?.querySelector('dialog')?.getAttribute('aria-label')).toBe('Foto de João Victor');
    });

    it('fechar a foto ampliada tira o visualizador', async () => {
      const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'https://cdn.test/jv.jpg' });
      const el = f.nativeElement as HTMLElement;
      zoom(el)!.click();
      await settle(f);
      el.querySelector<HTMLButtonElement>('bo-photo-viewer .close')!.click();
      await settle(f);
      expect(viewer(el)).toBeNull();
    });

    it('sem foto não há ação de ampliar', async () => {
      const f = await render({ id: 'jv', name: 'João Victor' });
      const el = f.nativeElement as HTMLElement;
      expect(zoom(el)).toBeNull();
      expect(el.querySelector('button')).toBeNull();
    });

    it('URL que não é https não vira foto nem ação de ampliar', async () => {
      const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'http://cdn.test/jv.jpg' });
      expect(zoom(f.nativeElement)).toBeNull();
    });

    it('foto que falha volta às iniciais e perde a ação de ampliar', async () => {
      const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'https://cdn.test/quebrada.jpg' });
      const el = f.nativeElement as HTMLElement;
      el.querySelector('img')!.dispatchEvent(new Event('error'));
      await settle(f);
      expect(zoom(el)).toBeNull();
      expect(el.textContent?.trim()).toBe('JV');
    });

    it('o clique não chega na linha ou no link em volta do avatar', async () => {
      const f = await render({ id: 'jv', name: 'João Victor', photoUrl: 'https://cdn.test/jv.jpg' });
      const el = f.nativeElement as HTMLElement;
      let rowClicks = 0;
      el.addEventListener('click', () => (rowClicks += 1));
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      zoom(el)!.dispatchEvent(click);
      await settle(f);
      expect(click.defaultPrevented).toBeTrue();
      el.querySelector<HTMLButtonElement>('bo-photo-viewer .close')!.click();
      await settle(f);
      expect(rowClicks).toBe(0);
    });
  });
});
