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
    expect(chips()).toEqual(['Sua foto', 'Brasa', 'Noite', 'Areia']);
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

  describe('Sua foto', () => {
    const input = () => el().querySelector<HTMLInputElement>('[data-testid="photo-input"]')!;
    const chip = (id: string) => el().querySelector<HTMLButtonElement>(`[data-testid="theme-${id}"]`)!;

    function pick(file: File): void {
      const dt = new DataTransfer();
      dt.items.add(file);
      input().files = dt.files;
      input().dispatchEvent(new Event('change'));
    }

    async function pngFile(): Promise<File> {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 60;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3366ff';
      ctx.fillRect(0, 0, 40, 60);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      return new File([blob], 'quadra.png', { type: 'image/png' });
    }

    it('sem foto escolhida, o chip abre o seletor de arquivo e não muda o fundo', () => {
      create(STORY);
      const click = spyOn(input(), 'click');
      chip('photo').click();
      fixture.detectChanges();
      expect(click).toHaveBeenCalled();
      expect(chip('night').getAttribute('aria-checked')).toBe('true');
    });

    it('com a imagem escolhida, vira o fundo e oferece trocar', async () => {
      create(STORY);
      pick(await pngFile());
      await until(fixture, () => chip('photo').getAttribute('aria-checked') === 'true');
      expect(chip('photo').getAttribute('aria-checked')).toBe('true');
      expect(el().textContent).toContain('Trocar foto');
      expect(el().textContent).toContain('não sobe para o nexaGO');
    });

    it('arquivo que não é imagem mostra o motivo e mantém o fundo', async () => {
      create(STORY);
      pick(new File(['%PDF'], 'contrato.pdf', { type: 'application/pdf' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el().textContent).toContain('Escolha um arquivo de imagem');
      expect(chip('night').getAttribute('aria-checked')).toBe('true');
    });

    it('imagem corrompida mostra o motivo', async () => {
      create(STORY);
      pick(new File(['nao e imagem'], 'foto.jpg', { type: 'image/jpeg' }));
      await until(fixture, () => !!el().textContent?.includes('Não foi possível abrir'));
      expect(el().textContent).toContain('Não foi possível abrir essa imagem');
    });
  });
});
