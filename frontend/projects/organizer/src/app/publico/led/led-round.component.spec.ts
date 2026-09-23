import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocView } from '../overlay/overlay-selectors';
import { LedRoundComponent, type LedTeam } from './led-round.component';

function view(overrides: Partial<OverlayKocView> = {}): OverlayKocView {
  return {
    kind: 'koc',
    phase: 'live',
    roundTitle: 'Classificatória · Rodada 3/7',
    bar: {
      blocks: [
        { role: 'queue', teamId: 'q1', points: 8, nextUp: false },
        { role: 'queue', teamId: 'q2', points: 10, nextUp: false },
        { role: 'queue', teamId: 'q3', points: 1, nextUp: true },
        { role: 'challenger', teamId: 'd', points: 14, nextUp: false },
        { role: 'king', teamId: 'k', points: 4, nextUp: false },
      ],
      streak: null,
      clock: { label: '02:43', paused: false },
    },
    ...overrides,
  };
}

const TEAMS = new Map<string, LedTeam>([
  ['k', { players: ['Van', 'Aye'] }],
  ['d', { players: ['Bro', 'Dau'] }],
  ['q1', { players: ['Hölting Nilsson', 'Berger'] }],
  ['q2', { players: ['Batrane', 'Tiisaar'] }],
  ['q3', { players: ['Sor', 'Ham'] }],
]);

async function render(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(LedRoundComponent);
  const all = { view: view(), teams: TEAMS, categoryName: 'Masculino B', courtName: 'Quadra 2', ...inputs };
  for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('LedRoundComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedRoundComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada sem rodada', async () => {
    expect(host(await render({ view: null })).querySelector('.tela')).toBeNull();
  });

  it('mostra rodada, categoria, quadra e relógio', async () => {
    const text = (host(await render()).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Rodada');
    expect(text).toContain('3');
    expect(text).toContain('7');
    expect(text).toContain('Masculino B');
    expect(text).toContain('Quadra 2');
    expect(text).toContain('02:43');
  });

  it('põe trono e desafiante em blocos próprios, com iniciais e pontos', async () => {
    const h = host(await render());
    const trono = h.querySelector('.bloco--trono');
    const desafiante = h.querySelector('.bloco--desafiante');

    expect(trono?.textContent).toContain('Van');
    expect(trono?.textContent).toContain('Aye');
    expect(trono?.textContent).toContain('4');
    expect([...trono!.querySelectorAll('.inicial')].map((e) => e.textContent)).toEqual(['VA', 'AY']);
    expect(desafiante?.textContent).toContain('Bro');
    expect(desafiante?.textContent).toContain('14');
  });

  it('mostra a fila com o próximo a entrar destacado', async () => {
    const cards = [...host(await render()).querySelectorAll('.fila-card')];

    expect(cards.length).toBe(3);
    expect(cards.filter((c) => c.classList.contains('fila-card--proximo')).length).toBe(1);
  });

  it('acende a sequência a partir de duas, e o anel a partir de três', async () => {
    const duas = host(await render({ view: view({ bar: { ...view().bar, streak: 2 } }) }));
    expect(duas.textContent).toContain('2 seguidas');
    expect(duas.querySelector('.bloco--trono')?.classList.contains('bloco--pulsando')).toBeFalse();

    const tres = host(await render({ view: view({ bar: { ...view().bar, streak: 3 } }) }));
    expect(tres.querySelector('.bloco--trono')?.classList.contains('bloco--pulsando')).toBeTrue();
  });

  it('deixa o relógio vermelho no último minuto', async () => {
    const calmo = host(await render());
    expect(calmo.querySelector('.relogio')?.classList.contains('relogio--urgente')).toBeFalse();

    const urgente = host(
      await render({ view: view({ bar: { ...view().bar, clock: { label: '00:47', paused: false } } }) }),
    );
    expect(urgente.querySelector('.relogio')?.classList.contains('relogio--urgente')).toBeTrue();
  });

  it('anuncia tempo esgotado sem afirmar quem classificou', async () => {
    const h = host(await render({ esgotado: true }));

    expect(h.textContent).toContain('Tempo esgotado');
    expect(h.textContent).not.toContain('Classificada');
    // O placar continua na tela, congelado.
    expect(h.querySelector('.bloco--trono')?.textContent).toContain('Van');
  });
});
