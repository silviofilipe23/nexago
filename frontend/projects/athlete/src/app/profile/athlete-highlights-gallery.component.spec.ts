import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AthleteHighlightsGalleryComponent } from './athlete-highlights-gallery.component';

const PHOTOS = ['https://x/1.jpg', 'https://x/2.jpg'];

describe('AthleteHighlightsGalleryComponent', () => {
  let fixture: ComponentFixture<AthleteHighlightsGalleryComponent>;

  async function build(inputs: Record<string, unknown>): Promise<void> {
    fixture = TestBed.createComponent(AthleteHighlightsGalleryComponent);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AthleteHighlightsGalleryComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('não renderiza nada sem fotos e sem emptyHint (perfil público de quem nunca postou)', async () => {
    await build({ photos: [] });
    expect(fixture.nativeElement.querySelector('.hl')).toBeNull();
  });

  it('renderiza a seção com a dica quando emptyHint é dado (meu perfil)', async () => {
    await build({ photos: [], emptyHint: 'Adicione fotos' });
    expect(fixture.nativeElement.querySelector('.hl')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hl-empty').textContent.trim()).toBe('Adicione fotos');
    expect(fixture.nativeElement.querySelector('.hl-strip')).toBeNull();
  });

  it('mostra uma miniatura por foto', async () => {
    await build({ photos: PHOTOS });
    const thumbs = fixture.nativeElement.querySelectorAll('.hl-thumb');
    expect(thumbs.length).toBe(2);
    expect(thumbs[0].getAttribute('aria-label')).toBe('Ampliar foto 1 de 2');
  });

  it('abre o visualizador na foto clicada e fecha depois', async () => {
    await build({ photos: PHOTOS });
    expect(fixture.nativeElement.querySelector('app-nx-photo-lightbox')).toBeNull();

    fixture.nativeElement.querySelectorAll('.hl-thumb')[1].click();
    await fixture.whenStable();

    const viewer = fixture.nativeElement.querySelector('app-nx-photo-lightbox');
    expect(viewer).not.toBeNull();
    expect(viewer.querySelector('.photo').getAttribute('src')).toBe(PHOTOS[1]);

    viewer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-nx-photo-lightbox')).toBeNull();
  });

  it('abre no índice 0 — o clique na primeira foto não pode ser confundido com "fechado"', async () => {
    await build({ photos: PHOTOS });
    fixture.nativeElement.querySelectorAll('.hl-thumb')[0].click();
    await fixture.whenStable();

    const viewer = fixture.nativeElement.querySelector('app-nx-photo-lightbox');
    expect(viewer).not.toBeNull();
    expect(viewer.querySelector('.photo').getAttribute('src')).toBe(PHOTOS[0]);
  });

  it('carrega as miniaturas de forma preguiçosa', async () => {
    await build({ photos: PHOTOS });
    expect(fixture.nativeElement.querySelector('.hl-img').getAttribute('loading')).toBe('lazy');
  });
});
