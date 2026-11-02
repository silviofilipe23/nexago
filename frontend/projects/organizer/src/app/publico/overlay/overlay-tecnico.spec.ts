import type { TournamentMatch } from '../../painel/data/matches-repository';
import { overlayViewOf, type OverlayDuelView } from './overlay-selectors';
import {
  TECNICO_SAIDA_MS,
  tecnicoAutoKeyOf,
  tecnicoAutoNext,
  tecnicoAutoViewOf,
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
  side: 'A' as 'A' | 'B' | null,
  auto: false,
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

  describe('automático do 21º ponto (gravado pela mesa)', () => {
    it('entra sem dupla e sem time', () => {
      const m = match({ sets: [{ a: 11, b: 10 }], technicalTimeout: tt({ side: null, auto: true, teamId: '', scoreA: 11, scoreB: 10 }) });
      const r = tecnicoManualOf(m, viewOf(m), NOW, null);
      expect(r?.auto).toBeTrue();
      expect(r?.side).toBeNull();
      expect(r?.teamId).toBe('');
      expect(r?.info).toBe('Set 1 · 11 × 10');
    });

    it('o 22º ponto encerra igual ao manual', () => {
      const m = match({ sets: [{ a: 12, b: 10 }], technicalTimeout: tt({ side: null, auto: true, teamId: '', scoreA: 11, scoreB: 10 }) });
      expect(tecnicoManualOf(m, viewOf(m), NOW, null)).toBeNull();
    });

    it('usa a mesma chave do que o overlay enxerga sozinho (não reanima na troca)', () => {
      const m = match({ sets: [{ a: 11, b: 10 }], technicalTimeout: tt({ side: null, auto: true, teamId: '', scoreA: 11, scoreB: 10 }) });
      expect(tecnicoManualOf(m, viewOf(m), NOW, null)?.key).toBe(tecnicoAutoKeyOf(m, true)!);
    });
  });

  describe('automático do 21º ponto (visto pelo overlay, conforme a opção do torneio)', () => {
    it('chave só com a opção ligada e a soma do set em 21', () => {
      const m = match({ sets: [{ a: 11, b: 10 }] });
      expect(tecnicoAutoKeyOf(m, true)).toBe('m1:1:auto');
      expect(tecnicoAutoKeyOf(m, false)).toBeNull();
    });

    it('sem chave fora de 21, no tie-break de 15 e fora do ao vivo', () => {
      expect(tecnicoAutoKeyOf(match({ sets: [{ a: 10, b: 10 }] }), true)).toBeNull();
      const tb = match({ sets: [{ a: 21, b: 5 }, { a: 5, b: 21 }, { a: 11, b: 10 }], currentSetIndex: 2 });
      expect(tecnicoAutoKeyOf(tb, true)).toBeNull();
      expect(tecnicoAutoKeyOf(match({ status: 'scheduled', sets: [{ a: 11, b: 10 }] }), true)).toBeNull();
    });

    it('chave nova abre o minuto com o relógio desta tela', () => {
      const st = tecnicoAutoNext(null, { key: 'm1:1:auto', baseline: false, docActive: false, nowMs: NOW });
      expect(st).toEqual({ key: 'm1:1:auto', startMs: NOW });
      const m = match({ sets: [{ a: 11, b: 10 }] });
      const v = tecnicoAutoViewOf(st, 'm1:1:auto', viewOf(m), NOW + 5_000, 'Masculino A');
      expect(v).toEqual(jasmine.objectContaining({ auto: true, side: null, teamId: '', startMs: NOW, info: 'Set 1 · 11 × 10 · Masculino A' }));
      // A mesma chave mantém o relógio.
      expect(tecnicoAutoNext(st, { key: 'm1:1:auto', baseline: false, docActive: false, nowMs: NOW + 9_000 })).toBe(st);
    });

    it('1ª leitura com o set já em 21 é linha de base: recarregar o OBS não reabre', () => {
      const st = tecnicoAutoNext(null, { key: 'm1:1:auto', baseline: true, docActive: false, nowMs: NOW });
      const m = match({ sets: [{ a: 11, b: 10 }] });
      expect(tecnicoAutoViewOf(st, 'm1:1:auto', viewOf(m), NOW, null)).toBeNull();
    });

    it('com o tempo da mesa no doc, o do overlay vence — e não volta quando a mesa encerra', () => {
      const aberto = { key: 'm1:1:auto', startMs: NOW };
      const st = tecnicoAutoNext(aberto, { key: 'm1:1:auto', baseline: false, docActive: true, nowMs: NOW + 2_000 });
      const m = match({ sets: [{ a: 11, b: 10 }] });
      expect(tecnicoAutoViewOf(st, 'm1:1:auto', viewOf(m), NOW + 3_000, null)).toBeNull();
      expect(tecnicoAutoNext(st, { key: 'm1:1:auto', baseline: false, docActive: false, nowMs: NOW + 4_000 })).toBe(st);
    });

    it('ponto marcado (sem chave) tira do ar', () => {
      expect(tecnicoAutoNext({ key: 'm1:1:auto', startMs: NOW }, { key: null, baseline: false, docActive: false, nowMs: NOW })).toBeNull();
    });
  });
});
