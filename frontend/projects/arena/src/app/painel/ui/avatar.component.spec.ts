import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarComponent } from './avatar.component';
import { PersonPhotoService } from './person-photo.service';

/** GIF 1x1 — data URI carrega de verdade no browser de teste, então `photoFailed` não dispara
 *  no meio do teste e some com o botão. */
const FOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Clicar no avatar abre a foto ampliada do aluno. O que fica travado: só vira botão quando
 *  existe foto pra ampliar — avatar de iniciais não pode parecer clicável. */
describe('AvatarComponent (foto ampliada)', () => {
  let fixture: ComponentFixture<AvatarComponent>;
  let photos: PersonPhotoService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarComponent);
    photos = TestBed.inject(PersonPhotoService);
    fixture.componentRef.setInput('name', 'Carla Dias');
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('sem foto mostra as iniciais e não vira botão, mesmo com `zoomable`', async () => {
    fixture.componentRef.setInput('zoomable', true);
    await fixture.whenStable();

    expect(host().textContent?.trim()).toBe('CD');
    expect(host().getAttribute('role')).toBeNull();
    expect(host().getAttribute('tabindex')).toBeNull();
    host().click();
    expect(photos.photo()).toBeNull();
  });

  it('com foto e sem `zoomable` só exibe a foto', async () => {
    fixture.componentRef.setInput('photoUrl', FOTO);
    await fixture.whenStable();

    expect(host().querySelector('img')?.getAttribute('src')).toBe(FOTO);
    expect(host().getAttribute('role')).toBeNull();
    host().click();
    expect(photos.photo()).toBeNull();
  });

  it('`zoomable` com foto vira botão rotulado e abre a foto com papel, contexto e origem', async () => {
    fixture.componentRef.setInput('zoomable', true);
    fixture.componentRef.setInput('photoUrl', FOTO);
    fixture.componentRef.setInput('personRole', 'Aluno');
    fixture.componentRef.setInput('meta', 'Mensal 2x');
    await fixture.whenStable();

    expect(host().getAttribute('role')).toBe('button');
    expect(host().getAttribute('tabindex')).toBe('0');
    expect(host().getAttribute('aria-label')).toBe('Ver foto de Carla Dias');

    host().click();

    const aberta = photos.photo();
    expect(aberta?.photoUrl).toBe(FOTO);
    expect(aberta?.name).toBe('Carla Dias');
    expect(aberta?.role).toBe('Aluno');
    expect(aberta?.meta).toBe('Mensal 2x');
    expect(aberta?.origin?.size).toBe(host().getBoundingClientRect().width);
    expect(aberta?.returnFocusTo).toBe(host());
  });

  it('o clique no avatar não chega à linha clicável em volta', async () => {
    fixture.componentRef.setInput('zoomable', true);
    fixture.componentRef.setInput('photoUrl', FOTO);
    await fixture.whenStable();
    const row = jasmine.createSpy('row');
    host().parentElement?.addEventListener('click', row);

    host().click();

    expect(row).not.toHaveBeenCalled();
  });
});
