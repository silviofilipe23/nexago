/** Roster público do torneio no portal — espelho de
 *  `nexago_app/lib/features/tournaments/domain/tournament_enrolled_athletes_logic.dart`.
 *
 *  As duas cópias TÊM de concordar: a mesma inscrição não pode ser "confirmada" no app e pendente
 *  no portal. Os casos aqui são os mesmos que o lado Dart cobre. */

import {
  buildEnrolledTeams,
  enrolledAthleteDisplayName,
  filterEnrolledTeamsByCategory,
  groupEnrolledTeamsByCategory,
  inscriptionMemberUids,
  isConfirmedInscription,
  type RosterCategory,
  type RosterProfile,
  type RosterRow,
} from './enrolled-teams';

const CATEGORIES: RosterCategory[] = [
  { id: 'c1', categoryName: 'Masculino B' },
  { id: 'c2', categoryName: 'Feminino A' },
];

function profiles(entries: Record<string, string>): Map<string, RosterProfile> {
  return new Map(
    Object.entries(entries).map(([uid, displayName]) => [uid, { displayName, avatarUrl: null }]),
  );
}

function row(registrationId: string, inscription: Record<string, unknown>, team: Record<string, unknown> | null = null): RosterRow {
  return { registrationId, inscription: { isPaid: true, ...inscription }, team };
}

describe('isConfirmedInscription', () => {
  it('aceita a inscrição paga, fora da fila e com elenco fechado', () => {
    expect(isConfirmedInscription({ isPaid: true })).toBe(true);
  });

  it('recusa inscrição não paga', () => {
    expect(isConfirmedInscription({ isPaid: false })).toBe(false);
  });

  it('recusa lista de espera e convite pendente', () => {
    expect(isConfirmedInscription({ isPaid: true, waitlist: true })).toBe(false);
    expect(isConfirmedInscription({ isPaid: true, partnerPending: true })).toBe(false);
  });
});

describe('inscriptionMemberUids', () => {
  it('une participantUids, os slots do time e o player1Id legado, sem repetir', () => {
    const uids = inscriptionMemberUids({
      inscription: { participantUids: ['u1', 'u2'], player1Id: 'u1' },
      team: { player1Id: 'u1', player2Id: 'u3', memberUids: ['u3', 'u4'] },
    });

    expect(uids).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('cobre o trio+ que só existe em participantUids', () => {
    const uids = inscriptionMemberUids({ inscription: { participantUids: ['a', 'b', 'c'] }, team: null });
    expect(uids).toEqual(['a', 'b', 'c']);
  });
});

describe('enrolledAthleteDisplayName', () => {
  it('corta o nome em duas palavras', () => {
    expect(enrolledAthleteDisplayName('Ana Paula Silva Souza')).toBe('Ana Paula');
  });

  it('mantém o nome único', () => {
    expect(enrolledAthleteDisplayName('Ana')).toBe('Ana');
  });

  it('cai no genérico quando não há nome', () => {
    expect(enrolledAthleteDisplayName('   ')).toBe('Atleta');
  });
});

describe('buildEnrolledTeams', () => {
  it('deriva o nome da equipe dos atletas quando ela não tem nome próprio', () => {
    const teams = buildEnrolledTeams({
      rows: [row('r1', { categoryId: 'c1', participantUids: ['u1', 'u2'] })],
      profiles: profiles({ u1: 'Ana Paula Silva', u2: 'Bia Costa' }),
      categories: CATEGORIES,
    });

    expect(teams.length).toBe(1);
    expect(teams[0].displayName).toBe('Ana Paula / Bia Costa');
    expect(teams[0].categoryName).toBe('Masculino B');
    expect(teams[0].members.map((m) => m.name)).toEqual(['Ana Paula', 'Bia Costa']);
  });

  it('o nome real da equipe ganha do derivado', () => {
    const teams = buildEnrolledTeams({
      rows: [row('r1', { categoryId: 'c1', participantUids: ['u1'], customTeamName: 'Vôlei do Bem' })],
      profiles: profiles({ u1: 'Ana Paula Silva' }),
      categories: CATEGORIES,
    });

    expect(teams[0].displayName).toBe('Vôlei do Bem');
  });

  it('deixa fora quem não confirmou e quem não tem categoria ou elenco', () => {
    const teams = buildEnrolledTeams({
      rows: [
        row('paga', { categoryId: 'c1', participantUids: ['u1'] }),
        row('nao-paga', { isPaid: false, categoryId: 'c1', participantUids: ['u2'] }),
        row('fila', { categoryId: 'c1', waitlist: true, participantUids: ['u2'] }),
        row('sem-categoria', { participantUids: ['u2'] }),
        row('sem-elenco', { categoryId: 'c1' }),
      ],
      profiles: profiles({ u1: 'Ana', u2: 'Bia' }),
      categories: CATEGORIES,
    });

    expect(teams.map((t) => t.registrationId)).toEqual(['paga']);
  });

  it('ordena por categoria e, dentro dela, por nome da equipe', () => {
    const teams = buildEnrolledTeams({
      rows: [
        row('r1', { categoryId: 'c1', participantUids: ['u2'] }),
        row('r2', { categoryId: 'c2', participantUids: ['u1'] }),
        row('r3', { categoryId: 'c1', participantUids: ['u1'] }),
      ],
      profiles: profiles({ u1: 'Ana', u2: 'Zeca' }),
      categories: CATEGORIES,
    });

    expect(teams.map((t) => t.categoryName)).toEqual(['Feminino A', 'Masculino B', 'Masculino B']);
    expect(teams.map((t) => t.displayName)).toEqual(['Ana', 'Ana', 'Zeca']);
  });

  it('atleta sem perfil carregado não derruba a linha', () => {
    const teams = buildEnrolledTeams({
      rows: [row('r1', { categoryId: 'c1', participantUids: ['fantasma'] })],
      profiles: profiles({}),
      categories: CATEGORIES,
    });

    expect(teams[0].members[0].name).toBe('Atleta');
    expect(teams[0].displayName).toBe('Equipe');
  });

  it('categoria fora da lista do torneio mostra o id em vez de sumir', () => {
    const teams = buildEnrolledTeams({
      rows: [row('r1', { categoryId: 'orfa', participantUids: ['u1'] })],
      profiles: profiles({ u1: 'Ana' }),
      categories: CATEGORIES,
    });

    expect(teams[0].categoryName).toBe('orfa');
  });
});

describe('filterEnrolledTeamsByCategory / groupEnrolledTeamsByCategory', () => {
  const teams = buildEnrolledTeams({
    rows: [
      row('r1', { categoryId: 'c1', participantUids: ['u1'] }),
      row('r2', { categoryId: 'c2', participantUids: ['u2'] }),
      row('r3', { categoryId: 'c1', participantUids: ['u3'] }),
    ],
    profiles: profiles({ u1: 'Ana', u2: 'Bia', u3: 'Zeca' }),
    categories: CATEGORIES,
  });

  it('categoria vazia significa todas', () => {
    expect(filterEnrolledTeamsByCategory(teams, '').length).toBe(3);
    expect(filterEnrolledTeamsByCategory(teams, null).length).toBe(3);
  });

  it('filtra pela categoria escolhida', () => {
    expect(filterEnrolledTeamsByCategory(teams, 'c1').map((t) => t.registrationId)).toEqual(['r1', 'r3']);
  });

  it('agrupa na ordem já ordenada, uma seção por categoria', () => {
    const groups = groupEnrolledTeamsByCategory(teams);
    expect(groups.map((g) => g.categoryName)).toEqual(['Feminino A', 'Masculino B']);
    expect(groups[1].teams.length).toBe(2);
  });
});
