import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FinalCampeoes } from './overlay-final.component';
import { OverlayFinalComponent } from './overlay-final.component';

const DUELO: FinalCampeoes = {
  campeao: ['Hölting Nilsson', 'Berger'],
  vice: ['Batrane', 'Tiisaar'],
  placar: {
    tipo: 'sets',
    vencidosCampeao: 2,
    vencidosVice: 1,
    sets: [
      { campeao: 21, vice: 18 },
      { campeao: 19, vice: 21 },
      { campeao: 15, vice: 12 },
    ],
  },
};

const KOTC: FinalCampeoes = {
  campeao: ['Van', 'Aye'],
  vice: ['Bro', 'Dau'],
  placar: { tipo: 'pontos', pontosCampeao: 24, pontosVice: 20, coroasCampeao: 5, coroasVice: 3 },
};

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(OverlayFinalComponent);
  const all = {
    resultado: DUELO,
    torneio: 'Open de Verão NexaGO',
    categoria: 'Masculino B',
    quadra: 'Central',
    ...inputs,
  };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function texto(fixture: { nativeElement: unknown }): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
}

describe('OverlayFinalComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayFinalComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem resultado', async () => {
    const fixture = await render({ resultado: null });

    expect((fixture.nativeElement as HTMLElement).querySelector('#stage')).toBeNull();
    expect(texto(fixture).trim()).toBe('');
  });

  it('anuncia campeões, vice e o contexto do título', async () => {
    const t = texto(await render());

    expect(t).toContain('Hölting Nilsson');
    expect(t).toContain('Berger');
    expect(t).toContain('Open de Verão NexaGO');
    expect(t).toContain('Masculino B · Quadra Central');
    expect(t).toContain('Batrane & Tiisaar');
    expect(t).toContain('Vice-campeões');
  });

  it('escreve CAMPEÕES letra a letra, cada uma no seu tempo', async () => {
    const letras = [...(await render()).nativeElement.querySelectorAll('.gold span')];

    expect(letras.map((l: Element) => l.textContent).join('')).toBe('CAMPEÕES');
    expect((letras[3] as HTMLElement).style.animationDelay).toBe('0.18s');
  });

  it('não mostra placar — só o pódio', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    const t = texto(fixture);

    expect(host.querySelector('.score')).toBeNull();
    expect(t).not.toContain('sets');
    expect(t).not.toContain('2×1');
    expect(t).not.toContain('Set 1');
  });

  it('no KOTC também omite pontos e coroas do placar', async () => {
    const t = texto(await render({ resultado: KOTC }));

    expect(t).toContain('Van');
    expect(t).toContain('Aye');
    expect(t).not.toContain('pontos');
    expect(t).not.toContain('Coroas');
    expect(t).not.toContain('24×20');
  });

  it('ao sair da tela, o confete não continua rodando', async () => {
    // Numa transmissão de horas, um laço de canvas esquecido queima CPU até o fim.
    jasmine.clock().install();
    try {
      const fixture = await render();
      const raf = spyOn(window, 'requestAnimationFrame').and.callThrough();

      fixture.destroy();
      jasmine.clock().tick(10_000);

      expect(raf).not.toHaveBeenCalled();
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
