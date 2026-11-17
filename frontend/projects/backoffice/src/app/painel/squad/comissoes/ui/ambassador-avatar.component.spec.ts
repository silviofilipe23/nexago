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
});
