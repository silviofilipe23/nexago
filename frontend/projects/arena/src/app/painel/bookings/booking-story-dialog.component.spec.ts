import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { BookingStoryDialogComponent } from './booking-story-dialog.component';
import type { BookingStory } from './booking-story';

const STORY: BookingStory = {
  moment: 'upcoming',
  arenaName: 'Arena Sol',
  courtName: 'Quadra 2',
  sportLabel: 'BEACH TENNIS',
  timeRange: '18:00–19:30',
  dateLabel: 'SÁB · 21 NOV',
  crew: [{ firstName: 'Ana', initials: 'AS', photoUrl: null }],
};

async function until(fixture: ComponentFixture<unknown>, check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) {
    await new Promise((r) => setTimeout(r, 50));
    fixture.detectChanges();
  }
}

describe('BookingStoryDialogComponent', () => {
  let fixture: ComponentFixture<BookingStoryDialogComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const chips = () => [...el().querySelectorAll('[role="radio"]')].map((b) => b.textContent?.trim());

  function create(story: BookingStory, coverUrl: string | null = null): void {
    fixture = TestBed.createComponent(BookingStoryDialogComponent);
    fixture.componentRef.setInput('story', story);
    fixture.componentRef.setInput('coverUrl', coverUrl);
    fixture.componentRef.setInput('fileName', 'story-reserva-2026-11-21-1800.png');
    fixture.detectChanges();
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [BookingStoryDialogComponent], providers: [provideZonelessChangeDetection()] }));

  it('gera a prévia 1080×1920 e libera o download', async () => {
    create(STORY);
    await until(fixture, () => !!el().querySelector('[data-testid="story-preview"]'));
    const img = el().querySelector<HTMLImageElement>('[data-testid="story-preview"]')!;
    expect(img.getAttribute('width')).toBe('1080');
    expect(img.getAttribute('height')).toBe('1920');
    const download = [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Baixar PNG'))!;
    expect(download.disabled).toBeFalse();
  });

  it('sem capa da arena, oferece só os fundos prontos', () => {
    create(STORY);
    expect(chips()).toEqual(['Brasa', 'Noite', 'Areia']);
  });

  it('capa que não carrega fica fora das opções, com aviso', async () => {
    create(STORY, 'http://127.0.0.1:9/nao-existe.jpg');
    await until(fixture, () => !!el().textContent?.includes('não carregou'));
    expect(el().textContent).toContain('A capa da arena não carregou');
    expect(chips()).not.toContain('Capa da arena');
  });

  it('esconde os ajustes de jogadores e modalidade quando a reserva não tem', () => {
    create({ ...STORY, crew: [], sportLabel: null });
    expect(el().querySelector('[aria-label="Mostrar jogadores"]')).toBeNull();
    expect(el().querySelector('[aria-label="Mostrar modalidade"]')).toBeNull();
  });
});
