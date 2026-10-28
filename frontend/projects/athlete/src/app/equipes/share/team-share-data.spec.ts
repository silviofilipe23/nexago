import type { AthletePublicProfile } from '../../data/public-profiles-repository';
import type { ArenaMatch, ArenaTeam } from '../../data/teams-repository';
import {
  athleteSeasonRanks,
  teamShareCardDataFrom,
  teamShareCardText,
  teamShareHue,
  teamShareKicker,
  teamShareMemberHue,
  teamShareMonogram,
  teamShareOriginLine,
  teamShareRankDetail,
  teamShareRankLabel,
  teamShareStyleLabel,
  teamShareStyles,
  teamShareThousands,
  type TeamShareCardData,
  type TeamShareSource,
} from './team-share-data';

function makeTeam(overrides: Partial<ArenaTeam> = {}): ArenaTeam {
  return {
    id: 'team-1',
    player1Id: 'u1',
    player2Id: 'u2',
    teamName: null,
    gender: null,
    teamSize: null,
    registrationPaid: true,
    memberUids: [],
    captainUid: null,
    tournamentId: null,
    createdAt: null,
    ...overrides,
  };
}

function makeProfile(id: string, overrides: Partial<AthletePublicProfile> = {}): AthletePublicProfile {
  return {
    id,
    displayName: `Atleta ${id}`,
    nickname: null,
    city: null,
    state: null,
    avatarUrl: null,
    primarySportId: 'VOLEI_PRAIA',
    ...overrides,
  } as AthletePublicProfile;
}

function makeMatch(id: string, overrides: Partial<ArenaMatch> = {}): ArenaMatch {
  return {
    id,
    tournamentId: 't1',
    categoryId: 'cat',
    matchType: 'Group',
    round: 1,
    status: 'completed',
    winnerId: 'team-1',
    teamAId: 'team-1',
    teamBId: 'rival',
    teamADescription: null,
    teamBDescription: null,
    resultA: null,
    resultB: null,
    sets: [],
    scheduleTime: null,
    matchEndedAt: new Date(2026, 4, 1),
    courtName: null,
    ...overrides,
  };
}

function build(overrides: Partial<TeamShareSource> = {}, profiles: AthletePublicProfile[] = [makeProfile('u1'), makeProfile('u2')]): TeamShareCardData {
  return teamShareCardDataFrom({
    team: makeTeam(),
    profiles: new Map(profiles.map((p) => [p.id, p])),
    matches: [],
    tournamentNames: new Map(),
    tournamentSport: null,
    rank: null,
    points: 0,
    ...overrides,
  });
}

describe('teamShareCardDataFrom', () => {
  it('dupla vira "A / B" com apelido ou primeiro e último nome', () => {
    const data = build({}, [makeProfile('u1', { displayName: 'Bruninho', nickname: 'Bruninho' }), makeProfile('u2', { displayName: 'Diego Souza de Barros' })]);

    expect(data.isDuo).toBeTrue();
    expect(data.name).toBe('Bruninho / Diego Barros');
    expect(data.members.map((m) => m.initials)).toEqual(['BR', 'DB']);
    expect(teamShareKicker(data)).toBe('PERFIL DA DUPLA');
    expect(teamShareStyleLabel(data, 'roster')).toBe('Ficha');
  });

  it('atleta sem perfil carregado entra como "Atleta" em vez de sumir do elenco', () => {
    const data = build({}, [makeProfile('u1', { displayName: 'Ana Lima' })]);

    expect(data.name).toBe('Ana Lima / Atleta');
    expect(data.members.length).toBe(2);
  });

  it('equipe nomeada usa o elenco inteiro, o nome dela e as iniciais no escudo', () => {
    const data = build(
      { team: makeTeam({ teamName: 'Arena Costa Sul', teamSize: 3, memberUids: ['u1', 'u2', 'u3'] }) },
      ['u1', 'u2', 'u3'].map((id) => makeProfile(id)),
    );

    expect(data.isDuo).toBeFalse();
    expect(data.name).toBe('Arena Costa Sul');
    expect(data.monogram).toBe('ACS');
    expect(data.members.length).toBe(3);
    expect(data.rosterSize).toBe(3);
    expect(teamShareKicker(data)).toBe('PERFIL DA EQUIPE');
    expect(teamShareStyleLabel(data, 'roster')).toBe('Elenco');
  });

  it('quarteto com convite pendente segue quarteto', () => {
    const data = build({ team: makeTeam({ teamName: 'Tubarões', teamSize: 4, memberUids: ['u1', 'u2'] }) });

    expect(data.isDuo).toBeFalse();
    expect(data.rosterSize).toBe(4);
    expect(data.members.length).toBe(2);
  });

  it('sem posição no ranking não existe o estilo Ranking', () => {
    const unranked = build();
    const ranked = build({ rank: 3, points: 4280 });

    expect(teamShareStyles(unranked)).toEqual(['profile', 'roster']);
    expect(teamShareRankLabel(unranked)).toBe('—');
    expect(teamShareStyles(ranked)).toEqual(['profile', 'roster', 'ranking']);
    expect(teamShareRankLabel(ranked)).toBe('3º');
    expect(ranked.points).toBe(4280);
  });

  it('cidade do capitão e "juntos desde" na linha de origem', () => {
    const data = build({ team: makeTeam({ captainUid: 'u2', createdAt: new Date(2024, 2, 10) }) }, [
      makeProfile('u1', { city: 'Recife', state: 'PE' }),
      makeProfile('u2', { city: 'Fortaleza', state: 'CE' }),
    ]);

    expect(data.location).toBe('Fortaleza · CE');
    expect(data.sinceYear).toBe(2024);
    expect(teamShareOriginLine(data)).toBe('FORTALEZA · CE · JUNTOS DESDE 2024');
  });

  it('sem capitão gravado, manda o primeiro do elenco; sem cidade nele, o próximo', () => {
    const data = build({}, [makeProfile('u1'), makeProfile('u2', { city: 'Natal' })]);

    expect(data.location).toBe('Natal');
    expect(teamShareOriginLine({ ...data, isDuo: false, sinceYear: 2025 })).toBe('NATAL · DESDE 2025');
  });

  it('esporte do torneio da equipe vence o do perfil do elenco', () => {
    // Rótulos do catálogo canônico (`sports/catalog.json`), os mesmos do app.
    expect(build({ tournamentSport: 'beachTennis' }).sportLabel).toBe('Beach tennis');
    expect(build().sportLabel).toBe('Vôlei de praia');
    expect(build({}, [makeProfile('u1', { primarySportId: null }), makeProfile('u2', { primarySportId: null })]).sportLabel).toBe('');
  });

  it('sequência: últimos cinco jogos decididos, mais recente à direita', () => {
    const matches = Array.from({ length: 7 }, (_, i) =>
      // Vence os pares: m0, m2, m4, m6.
      makeMatch(`m${i}`, { winnerId: i % 2 === 0 ? 'team-1' : 'rival', matchEndedAt: new Date(2026, 4, 1 + i) }),
    );
    const data = build({ matches: [...matches].reverse() });

    expect(data.form).toEqual([true, false, true, false, true]);
    expect(data.games).toBe(7);
    expect(data.wins).toBe(4);
    expect(data.winRatePercent).toBe(57);
  });

  it('partida não encerrada não conta; encerrada sem vencedor conta no aproveitamento', () => {
    const data = build({
      matches: [
        makeMatch('a'),
        makeMatch('b', { status: 'scheduled', winnerId: null }),
        makeMatch('c', { winnerId: null }),
        makeMatch('d', { winnerId: 'rival' }),
      ],
    });

    expect(data.games).toBe(3);
    expect(data.wins).toBe(1);
    expect(data.winRatePercent).toBe(33);
    expect(data.form).toEqual([true, false]);
  });

  it('últimas etapas: três mais recentes, vice vira 2º e semifinal vira SEMI', () => {
    const data = build({
      matches: [
        makeMatch('a', { tournamentId: 't1', matchType: 'Final', matchEndedAt: new Date(2026, 0, 1) }),
        makeMatch('b', { tournamentId: 't2', matchType: 'Final', winnerId: 'rival', matchEndedAt: new Date(2026, 1, 1) }),
        makeMatch('c', { tournamentId: 't3', matchType: 'Semi Final', winnerId: 'rival', matchEndedAt: new Date(2026, 2, 1) }),
        makeMatch('d', { tournamentId: 't4', matchType: 'Final', matchEndedAt: new Date(2026, 3, 1) }),
      ],
      tournamentNames: new Map([
        ['t1', 'Etapa 1'],
        ['t2', 'Etapa 2'],
        ['t3', 'Etapa 3'],
        ['t4', 'Etapa 4'],
      ]),
    });

    expect(data.stages.map((s) => `${s.name} ${s.result}`)).toEqual(['Etapa 4 1º', 'Etapa 3 SEMI', 'Etapa 2 2º']);
    expect(data.titles).toBe(2);
  });

  it('a derrota mais funda decide a etapa; quartas não vira vice', () => {
    const data = build({
      matches: [
        makeMatch('g', { tournamentId: 't1', matchType: 'Group', winnerId: 'rival' }),
        makeMatch('q', { tournamentId: 't1', matchType: 'Quarter-Final', winnerId: 'rival' }),
        makeMatch('k', { tournamentId: 't2', matchType: 'knockout', round: 2, winnerId: 'rival', matchEndedAt: new Date(2026, 5, 1) }),
      ],
    });

    expect(data.stages.map((s) => s.result)).toEqual(['Rodada 2', 'QUARTAS']);
    expect(data.stages.map((s) => s.name)).toEqual(['Torneio', 'Torneio']);
  });

  it('detalhe do atleta (ranking individual) chega na ficha', () => {
    const data = build({ memberDetails: new Map([['u2', '#12 NO RANKING 2026']]) });

    expect(data.members.map((m) => m.detail)).toEqual(['', '#12 NO RANKING 2026']);
  });

  it('o link é o perfil da equipe no portal do atleta', () => {
    expect(build().link).toBe('https://atleta.nexago.com.br/equipes/team-1');
  });
});

describe('teamShareMonogram', () => {
  it('pula conectivos e cai em duas letras', () => {
    expect(teamShareMonogram('Beach Club Iracema Sub-21')).toBe('BCI');
    expect(teamShareMonogram('Leões da Praia')).toBe('LP');
    expect(teamShareMonogram('Tubarões')).toBe('TU');
    expect(teamShareMonogram('  ')).toBe('?');
  });
});

describe('teamShareHue', () => {
  it('é estável por equipe e fica no círculo', () => {
    expect(teamShareHue('team-1')).toBe(teamShareHue('team-1'));
    expect(teamShareHue('team-1')).toBeGreaterThanOrEqual(0);
    expect(teamShareHue('team-1')).toBeLessThan(360);
    // Mesmo hash do app (`(h * 31 + unit) & 0x7fffffff`): id longo não estoura pra negativo.
    expect(teamShareHue('A9f3kQ2LmZx7Pq0RtY8w')).toBeGreaterThanOrEqual(0);
    expect(teamShareMemberHue(350, 1)).toBe((350 + 24 + 67) % 360);
  });
});

describe('teamShareThousands', () => {
  it('separa o milhar com ponto', () => {
    expect(teamShareThousands(0)).toBe('0');
    expect(teamShareThousands(820)).toBe('820');
    expect(teamShareThousands(14820)).toBe('14.820');
    expect(teamShareThousands(1234567)).toBe('1.234.567');
  });
});

describe('teamShareRankDetail / athleteSeasonRanks', () => {
  it('posição da temporada soma o resultado para o elenco inteiro da equipe', () => {
    const teams = new Map([
      ['tA', { player1Id: 'ana', player2Id: 'bia', memberUids: [] as string[] }],
      ['tB', { player1Id: 'ana', player2Id: 'caio', memberUids: [] as string[] }],
      ['tC', { player1Id: 'x', player2Id: 'y', memberUids: ['x', 'y', 'z'] }],
    ]);
    const ranks = athleteSeasonRanks(
      [
        { teamId: 'tA', pointsEarned: 100 },
        { teamId: 'tB', pointsEarned: 50 },
        { teamId: 'tC', pointsEarned: 120 },
        { teamId: 'sumiu', pointsEarned: 999 },
      ],
      teams,
    );

    // ana 150 · x/y/z 120 (o 3º do elenco também pontua) · bia 100 · caio 50.
    expect(ranks.get('ana')).toBe(1);
    expect(ranks.get('z')).toBe(4);
    expect(ranks.get('bia')).toBe(5);
    expect(ranks.get('caio')).toBe(6);
    expect(ranks.size).toBe(6);
  });

  it('escreve "#12 NO RANKING 2026" e some sem posição', () => {
    expect(teamShareRankDetail(12, 2026)).toBe('#12 NO RANKING 2026');
    expect(teamShareRankDetail(3, null)).toBe('#3 NO RANKING');
    expect(teamShareRankDetail(null, 2026)).toBe('');
  });
});

describe('teamShareCardText', () => {
  it('ranking puxa a posição, perfil apresenta a equipe', () => {
    const data = build({ rank: 3 }, [makeProfile('u1', { nickname: 'Ana' }), makeProfile('u2', { nickname: 'Bia' })]);

    expect(teamShareCardText(data, 'ranking')).toBe(
      '3º no ranking de equipes do nexaGO! Perfil da dupla Ana / Bia: https://atleta.nexago.com.br/equipes/team-1 #vamosnexa',
    );
    expect(teamShareCardText(data, 'profile')).toBe('Conheça a dupla Ana / Bia no nexaGO: https://atleta.nexago.com.br/equipes/team-1 #vamosnexa');
  });
});
