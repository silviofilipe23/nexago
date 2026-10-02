import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { KocRoundState } from '../data/koc';
import type { TournamentMatch } from '../data/matches-repository';
import { ChaveamentoContextService } from './chaveamento-context.service';
import { MesaKocComponent } from './mesa-koc.component';

/** "É a próxima" na preparação da rodada: marca a rodada como a próxima da quadra, que a
 *  transmissão e o painel de LED anunciam em "Próximos em quadra". Aqui é a fiação do template —
 *  a regra de quem vai ao ar é do `overlay-court.spec.ts` e a escrita, da callable. */

function preparacao(): KocRoundState {
  return {
    teamIds: ['k', 'c', 'q'],
    kingTeamId: '',
    challengerTeamId: '',
    queue: [],
    points: {},
    rallies: 0,
    servingTeamId: '',
    clock: null,
    standings: [],
    qualifiersPerRound: 1,
    teamsPerCourt: 3,
    roundsPerBracket: 1,
    configuredDurationSec: 900,
    rallySeq: 0,
    rallyLog: [],
    roundLabel: 2,
    qualifierSlots: [],
    batteryLabel: 1,
    phases: null,
    maxTeamsPerRound: 5,
  };
}

function rodada(over: Partial<TournamentMatch> = {}): TournamentMatch {
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
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'koc_round',
    roundNumber: 1,
    matchNumber: 2,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: null,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    koc: preparacao(),
    ...over,
  } as TournamentMatch;
}

/** Sinais privados: com `id` vazio o componente não assina o Firestore e a mesa é alimentada à
 *  mão. `draftOrder` só é semeado no callback do `watchMatches`, então vem junto. */
interface MesaInternals {
  match: { set(m: TournamentMatch | null): void };
  loaded: { set(v: boolean): void };
  draftOrder: { set(v: string[]): void };
  markOnDeck(): void;
  unmarkOnDeck(): void;
}

describe('MesaKocComponent — "É a próxima" na preparação', () => {
  let fixture: ComponentFixture<MesaKocComponent>;

  function mount(m: TournamentMatch, draft: string[] = ['k', 'c', 'q']): HTMLElement {
    const inner = fixture.componentInstance as unknown as MesaInternals;
    inner.match.set(m);
    inner.draftOrder.set(draft);
    inner.loaded.set(true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function botao(el: HTMLElement, rotulo: string): HTMLButtonElement | null {
    return (
      [...el.querySelectorAll<HTMLButtonElement>('.og-mk-next button')].find((b) =>
        (b.textContent ?? '').includes(rotulo),
      ) ?? null
    );
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

  it('antes do apito, oferece "É a próxima" e diz onde ela vai aparecer', () => {
    const el = mount(rodada());
    const bloco = el.querySelector('.og-mk-next');

    expect(bloco).not.toBeNull();
    expect(bloco!.textContent).toContain('Próximos em quadra');
    expect(bloco!.textContent).toContain('Quadra 1');
    expect(botao(el, 'É a próxima')?.disabled).toBeFalse();
  });

  it('o botão chama a marcação', () => {
    const el = mount(rodada());
    const inner = fixture.componentInstance as unknown as MesaInternals;
    const marcar = spyOn(inner, 'markOnDeck');

    botao(el, 'É a próxima')!.click();

    expect(marcar).toHaveBeenCalledTimes(1);
  });

  it('rodada sem quadra não oferece — não há onde anunciar', () => {
    const el = mount(rodada({ courtId: '', court: null }));

    expect(el.querySelector('.og-mk-next')).toBeNull();
  });

  it('já marcada: mostra "Anunciada" e deixa desmarcar', () => {
    const el = mount(rodada({ onDeck: true }));
    const inner = fixture.componentInstance as unknown as MesaInternals;
    const desmarcar = spyOn(inner, 'unmarkOnDeck');

    expect(el.querySelector('.og-mk-next.on')).not.toBeNull();
    expect(el.querySelector('.og-mk-next')!.textContent).toContain('Anunciada');
    expect(botao(el, 'É a próxima')).toBeNull();
    expect(botao(el, 'Atualizar ordem')).toBeNull();

    botao(el, 'Desmarcar')!.click();
    expect(desmarcar).toHaveBeenCalledTimes(1);
  });

  it('mesa reordenou a fila depois de anunciar: oferece atualizar a ordem no ar', () => {
    const el = mount(rodada({ onDeck: true }), ['c', 'k', 'q']);
    const inner = fixture.componentInstance as unknown as MesaInternals;
    const marcar = spyOn(inner, 'markOnDeck');

    botao(el, 'Atualizar ordem')!.click();

    expect(marcar).toHaveBeenCalledTimes(1);
  });

  it('com a rodada em jogo o bloco some', () => {
    const emJogo = rodada({
      status: 'in_progress',
      koc: {
        ...preparacao(),
        kingTeamId: 'k',
        challengerTeamId: 'c',
        queue: ['q'],
        clock: { endsAtMs: Date.now() + 600_000, durationSec: 900, pausedAtMs: null },
      } as KocRoundState,
    });
    const el = mount(emJogo);

    expect(el.querySelector('.og-mk-next')).toBeNull();
  });
});
