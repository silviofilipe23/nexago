import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OverlayKocTeam } from './overlay-koc-bar.component';
import { OverlayScoreboardComponent } from './overlay-scoreboard.component';
import type { OverlayDuelView } from './overlay-selectors';

function duel(overrides: Partial<OverlayDuelView> = {}): OverlayDuelView {
  return {
    kind: 'duel',
    phase: 'live',
    a: { teamId: 'ta', label: 'A definir', serving: false },
    b: { teamId: 'tb', label: 'A definir', serving: true },
    setsA: 1,
    setsB: 0,
    pointsA: 14,
    pointsB: 11,
    alert: null,
    showSets: true,
    pointsLead: 'A',
    currentSetNumber: 2,
    targetPoints: 21,
    setColumns: [
      { index: 0, label: 'SET 1', a: 21, b: 18, active: false },
      { index: 1, label: 'SET 2', a: null, b: null, active: true },
    ],
    roundLabel: 'Semifinal',
    winnerSide: null,
    servingPlayerSlot: 2,
    ...overrides,
  };
}

const TEAMS = new Map<string, OverlayKocTeam>([
  ['ta', { players: ['Ana', 'Bia'] }],
  ['tb', { players: ['Carla', 'Dani'] }],
]);

async function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(OverlayScoreboardComponent);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  await fixture.whenStable();
  return fixture;
}

describe('OverlayScoreboardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OverlayScoreboardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('não desenha nada por cima do vídeo quando não há partida no ar', async () => {
    const fixture = await render({ view: null });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.board')).toBeNull();
    expect((host.textContent ?? '').trim()).toBe('');
  });

  it('leva a marca da nexaGO no canto', async () => {
    const fixture = await render({ view: duel(), teams: TEAMS });

    expect((fixture.nativeElement as HTMLElement).querySelector('og-overlay-mark')).not.toBeNull();
  });

  it('mostra cada atleta numa linha e acende a bolinha só de quem saca', async () => {
    const fixture = await render({
      view: duel(),
      categoryName: 'Masculino B',
      courtName: 'Quadra 1',
      teams: TEAMS,
    });
    const host = fixture.nativeElement as HTMLElement;
    const text = host.textContent ?? '';

    expect(text).toContain('Ana');
    expect(text).toContain('Bia');
    expect(text).toContain('Carla');
    expect(text).toContain('Dani');
    expect(text).toContain('Ao vivo');
    expect(text).toContain('Set 2 · até 21');
    expect(host.querySelectorAll('.serve--on').length).toBe(1);
    expect(host.querySelectorAll('.athlete').length).toBe(4);
  });

  it('no tie-break troca o rótulo da faixa', async () => {
    const fixture = await render({
      view: duel({ currentSetNumber: 3, targetPoints: 15 }),
      teams: TEAMS,
    });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tie-break');
  });

  it('anuncia MATCH POINT do lado que pode fechar', async () => {
    const fixture = await render({ view: duel({ alert: { side: 'A', kind: 'match' } }), teams: TEAMS });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('MATCH POINT');
  });

  it('no fim de jogo mostra selo, vitória e coluna de sets', async () => {
    const fixture = await render({
      view: duel({
        phase: 'final',
        setsA: 2,
        setsB: 0,
        winnerSide: 'A',
        a: { teamId: 'ta', label: 'A', serving: false },
        b: { teamId: 'tb', label: 'B', serving: false },
        servingPlayerSlot: 0,
        setColumns: [
          { index: 0, label: 'SET 1', a: 21, b: 18, active: false },
          { index: 1, label: 'SET 2', a: 21, b: 15, active: true },
        ],
      }),
      categoryName: 'Masculino B',
      teams: TEAMS,
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Fim de jogo');
    expect(text).toContain('Vitória por 2 × 0');
    expect(text).toContain('Sets');
    expect(text).not.toContain('Ao vivo');
  });

  it('no modo Grande final mostra o selo laranja', async () => {
    const fixture = await render({ view: duel(), teams: TEAMS, isFinal: true });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Grande final');
    expect((fixture.nativeElement as HTMLElement).querySelector('.panel--final-mode')).not.toBeNull();
  });
});
