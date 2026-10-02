import type { TournamentMatch } from '../../painel/data/matches-repository';
import type { MatchFinishMemory } from '../../painel/telao/telao-finished';
import { KOC_FIM_DE_RODADA_MS, KOC_RESULTADO_MS, LED_COURT_FOLLOW, OVERLAY_COURT_FOLLOW, overlayCourtContextOf } from './overlay-court';

const NOW = Date.UTC(2026, 8, 23, 18, 0, 0);

function match(overrides: Partial<TournamentMatch>): TournamentMatch {
  return {
    id: 'm',
    tournamentId: 't1',
    categoryId: 'cat1',
    round: null,
    team1Label: '',
    team2Label: '',
    score: null,
    winnerSide: null,
    scheduledAt: null,
    court: null,
    status: 'scheduled',
    teamAId: '',
    teamBId: '',
    sets: [],
    courtId: 'q2',
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
    matchStartedAt: null,
    matchEndedAt: null,
    ...overrides,
  };
}

const SEM_MEMORIA: ReadonlyMap<string, MatchFinishMemory> = new Map();

describe('overlayCourtContextOf', () => {
  it('escolhe a partida ao vivo daquela quadra', () => {
    const ctx = overlayCourtContextOf(
      [
        match({ id: 'outra', status: 'in_progress', courtId: 'q9', matchStartedAt: new Date(NOW) }),
        match({ id: 'certa', status: 'in_progress', courtId: 'q2', matchStartedAt: new Date(NOW) }),
      ],
      'q2',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.match?.id).toBe('certa');
  });

  it('quadra parada não devolve partida, e a tela fica limpa', () => {
    const ctx = overlayCourtContextOf(
      [match({ id: 'velha', status: 'completed', courtId: 'q2' })],
      'q2',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.match).toBeNull();
    expect(ctx.categoryMatches).toEqual([]);
    expect(ctx.totalRounds).toBe(0);
  });

  it('final encerrada nesta quadra fica no ar mesmo sem memória de fim', () => {
    const final = match({
      id: 'fi',
      status: 'completed',
      courtId: 'q2',
      matchType: 'Final',
      winnerSide: 1,
      teamAId: 'ta',
      teamBId: 'tb',
      matchEndedAt: new Date(NOW - 3_600_000),
      sets: [
        { a: 21, b: 18 },
        { a: 21, b: 15 },
      ],
    });
    const proxima = match({
      id: 'exibicao',
      status: 'scheduled',
      courtId: 'q2',
      matchType: 'WB',
      scheduledAt: new Date(NOW + 60_000),
    });

    const ctx = overlayCourtContextOf([final, proxima], 'q2', NOW, SEM_MEMORIA);

    expect(ctx.match?.id).toBe('fi');
    expect(ctx.categoryMatches.map((m) => m.id)).toEqual(['fi', 'exibicao']);
  });

  it('final KOTC encerrada também fica pinada na quadra', () => {
    const final = match({
      id: 'koc-fi',
      status: 'completed',
      courtId: 'q2',
      matchType: 'koc_final',
      matchEndedAt: new Date(NOW - 600_000),
      koc: {
        teamIds: ['a', 'b', 'c', 'd'],
        kingTeamId: 'a',
        challengerTeamId: 'b',
        queue: ['c', 'd'],
        points: { a: 12, b: 10, c: 8, d: 6 },
        rallies: 0,
        servingTeamId: 'b',
        clock: null,
        standings: [
          { teamId: 'a', place: 1, points: 12, crowns: 3, removed: false },
          { teamId: 'b', place: 2, points: 10, crowns: 2, removed: false },
          { teamId: 'c', place: 3, points: 8, crowns: 1, removed: false },
          { teamId: 'd', place: 4, points: 6, crowns: 0, removed: false },
        ],
        qualifiersPerRound: 2,
        teamsPerCourt: 4,
        roundsPerBracket: 1,
        configuredDurationSec: 900,
        rallySeq: 0,
        rallyLog: [],
        roundLabel: 1,
        batteryLabel: 1,
        phases: null,
        maxTeamsPerRound: 0,
        qualifierSlots: [],
      },
    });

    expect(overlayCourtContextOf([final], 'q2', NOW, SEM_MEMORIA).match?.id).toBe('koc-fi');
  });

  it('entrega a categoria e o total da fase da partida escolhida', () => {
    const aoVivo = match({
      id: 'certa',
      status: 'in_progress',
      courtId: 'q2',
      matchStartedAt: new Date(NOW),
    });
    const ctx = overlayCourtContextOf(
      [
        aoVivo,
        match({ id: 'r2', matchType: 'koc_round' }),
        match({ id: 'r3', matchType: 'KOC_ROUND' }),
        match({ id: 'sf', matchType: 'koc_semifinal' }),
        match({ id: 'outraCat', categoryId: 'cat9', matchType: 'koc_round' }),
      ],
      'q2',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.categoryMatches.map((m) => m.id)).toEqual(['certa', 'r2', 'r3', 'sf']);
    // `KOC_ROUND` conta junto: a fase é comparada normalizada, como no resto do KOTC.
    expect(ctx.totalRounds).toBe(3);
  });

  it('quadra reaproveitada por outra categoria não trava na final antiga se tem jogo ao vivo', () => {
    const finalCat1 = match({
      id: 'final-cat1',
      status: 'completed',
      courtId: 'q2',
      categoryId: 'cat1',
      matchType: 'Final',
      winnerSide: 1,
      teamAId: 'ta',
      teamBId: 'tb',
      matchEndedAt: new Date(NOW - 3 * 3_600_000),
      sets: [
        { a: 21, b: 18 },
        { a: 21, b: 15 },
      ],
    });
    const aoVivoCat2 = match({
      id: 'live-cat2',
      status: 'in_progress',
      courtId: 'q2',
      categoryId: 'cat2',
      matchStartedAt: new Date(NOW),
    });

    const ctx = overlayCourtContextOf([finalCat1, aoVivoCat2], 'q2', NOW, SEM_MEMORIA);

    expect(ctx.match?.id).toBe('live-cat2');
  });

  it('quadra reaproveitada por outra categoria não trava na final antiga com jogo agendado (ainda não ao vivo)', () => {
    const finalCat1 = match({
      id: 'final-cat1',
      status: 'completed',
      courtId: 'q2',
      categoryId: 'cat1',
      matchType: 'Final',
      winnerSide: 1,
      teamAId: 'ta',
      teamBId: 'tb',
      matchEndedAt: new Date(NOW - 3 * 3_600_000),
      sets: [
        { a: 21, b: 18 },
        { a: 21, b: 15 },
      ],
    });
    const agendadaCat2 = match({
      id: 'next-cat2',
      status: 'scheduled',
      courtId: 'q2',
      categoryId: 'cat2',
      scheduledAt: new Date(NOW + 60_000),
    });

    const ctx = overlayCourtContextOf([finalCat1, agendadaCat2], 'q2', NOW, SEM_MEMORIA);

    expect(ctx.match?.id).toBe('next-cat2');
  });

  it('quadra reaproveitada por outra categoria SEM scheduledAt (KOTC real) também não trava na final antiga', () => {
    // Reprodução do bug real: KOTC não grava `scheduledAt` (agenda dinâmica por courtId), e o
    // próximo jogo da categoria nova ainda nem começou. Nem `courtNowOf` (que só acha "próxima"
    // via scheduledAt) nem uma checagem baseada em `atual.match` bastam aqui.
    const finalFeminina = match({
      id: 'final-feminina',
      status: 'completed',
      courtId: 'q1',
      categoryId: 'cat-fem',
      matchType: 'koc_final',
      matchEndedAt: new Date(NOW - 3 * 3_600_000),
      koc: {
        teamIds: ['a', 'b'],
        kingTeamId: 'a',
        challengerTeamId: 'b',
        queue: [],
        points: { a: 12, b: 10 },
        rallies: 0,
        servingTeamId: 'b',
        clock: null,
        standings: [
          { teamId: 'a', place: 1, points: 12, crowns: 3, removed: false },
          { teamId: 'b', place: 2, points: 10, crowns: 2, removed: false },
        ],
        qualifiersPerRound: 1,
        teamsPerCourt: 4,
        roundsPerBracket: 1,
        configuredDurationSec: 900,
        rallySeq: 0,
        rallyLog: [],
        roundLabel: 1,
        batteryLabel: 1,
        phases: null,
        maxTeamsPerRound: 0,
        qualifierSlots: [],
      },
    });
    const proximaMasculinaSemAgenda = match({
      id: 'proxima-masculina',
      status: 'scheduled',
      courtId: 'q1',
      categoryId: 'cat-masc',
      matchType: 'koc_semifinal',
      scheduledAt: null,
    });

    const ctx = overlayCourtContextOf(
      [finalFeminina, proximaMasculinaSemAgenda],
      'q1',
      NOW,
      SEM_MEMORIA,
    );

    expect(ctx.match?.id).not.toBe('final-feminina');
  });

  it('segura a recém-encerrada enquanto a memória de fim a mantém', () => {
    const encerrada = match({ id: 'fim', status: 'completed', courtId: 'q2' });
    const memoria = new Map<string, MatchFinishMemory>([
      ['fim', { status: 'completed', endedSeenAtMs: NOW - 5_000 }],
    ]);

    expect(overlayCourtContextOf([encerrada], 'q2', NOW, memoria).match?.id).toBe('fim');
  });
});

/** Rodada KOTC com o mínimo que a escolha da quadra lê: elenco (`teamIds`) e nº da rodada. */
function rodada(overrides: Partial<TournamentMatch>, teamIds: string[] = ['a', 'b', 'c', 'd']): TournamentMatch {
  return match({
    matchType: 'koc_round',
    koc: {
      teamIds,
      kingTeamId: '',
      challengerTeamId: '',
      queue: [],
      points: {},
      rallies: 0,
      servingTeamId: '',
      clock: null,
      standings: [],
      qualifiersPerRound: 1,
      teamsPerCourt: 4,
      roundsPerBracket: 4,
      configuredDurationSec: 900,
      rallySeq: 0,
      rallyLog: [],
      roundLabel: 1,
      batteryLabel: 1,
      phases: null,
      maxTeamsPerRound: 0,
      qualifierSlots: [],
    },
    ...overrides,
  });
}

/** Rodada que a mesa acabou de encerrar nesta quadra, vista pela tela `haMs` atrás. */
function encerradaHa(haMs: number, overrides: Partial<TournamentMatch> = {}) {
  const m = rodada({
    id: 'r2',
    matchNumber: 2,
    status: 'completed',
    matchEndedAt: new Date(NOW - haMs),
    ...overrides,
  });
  const memoria = new Map<string, MatchFinishMemory>([
    [m.id, { status: 'completed', endedSeenAtMs: NOW - haMs }],
  ]);
  return { m, memoria };
}

describe('overlayCourtContextOf — fim de rodada KOTC e "Próximos em quadra"', () => {
  it('no overlay, a rodada encerrada segura a quadra o ciclo inteiro (resultado + classificadas)', () => {
    const { m: r2, memoria } = encerradaHa(KOC_RESULTADO_MS + 12_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW + 60_000) });

    // 32 s depois do fim: os 30 s do telão já passaram, mas as classificadas ainda estão no ar.
    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r2');
  });

  it('terminado o ciclo, a quadra passa pra próxima rodada', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW + 60_000) });

    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r3');
  });

  it('sem o ciclo do overlay (painel de LED), a troca segue nos 30 s do telão', () => {
    const { m: r2, memoria } = encerradaHa(KOC_RESULTADO_MS + 12_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW + 60_000) });

    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria).match?.id).toBe('r3');
  });

  it('quadra atrasada: a próxima rodada aparece mesmo com o horário vencido há mais de 30 min', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW - 50 * 60_000) });

    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r3');
  });

  it('a rodada do meio, com elenco, ganha da agendada lá na frente sem elenco', () => {
    // r3 ficou fora da tolerância de horário; a final é a 1ª "agendada" que o telão enxerga.
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW - 50 * 60_000) });
    const final = rodada(
      { id: 'final', matchNumber: 9, matchType: 'koc_final', scheduledAt: new Date(NOW + 20 * 60_000) },
      [],
    );

    expect(overlayCourtContextOf([r2, r3, final], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r3');
  });

  it('rodada sem horário (agenda só por quadra) também é anunciada, na ordem do nº do jogo', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r5 = rodada({ id: 'r5', matchNumber: 5 });
    const r3 = rodada({ id: 'r3', matchNumber: 3 });

    expect(overlayCourtContextOf([r2, r5, r3], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r3');
  });

  it('pula a rodada cujo elenco ainda depende de outra fase', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const semElenco = rodada({ id: 'sf1', matchNumber: 3, matchType: 'koc_semifinal' }, ['', '', '']);
    const comElenco = rodada({ id: 'r4', matchNumber: 4 });

    expect(
      overlayCourtContextOf([r2, semElenco, comElenco], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id,
    ).toBe('r4');
  });

  it('overlay: a rodada seguinte da chave em OUTRA quadra é anunciada (caso real do dev)', () => {
    // Torneio 5f9Qt4…: a Rodada 6 fechou na Q2, a 7 (as 4 que sobraram) foi agendada na Q1, e o
    // próximo da Q2 é uma semifinal sem elenco. Seguindo a quadra à risca, a tela ficava vazia.
    const { m: r6, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000, { id: 'r6', matchNumber: 6 });
    const r7 = rodada({ id: 'r7', matchNumber: 7, courtId: 'q1', scheduledAt: new Date(NOW - 4 * 86_400_000) });
    const semi = rodada(
      { id: 'sf3', matchNumber: 11, matchType: 'koc_semifinal', scheduledAt: new Date(NOW) },
      [],
    );

    const ctx = overlayCourtContextOf([r6, r7, semi], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW);

    expect(ctx.match?.id).toBe('r7');
  });

  it('overlay: rodada com elenco nesta quadra vem antes da de outra quadra', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const outraQuadra = rodada({ id: 'r3', matchNumber: 3, courtId: 'q1', scheduledAt: new Date(NOW) });
    const aqui = rodada({ id: 'r5', matchNumber: 5, scheduledAt: new Date(NOW + 30 * 60_000) });

    expect(overlayCourtContextOf([r2, outraQuadra, aqui], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe(
      'r5',
    );
  });

  it('overlay: jogo de outra categoria marcado NESTA quadra não perde pra rodada de outra quadra', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const outraQuadra = rodada({ id: 'r3', matchNumber: 3, courtId: 'q1', scheduledAt: new Date(NOW - 50 * 60_000) });
    const aqui = match({
      id: 'duelo-cat2',
      categoryId: 'cat2',
      matchType: 'WB',
      scheduledAt: new Date(NOW + 10 * 60_000),
    });

    expect(overlayCourtContextOf([r2, outraQuadra, aqui], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe(
      'duelo-cat2',
    );
  });

  it('painel de LED não anuncia rodada de outra quadra — ele é o painel DESTA quadra', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, courtId: 'q9' });

    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria, LED_COURT_FOLLOW).match).toBeNull();
    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria).match).toBeNull();
  });

  it('overlay: rodada de outra quadra que já começou sai de cena — a tela não fica nela', () => {
    const { m: r6, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 60_000, { id: 'r6', matchNumber: 6 });
    const r7 = rodada({ id: 'r7', matchNumber: 7, courtId: 'q1', status: 'in_progress', matchStartedAt: new Date(NOW) });

    expect(overlayCourtContextOf([r6, r7], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match).toBeNull();
  });

  it('outra categoria marcada ANTES da rodada seguinte entra antes', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW + 2 * 3_600_000) });
    const outra = match({
      id: 'duelo-cat2',
      categoryId: 'cat2',
      matchType: 'WB',
      scheduledAt: new Date(NOW + 10 * 60_000),
    });

    expect(overlayCourtContextOf([r2, r3, outra], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe(
      'duelo-cat2',
    );
  });

  it('outra categoria marcada DEPOIS não fura a rodada atrasada da categoria em andamento', () => {
    const { m: r2, memoria } = encerradaHa(KOC_FIM_DE_RODADA_MS + 1_000);
    const r3 = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW - 50 * 60_000) });
    const outra = match({
      id: 'duelo-cat2',
      categoryId: 'cat2',
      matchType: 'WB',
      scheduledAt: new Date(NOW + 10 * 60_000),
    });

    expect(overlayCourtContextOf([r2, r3, outra], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r3');
  });

  it('se a última partida da quadra não foi KOTC, não puxa rodada pendurada de outra hora', () => {
    const rodadaAntiga = rodada({
      id: 'r1',
      status: 'completed',
      matchEndedAt: new Date(NOW - 5 * 3_600_000),
    });
    const pendurada = rodada({ id: 'r3', matchNumber: 3, scheduledAt: new Date(NOW - 4 * 3_600_000) });
    const dueloDepois = match({
      id: 'duelo',
      categoryId: 'cat2',
      matchType: 'WB',
      status: 'completed',
      matchEndedAt: new Date(NOW - 3_600_000),
    });

    expect(overlayCourtContextOf([rodadaAntiga, pendurada, dueloDepois], 'q2', NOW, SEM_MEMORIA).match).toBeNull();
  });

  it('rodada ao vivo continua mandando sobre o fim de rodada e a próxima', () => {
    const { m: r2, memoria } = encerradaHa(KOC_RESULTADO_MS);
    const r3 = rodada({ id: 'r3', matchNumber: 3, status: 'in_progress', matchStartedAt: new Date(NOW) });

    expect(overlayCourtContextOf([r2, r3], 'q2', NOW, memoria, OVERLAY_COURT_FOLLOW).match?.id).toBe('r3');
  });
});
