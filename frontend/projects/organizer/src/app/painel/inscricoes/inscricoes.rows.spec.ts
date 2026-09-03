import { EMPTY_INSCRIPTION_UNIFORM, type TournamentInscription } from '../data/inscriptions-repository';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament, OrganizerTournamentCategory } from '../data/tournament.model';
import { buildInscricaoRows } from './inscricoes.rows';

function participant(uid: string, name: string) {
  return { uid, name, photoUrl: null, levelsBySport: {}, legacyLevel: null };
}

function inscription(over: Partial<TournamentInscription> = {}): TournamentInscription {
  return {
    id: 'i1',
    tournamentId: 't1',
    categoryId: 'femB',
    teamId: 'team-1',
    teamName: 'Ana / Bia',
    customTeamName: null,
    participants: [participant('u1', 'Ana'), participant('u2', 'Bia')],
    participantNames: ['Ana', 'Bia'],
    paymentStatus: 'pending',
    paid: false,
    paidByOrganizer: false,
    needsVerification: false,
    sharePaidCount: 0,
    sharePaidUids: [],
    organizerConfirmedShareUids: [],
    partnerPending: false,
    lgpdAcceptedUids: [],
    uniformPlayer1: EMPTY_INSCRIPTION_UNIFORM,
    uniformPlayer2: EMPTY_INSCRIPTION_UNIFORM,
    uniformByUid: {},
    teamSize: null,
    captainUid: null,
    cancellationRequest: null,
    createdAt: null,
    ...over,
  };
}

function category(over: Partial<OrganizerTournamentCategory> = {}): OrganizerTournamentCategory {
  return {
    id: 'femB',
    name: 'Feminino B',
    maxTeams: null,
    entryFee: 0,
    teamSize: null,
    bracketFormat: null,
    teamsPerGroup: 3,
    qualifiersPerGroup: 2,
    bestOf: null,
    uniformType: null,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    uniformSizeOptionsTop: [],
    uniformSizeOptionsShorts: [],
    ...over,
  };
}

function tournament(over: Partial<OrganizerTournament> = {}): OrganizerTournament {
  return {
    id: 't1',
    name: 'Circuito Verão 2026',
    managerId: 'u1',
    sportLabel: 'Beach Tennis',
    sportId: 'beachTennis',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [category()],
    capacity: null,
    leagueId: null,
    courts: [],
    courtsCount: 0,
    matchOps: {
      dayStart: '08:00',
      dayEnd: '22:00',
      defaultMatchDurationMin: 30,
      minRestBetweenMatchesMin: 30,
      dynamicRescheduleEnabled: false,
    },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    ...over,
  };
}

describe('buildInscricaoRows', () => {
  it('põe a inscrição mais recente no topo', () => {
    const rows = buildInscricaoRows(
      [
        inscription({ id: 'velha', createdAt: new Date('2026-08-01T10:00:00Z') }),
        inscription({ id: 'nova', createdAt: new Date('2026-08-20T10:00:00Z') }),
      ],
      tournament(),
      new Map(),
    );
    expect(rows.map((r) => r.id)).toEqual(['nova', 'velha']);
  });

  it('casa o telefone com o atleta pelo uid', () => {
    const rows = buildInscricaoRows([inscription()], tournament(), new Map([['u2', '11988887777']]));
    expect(rows[0]?.athletes.map((a) => a.phone)).toEqual(['', '11988887777']);
  });

  // Na lista viva os contatos chegam DEPOIS das inscrições (callable à parte): a linha tem de
  // existir sem telefone e ganhar o número quando ele chega, sem recarregar nada.
  it('monta a linha sem telefone nenhum enquanto os contatos não chegaram', () => {
    const rows = buildInscricaoRows([inscription()], tournament(), new Map());
    expect(rows[0]?.athletes.map((a) => a.phone)).toEqual(['', '']);
  });

  // Mesmo motivo: o doc do torneio é outra ida à rede e pode chegar depois da primeira emissão
  // do listener — sem ele a linha aparece com a categoria em branco, não some.
  it('resolve o nome da categoria pelo torneio, e usa “—” sem torneio carregado', () => {
    expect(buildInscricaoRows([inscription()], tournament(), new Map())[0]?.categoria).toBe('Feminino B');
    expect(buildInscricaoRows([inscription()], null, new Map())[0]?.categoria).toBe('—');
  });

  it('diz “declararam” no modo direto e “pagaram” no modo app', () => {
    const parcial = inscription({ teamSize: 4, sharePaidCount: 1 });
    expect(buildInscricaoRows([parcial], tournament(), new Map())[0]?.payNote).toBe('1 de 4 pagaram');
    expect(
      buildInscricaoRows([parcial], tournament({ paymentMode: 'directWithOrganizer' }), new Map())[0]?.payNote,
    ).toBe('1 de 4 declararam');
  });
});
