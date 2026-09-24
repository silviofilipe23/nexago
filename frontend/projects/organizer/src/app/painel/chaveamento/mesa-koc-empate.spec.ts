import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MesaKocComponent } from './mesa-koc.component';
import type { TournamentMatch } from '../data/matches-repository';

/** O empate na vaga é decidido SÓ por pontos (`kocQualifyingTieGroup` não conhece
 *  relógio). Numa rodada de 5 duplas em 0×0 o grupo empatado existe desde o apito —
 *  daí a mesa precisa amarrar a exibição ao fim do tempo, ou o card de empate nasce
 *  junto com a rodada e rouba a tela de quem está lançando ponto. */

const TEAMS = ['t1', 't2', 't3', 't4', 't5'];

function round(points: Record<string, number>, endsAtMs: number): unknown {
  return {
    teamIds: TEAMS,
    kingTeamId: 't1',
    challengerTeamId: 't2',
    queue: ['t3', 't4', 't5'],
    points,
    rallies: 4,
    servingTeamId: 't2',
    clock: { endsAtMs, durationSec: 900, pausedAtMs: null },
    standings: [],
    qualifiersPerRound: 2,
    teamsPerCourt: 5,
    roundsPerBracket: 3,
    configuredDurationSec: 900,
    rallySeq: 4,
    rallyLog: [],
    roundLabel: 2,
    qualifierSlots: [],
  };
}

function matchWith(points: Record<string, number>, endsAtMs: number): TournamentMatch {
  return {
    id: 'm1', tournamentId: 't', categoryId: 'femB', status: 'in_progress',
    court: 'Quadra 3', courtId: 'c3', matchType: 'koc qualifier', matchNumber: 7,
    koc: round(points, endsAtMs),
  } as unknown as TournamentMatch;
}

function mount(points: Record<string, number>, endsAtMs: number): ComponentFixture<MesaKocComponent> {
  const fixture = TestBed.createComponent(MesaKocComponent);
  // `id` vazio: o efeito de carga sai antes de qualquer ida ao Firestore.
  fixture.componentRef.setInput('id', '');
  fixture.componentRef.setInput('matchId', '');
  fixture.detectChanges();
  const inst = fixture.componentInstance as unknown as {
    match: { set(v: unknown): void };
    loaded: { set(v: boolean): void };
  };
  inst.match.set(matchWith(points, endsAtMs));
  inst.loaded.set(true);
  fixture.detectChanges();
  return fixture;
}

describe('mesa KOTC · o card de empate só entra depois do apito', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MesaKocComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  it('com o tempo correndo, não mostra empate mesmo com as duplas empatadas na vaga', () => {
    const f = mount({ t1: 1, t2: 0, t3: 0, t4: 0, t5: 0 }, Date.now() + 7 * 60_000);
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelector('.og-mk-tie')).withContext('card de empate').toBeNull();
  });

  it('com o tempo correndo, os botões de lançamento de ponto continuam na tela', () => {
    const f = mount({ t1: 1, t2: 0, t3: 0, t4: 0, t5: 0 }, Date.now() + 7 * 60_000);
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelector('.og-mk-rally-king')).withContext('ponto do trono').not.toBeNull();
    expect(el.querySelector('.og-mk-rally-crown')).withContext('coroa').not.toBeNull();
  });

  it('com o tempo esgotado e empate na vaga, mostra o card de empate', () => {
    const f = mount({ t1: 3, t2: 3, t3: 5, t4: 1, t5: 0 }, Date.now() - 1_000);
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelector('.og-mk-tie')).withContext('card de empate').not.toBeNull();
  });

  it('mesmo com o empate aberto, os botões de ponto seguem na tela pro último rally', () => {
    // O cronômetro NÃO encerra a rodada: aos 00:00 a mesa ainda conclui o rally em
    // andamento antes de encerrar. Sumir com os botões deixaria esse rally sem onde
    // ser lançado.
    const f = mount({ t1: 3, t2: 3, t3: 5, t4: 1, t5: 0 }, Date.now() - 1_000);
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelector('.og-mk-rally-king')).withContext('ponto do trono').not.toBeNull();
    expect(el.querySelector('.og-mk-rally-crown')).withContext('coroa').not.toBeNull();
  });

  it('sem empate, o tempo esgotado sozinho não inventa card de empate', () => {
    const f = mount({ t1: 5, t2: 4, t3: 3, t4: 2, t5: 1 }, Date.now() - 1_000);
    const el = f.nativeElement as HTMLElement;

    expect(el.querySelector('.og-mk-tie')).withContext('card de empate').toBeNull();
  });
});
