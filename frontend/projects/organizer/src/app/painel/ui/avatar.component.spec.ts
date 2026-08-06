import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PersonPhotoService } from './person-photo.service';
import { OgAvatarComponent } from './avatar.component';

/** GIF 1x1 — data URI carrega de verdade no browser de teste, então `photoFailed` não dispara
 *  no meio do teste e some com o botão. */
const FOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** A foto ampliada é o jeito do organizador conferir o rosto de quem está na frente dele. O que
 *  precisa ficar travado: só vira botão quando existe foto pra ampliar — avatar de iniciais não
 *  pode parecer clicável. */
describe('OgAvatarComponent (foto ampliada)', () => {
  let fixture: ComponentFixture<OgAvatarComponent>;
  let photos: PersonPhotoService;

  beforeEach(async () => {
    // O portal roda zoneless (`provideZonelessChangeDetection` no app.config) e o alvo de teste
    // não carrega zone.js — sem isso o TestBed falha com NG0908.
    await TestBed.configureTestingModule({
      imports: [OgAvatarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(OgAvatarComponent);
    photos = TestBed.inject(PersonPhotoService);
    fixture.componentRef.setInput('initials', 'MS');
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('não vira botão sem `zoomable`, mesmo tendo foto', async () => {
    fixture.componentRef.setInput('photoUrl', FOTO);
    await fixture.whenStable();

    expect(host().getAttribute('role')).toBeNull();
    host().click();
    expect(photos.photo()).toBeNull();
  });

  it('`zoomable` sem foto segue sem interação — nada de afordância falsa', async () => {
    fixture.componentRef.setInput('zoomable', true);
    await fixture.whenStable();

    expect(host().getAttribute('role')).toBeNull();
    expect(host().getAttribute('tabindex')).toBeNull();
    expect(host().classList).not.toContain('og-avatar-zoomable');
    host().click();
    expect(photos.photo()).toBeNull();
  });

  it('`zoomable` com foto vira botão rotulado e abre a foto com nome, contexto e origem', async () => {
    fixture.componentRef.setInput('zoomable', true);
    fixture.componentRef.setInput('photoUrl', FOTO);
    fixture.componentRef.setInput('personName', 'Marina Souza');
    fixture.componentRef.setInput('meta', 'Feminino B · Marina Souza / Paula Reis');
    await fixture.whenStable();

    expect(host().getAttribute('role')).toBe('button');
    expect(host().getAttribute('tabindex')).toBe('0');
    expect(host().getAttribute('aria-label')).toBe('Ver foto de Marina Souza');

    host().click();

    const aberta = photos.photo();
    expect(aberta?.photoUrl).toBe(FOTO);
    expect(aberta?.name).toBe('Marina Souza');
    expect(aberta?.meta).toBe('Feminino B · Marina Souza / Paula Reis');
    // Origem e foco de volta são o que liga a foto ao avatar exato que foi clicado (nas
    // listagens os avatares da dupla se sobrepõem).
    expect(aberta?.origin?.size).toBe(host().getBoundingClientRect().width);
    expect(aberta?.returnFocusTo).toBe(host());
  });

  it('leva o papel pro kicker — na equipe do torneio não é "Atleta"', async () => {
    fixture.componentRef.setInput('zoomable', true);
    fixture.componentRef.setInput('photoUrl', FOTO);
    fixture.componentRef.setInput('personName', 'Carlos Lima');
    fixture.componentRef.setInput('personRole', 'Mesário');
    await fixture.whenStable();

    host().click();
    expect(photos.photo()?.role).toBe('Mesário');
  });

  it('sem papel declarado, cai em "Atleta" — o caso das listagens de inscrição', async () => {
    fixture.componentRef.setInput('zoomable', true);
    fixture.componentRef.setInput('photoUrl', FOTO);
    fixture.componentRef.setInput('personName', 'Marina Souza');
    await fixture.whenStable();

    host().click();
    expect(photos.photo()?.role).toBe('Atleta');
  });

  it('sem nome, o rótulo do botão não fica pela metade', async () => {
    fixture.componentRef.setInput('zoomable', true);
    fixture.componentRef.setInput('photoUrl', FOTO);
    await fixture.whenStable();

    expect(host().getAttribute('aria-label')).toBe('Ver foto ampliada');
  });
});
