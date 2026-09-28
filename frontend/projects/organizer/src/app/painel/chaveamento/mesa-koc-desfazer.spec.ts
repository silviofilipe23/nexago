import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { KocRoundState } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { MesaKocComponent } from './mesa-koc.component';

/** A correção de um lance errado tem de estar a UM toque, colada nos botões de ponto.
 *  Em 25–26/09 o botão do log saiu da fila (modo quadra) e o bloco "Último lançamento"
 *  foi comentado: o único "Desfazer" ficou dentro de uma gaveta que ninguém abria, e no
 *  celular não havia como voltar um ponto. Isso é fiação de template — função pura
 *  nenhuma pegaria. */

function round(overrides: Partial<KocRoundState> = {}): KocRoundState {
  return {
    teamIds: ['k', 'c', 'q'],
    kingTeamId: 'k',
    challengerTeamId: 'c',
    queue: ['q'],
    points: { k: 1, c: 0, q: 0 },
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

describe('MesaKocComponent — desfazer a um toque', () => {
  let fixture: ComponentFixture<MesaKocComponent>;

  function mount(koc: KocRoundState): HTMLElement {
    const inner = fixture.componentInstance as unknown as MesaInternals;
    inner.faces.set(
      new Map([
        ['k', { name: 'Ana / Bia', sub: null, players: [] }],
        ['c', { name: 'Carla / Duda', sub: null, players: [] }],
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

  it('mostra o último lance e o botão Desfazer junto dos botões de ponto', () => {
    const el = mount(round());
    const strip = el.querySelector('.og-mk-live-controls .og-mk-undo-strip');
    expect(strip).withContext('faixa de desfazer dentro dos controles').not.toBeNull();
    expect(strip!.textContent).toContain('Ana / Bia');
    const undo = strip!.querySelector<HTMLButtonElement>('.og-mk-undo-btn');
    expect(undo?.textContent).toContain('Desfazer');
    expect(undo?.disabled).toBeFalse();
  });

  it('abre o log pela própria faixa (o botão da fila some no modo quadra)', () => {
    const el = mount(round());
    el.querySelector<HTMLButtonElement>('.og-mk-undo-log')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.og-mk-live-log.open')).not.toBeNull();
  });

  it('sem lance registrado não há faixa — não há o que desfazer', () => {
    const el = mount(round({ rallies: 0, rallySeq: 0, rallyLog: [], points: { k: 0, c: 0, q: 0 } }));
    expect(el.querySelector('.og-mk-undo-strip')).toBeNull();
  });

  it('o botão tocado diz "Registrando…"; o outro mantém o rótulo', () => {
    const el = mount(round());
    (fixture.componentInstance as unknown as MesaInternals).pending.set('king');
    fixture.detectChanges();
    const king = el.querySelector('.og-mk-rally-king')!;
    const crown = el.querySelector('.og-mk-rally-crown')!;
    expect(king.textContent).toContain('Registrando…');
    expect(king.classList).toContain('og-mk-pending');
    expect(crown.textContent).toContain('Desafiante venceu');
  });
});
