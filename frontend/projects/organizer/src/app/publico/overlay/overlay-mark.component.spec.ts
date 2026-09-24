import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayMarkComponent } from './overlay-mark.component';

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(OverlayMarkComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

describe('OverlayMarkComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayMarkComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('mostra a logo da nexaGO', async () => {
    const img = (await render()).nativeElement.querySelector('img') as HTMLImageElement;

    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/brand/logo.png');
  });

  it('fica no canto inferior direito por padrão', async () => {
    const fixture = await render();

    expect((fixture.nativeElement as HTMLElement).getAttribute('data-pos')).toBe('br');
  });

  it('sobe para o canto superior direito quando o conteúdo ocupa o inferior', async () => {
    const fixture = await render({ corner: 'tr' });

    expect((fixture.nativeElement as HTMLElement).getAttribute('data-pos')).toBe('tr');
  });

  it('é decorativa: não entra na leitura de tela', async () => {
    const fixture = await render();
    const img = (fixture.nativeElement as HTMLElement).querySelector('img')!;

    expect((fixture.nativeElement as HTMLElement).getAttribute('aria-hidden')).toBe('true');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('no modo de fluxo, deixa de flutuar e entra no layout de quem a hospeda', async () => {
    // Nas telas de LED os dois cantos direitos são ocupados (relógio em cima, fila embaixo):
    // presa no canto, a marca cairia por cima do cronômetro.
    const fixture = await render({ flow: true });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.getAttribute('data-flow')).toBe('true');
    expect(getComputedStyle(host).position).toBe('static');
  });

  it('por padrão continua flutuando no canto', async () => {
    const host = (await render()).nativeElement as HTMLElement;

    expect(host.getAttribute('data-flow')).toBeNull();
    expect(getComputedStyle(host).position).toBe('fixed');
  });
});
