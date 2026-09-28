import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { KocRoundState } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { MesaKocComponent } from './mesa-koc.component';

/** Alternativa A (celular): trono e desafiante viram botões de card inteiro, a pausa trava os
 *  toques, e +1 min / lesão / log / encerrar moram no menu ⋯. O CSS decide QUANDO aparece
 *  (≤640px); aqui é a fiação, que vale em qualquer largura. */

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['k', 'c', 'q'],
    kingTeamId: 'k',
    challengerTeamId: 'c',
    queue: ['q'],
    points: { k: 6, c: 3, q: 0 },
    rallies: 1,
    servingTeamId: '',
    clock: { endsAtMs: Date.now() + 600_000, durationSec: 900, pausedAtMs: null },
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 3,
    roundsPerBracket: 1,
    configuredDurationSec: 900,
    rallySeq: 1,
    rallyLog: [{ seq: 1, winner: 'king', teamId: '', atMs: Date.now() }],
    roundLabel: 1,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
    ...overrides,
  };
}

function match(koc: KocRoundState): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: 'Quadra 1',
    status: 'in_progress',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: new Date(),
    matchEndedAt: null,
    koc,
  } as TournamentMatch;
}

/** Os sinais de dados são privados: com `id` vazio o componente não assina o Firestore
 *  e a mesa é alimentada à mão, como no harness de QA. */
interface MesaInternals {
  match: { set(m: TournamentMatch | null): void };
  loaded: { set(v: boolean): void };
  faces: { set(v: ReadonlyMap<string, { name: string; sub: null; players: [] }>): void };
  pending: { set(v: string | null): void };
}

describe('MesaKocComponent — Alternativa A (celular)', () => {
  let fixture: ComponentFixture<MesaKocComponent>;

  function mount(koc: KocRoundState): HTMLElement {
    const inner = fixture.componentInstance as unknown as MesaInternals & { menuOpen: { set(v: boolean): void } };
    inner.faces.set(
      new Map([
        ['k', { name: 'Otávio / Murilo', sub: null, players: [] }],
        ['c', { name: 'André / Vinícius', sub: null, players: [] }],
        ['q', { name: 'Eva / Flávia', sub: null, players: [] }],
      ]),
    );
    inner.match.set(match(koc));
    inner.loaded.set(true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MesaKocComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ChaveamentoContextService, useValue: { reloadMatches: async () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(MesaKocComponent);
    fixture.detectChanges();
  });

  it('trono e desafiante viram botões com nome, dica e placar', () => {
    const el = mount(round());
    const trono = el.querySelector<HTMLButtonElement>('.og-mk-tap-btn--trono')!;
    const desafia = el.querySelector<HTMLButtonElement>('.og-mk-tap-btn--desafia')!;
    expect(trono.textContent).toContain('Otávio / Murilo');
    expect(trono.textContent).toContain('Toque = ponto do trono');
    expect(trono.querySelector('.og-mk-tap-pts')?.textContent?.trim()).toBe('6');
    expect(desafia.textContent).toContain('André / Vinícius');
    expect(desafia.textContent).toContain('Toque = venceu, assume o trono');
    expect(trono.disabled).toBeFalse();
  });

  it('com a rodada pausada os cards e o erro de saque não respondem', () => {
    const el = mount(round({ clock: { endsAtMs: Date.now() + 600_000, durationSec: 900, pausedAtMs: Date.now() } }));
    expect(el.querySelector<HTMLButtonElement>('.og-mk-tap-btn--trono')!.disabled).toBeTrue();
    expect(el.querySelector<HTMLButtonElement>('.og-mk-tap-btn--desafia')!.disabled).toBeTrue();
    expect(el.querySelector<HTMLButtonElement>('.og-mk-fault')!.disabled).toBeTrue();
    expect(el.querySelector('.og-mk-pause')?.getAttribute('aria-label')).toBe('Retomar');
  });

  it('o menu ⋯ traz +1 min, log, uma lesão por dupla em quadra e encerrar', () => {
    const el = mount(round());
    el.querySelector<HTMLButtonElement>('.og-mk-more')!.click();
    fixture.detectChanges();
    const menu = el.querySelector('.og-mk-menu')!;
    const textos = [...menu.querySelectorAll('.og-mk-menu-btn')].map((b) => b.textContent!.replace(/\s+/g, ' ').trim());
    expect(textos).toContain('+1 minuto no relógio');
    expect(textos.some((t) => t.startsWith('Log da rodada'))).toBeTrue();
    expect(textos.filter((t) => t.startsWith('Lesão ·'))).toEqual([
      'Lesão · Otávio / Murilo',
      'Lesão · André / Vinícius',
      'Lesão · Eva / Flávia',
    ]);
    expect(textos).toContain('Encerrar rodada');
  });

  it('lesão pelo menu fecha o menu e abre a confirmação daquela dupla', () => {
    const el = mount(round());
    el.querySelector<HTMLButtonElement>('.og-mk-more')!.click();
    fixture.detectChanges();
    const lesao = [...el.querySelectorAll<HTMLButtonElement>('.og-mk-menu-btn')].find((b) => b.textContent!.includes('Lesão · André'))!;
    lesao.click();
    fixture.detectChanges();
    expect(el.querySelector('.og-mk-menu')).toBeNull();
    expect(el.querySelector('og-confirm-dialog')?.textContent).toContain('André / Vinícius');
  });
});
