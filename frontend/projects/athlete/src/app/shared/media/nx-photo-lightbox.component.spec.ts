import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NxPhotoLightboxComponent } from './nx-photo-lightbox.component';

const PHOTOS = ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'];

describe('NxPhotoLightboxComponent', () => {
  let fixture: ComponentFixture<NxPhotoLightboxComponent>;

  function currentSrc(): string {
    return fixture.nativeElement.querySelector('.photo').getAttribute('src');
  }

  function counter(): string {
    return fixture.nativeElement.querySelector('.counter').textContent.trim();
  }

  async function press(key: string): Promise<void> {
    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await fixture.whenStable();
  }

  async function build(photos: readonly string[], startIndex = 0): Promise<void> {
    fixture = TestBed.createComponent(NxPhotoLightboxComponent);
    fixture.componentRef.setInput('photos', photos);
    fixture.componentRef.setInput('startIndex', startIndex);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NxPhotoLightboxComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('abre na foto pedida', async () => {
    await build(PHOTOS, 1);
    expect(currentSrc()).toBe(PHOTOS[1]);
    expect(counter()).toBe('Foto 2 de 3');
  });

  it('navega com as setas do teclado', async () => {
    await build(PHOTOS, 0);
    await press('ArrowRight');
    expect(currentSrc()).toBe(PHOTOS[1]);
    await press('ArrowLeft');
    expect(currentSrc()).toBe(PHOTOS[0]);
  });

  it('circula do fim pro começo e vice-versa', async () => {
    await build(PHOTOS, 0);
    await press('ArrowLeft');
    expect(currentSrc()).toBe(PHOTOS[2]);
    await press('ArrowRight');
    expect(currentSrc()).toBe(PHOTOS[0]);
  });

  it('emite closed no Esc', async () => {
    await build(PHOTOS, 0);
    const spy = jasmine.createSpy('closed');
    fixture.componentInstance.closed.subscribe(spy);
    await press('Escape');
    expect(spy).toHaveBeenCalled();
  });

  it('esconde navegação e contador quando há uma foto só', async () => {
    await build([PHOTOS[0]!], 0);
    expect(fixture.nativeElement.querySelector('.nav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.dots')).toBeNull();
    expect(counter()).toBe('Foto em destaque');
  });

  it('prende um startIndex fora da faixa em vez de mostrar nada', async () => {
    await build(PHOTOS, 99);
    expect(currentSrc()).toBe(PHOTOS[2]);
  });

  it('trava a rolagem do fundo enquanto está aberto e devolve ao fechar', async () => {
    await build(PHOTOS, 0);
    expect(document.body.style.overflow).toBe('hidden');
    fixture.destroy();
    expect(document.body.style.overflow).toBe('');
  });
});
