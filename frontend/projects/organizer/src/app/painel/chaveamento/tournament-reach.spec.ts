import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament, TournamentRole } from '../data/tournament.model';
import { tournamentReach } from './tournament-reach';

function tournament(id: string, myRole: TournamentRole | null): OrganizerTournament {
  return {
    id,
    name: `Torneio ${id}`,
    managerId: 'dono',
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
    categories: [],
    capacity: null,
    waitlistEnabled: true,
    leagueId: null,
    courts: [{ id: 'Q1', name: 'Quadra 1', order: 1 }],
    courtsCount: 1,
    matchOps: {
      dayStart: '07:00',
      dayEnd: '24:00',
      defaultMatchDurationMin: 30,
      minRestBetweenMatchesMin: 30,
      dynamicRescheduleEnabled: false,
    },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    myRole,
  };
}

const MEU = tournament('meu', 'owner');
const ALHEIO = tournament('alheio', null);

describe('tournamentReach', () => {
  it('sem torneio selecionado não tem o que resolver nem o que buscar', () => {
    expect(tournamentReach({ selectedId: null, owned: [MEU], loadingOwned: false, fetched: null, isSuperAdmin: true })).toEqual({
      tournament: null,
      fetchId: null,
    });
  });

  it('usa o torneio da lista do organizador — é ele que carrega o papel', () => {
    const reach = tournamentReach({ selectedId: 'meu', owned: [MEU], loadingOwned: false, fetched: null, isSuperAdmin: false });
    expect(reach.tournament?.myRole).toBe('owner');
    expect(reach.fetchId).toBeNull();
  });

  it('não busca doc nenhum enquanto a lista do organizador não terminou de carregar', () => {
    expect(tournamentReach({ selectedId: 'alheio', owned: [], loadingOwned: true, fetched: null, isSuperAdmin: true })).toEqual({
      tournament: null,
      fetchId: null,
    });
  });

  /** O bug: super admin abre um evento alheio pela aba Plataforma, as partidas carregam
   *  (coleção pública, pelo id da rota) e a tela de agendamento ficava em "Torneio não
   *  está disponível" porque `listMyTournaments` só devolve dono + staff. O servidor já
   *  autoriza super admin a gerenciar qualquer torneio (`assertCanManageTournament`). */
  it('manda buscar o doc do torneio alheio quando quem está vendo é super admin', () => {
    expect(tournamentReach({ selectedId: 'alheio', owned: [MEU], loadingOwned: false, fetched: null, isSuperAdmin: true })).toEqual({
      tournament: null,
      fetchId: 'alheio',
    });
  });

  it('usa o doc alheio já carregado, sem pedir de novo', () => {
    const reach = tournamentReach({
      selectedId: 'alheio',
      owned: [MEU],
      loadingOwned: false,
      fetched: ALHEIO,
      isSuperAdmin: true,
    });
    expect(reach.tournament?.id).toBe('alheio');
    expect(reach.fetchId).toBeNull();
  });

  it('descarta doc alheio de outro torneio e busca o selecionado', () => {
    expect(
      tournamentReach({ selectedId: 'outro', owned: [MEU], loadingOwned: false, fetched: ALHEIO, isSuperAdmin: true }),
    ).toEqual({ tournament: null, fetchId: 'outro' });
  });

  /** Sessão de conta apagada/sem vínculo: nada de grade fantasma nem de escrita que o
   *  servidor vai recusar — o estado "Torneio não está disponível" continua sendo a
   *  resposta honesta pra quem não alcança o torneio. */
  it('sem super admin, torneio fora da lista continua indisponível e não vira busca', () => {
    expect(tournamentReach({ selectedId: 'alheio', owned: [], loadingOwned: false, fetched: null, isSuperAdmin: false })).toEqual({
      tournament: null,
      fetchId: null,
    });
  });

  it('nem usa doc alheio que já esteja em mão se quem vê não é super admin', () => {
    expect(
      tournamentReach({ selectedId: 'alheio', owned: [], loadingOwned: false, fetched: ALHEIO, isSuperAdmin: false }),
    ).toEqual({ tournament: null, fetchId: null });
  });

  it('a lista do organizador ganha do doc alheio pro mesmo id (não perde o papel)', () => {
    const reach = tournamentReach({
      selectedId: 'meu',
      owned: [MEU],
      loadingOwned: false,
      fetched: tournament('meu', null),
      isSuperAdmin: true,
    });
    expect(reach.tournament?.myRole).toBe('owner');
    expect(reach.fetchId).toBeNull();
  });
});
