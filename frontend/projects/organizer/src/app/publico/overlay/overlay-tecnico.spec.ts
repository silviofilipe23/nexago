import type { TournamentMatch } from '../../painel/data/matches-repository';
import { overlayViewOf, type OverlayDuelView } from './overlay-selectors';
import {
  TECNICO_SAIDA_MS,
  tecnicoAutoKeyOf,
  tecnicoClock,
  tecnicoManualOf,
  tecnicoNoAr,
  tecnicoRestanteSeg,
} from './overlay-tecnico';

const NOW = Date.UTC(2026, 9, 6, 18, 0, 0);

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
  return {
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: 'Dupla A',
    team2Label: 'Dupla B',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'in_progress',
    teamAId: 'ta',
    teamBId: 'tb',
    sets: [{ a: 10, b: 8 }],
    courtId: 'Q1',
    scheduleEndAt: null,
    dayKey: '',
    bestOf: 3,
    matchType: 'group',
    roundNumber: 1,
    matchNumber: 1,
    winnerAdvanceMatchNumber: null,
    winnerAdvanceSlot: null,
    loserAdvanceMatchNumber: null,
    liveScore: null,
    currentSetIndex: 0,
    servingTeamId: '',
    servingPlayerSlot: 0,
    medicalTimeout: null,
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const viewOf = (m: TournamentMatch) => overlayViewOf(m, NOW) as OverlayDuelView;
const tt = (over: object = {}) => ({
  side: 'A' as const,
  teamId: 'ta',
  startedAt: new Date(NOW - 10_000),
  durationSec: 60,
  setIndex: 0,
  scoreA: 10,
  scoreB: 8,
  ...over,
});

describe('overlay-tecnico', () => {
  it('relógio arredonda pra cima e formata m:ss', () => {
    expect(tecnicoRestanteSeg(NOW, 60_000, NOW)).toBe(60);
    expect(tecnicoClock(60)).toBe('1:00');
    expect(tecnicoClock(54)).toBe('0:54');
    expect(tecnicoRestanteSeg(NOW, 60_000, NOW + 70_000)).toBe(0);
  });

  it('sai 4 s depois de zerar', () => {
    expect(tecnicoNoAr(NOW, 60_000, NOW + 60_000 + TECNICO_SAIDA_MS - 1)).toBeTrue();
    expect(tecnicoNoAr(NOW, 60_000, NOW + 60_000 + TECNICO_SAIDA_MS)).toBeFalse();
  });

  describe('manual', () => {
    it('entra com o placar do instante da chamada', () => {
      const m = match({ technicalTimeout: tt() });
      const r = tecnicoManualOf(m, viewOf(m), NOW, 'Masculino A');
      expect(r?.kind).toBe('manual');
      expect(r?.side).toBe('A');
      expect(r?.startMs).toBe(NOW - 10_000);
      expect(r?.info).toBe('Set 1 · 10 × 8 · Masculino A');
    });

    it('qualquer ponto marcado encerra', () => {
      const m = match({ sets: [{ a: 11, b: 8 }], technicalTimeout: tt() });
      expect(tecnicoManualOf(m, viewOf(m), NOW, null)).toBeNull();
    });

    it('não entra com outro set em curso, partida encerrada ou minuto vencido', () => {
      const novoSet = match({ sets: [{ a: 21, b: 8 }, { a: 10, b: 8 }], currentSetIndex: 1, technicalTimeout: tt() });
      expect(tecnicoManualOf(novoSet, viewOf(novoSet), NOW, null)).toBeNull();
      const velho = match({ technicalTimeout: tt({ startedAt: new Date(NOW - 70_000) }) });
      expect(tecnicoManualOf(velho, viewOf(velho), NOW, null)).toBeNull();
      const m = match({ status: 'scheduled', technicalTimeout: tt() });
      expect(tecnicoManualOf(m, overlayViewOf(m, NOW) as OverlayDuelView, NOW, null)).toBeNull();
    });

    it('sem carimbo do servidor ainda mostra o minuto cheio', () => {
      const m = match({ technicalTimeout: tt({ startedAt: null }) });
      expect(tecnicoManualOf(m, viewOf(m), NOW, null)?.startMs).toBe(NOW);
    });
  });

  describe('automático (21 pontos)', () => {
    it('dispara com a soma do set em 21 no vôlei', () => {
      const m = match({ sets: [{ a: 11, b: 10 }] });
      expect(tecnicoAutoKeyOf(m, viewOf(m))).toBe('m1:1:auto');
    });

    it('não dispara fora de 21, no tie-break de 15 nem sem estar ao vivo', () => {
      const m20 = match({ sets: [{ a: 10, b: 10 }] });
      expect(tecnicoAutoKeyOf(m20, viewOf(m20))).toBeNull();
      const tb = match({ sets: [{ a: 21, b: 5 }, { a: 5, b: 21 }, { a: 11, b: 10 }], currentSetIndex: 2 });
      expect(tecnicoAutoKeyOf(tb, viewOf(tb))).toBeNull();
      const agendada = match({ status: 'scheduled', sets: [] });
      expect(tecnicoAutoKeyOf(agendada, overlayViewOf(agendada, NOW) as OverlayDuelView)).toBeNull();
    });
  });
});
