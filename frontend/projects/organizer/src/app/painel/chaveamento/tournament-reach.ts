import type { OrganizerTournament } from '../data/tournament.model';

export interface TournamentReachInput {
  /** Torneio do contexto (id da rota). */
  selectedId: string | null;
  /** `listMyTournaments`: só dono + staff — não tem o caminho do super admin. */
  owned: OrganizerTournament[];
  /** A lista acima ainda está chegando. */
  loadingOwned: boolean;
  /** Doc buscado por id (`getTournament`), sem papel — só serve ao super admin. */
  fetched: OrganizerTournament | null;
  isSuperAdmin: boolean;
}

export interface TournamentReach {
  /** Torneio do contexto; `null` mantém o estado "Torneio não está disponível". */
  tournament: OrganizerTournament | null;
  /** Id a buscar por doc; `null` quando não há o que buscar. */
  fetchId: string | null;
}

/**
 * Quem é o torneio do contexto de chaveamento e se falta buscar o doc dele.
 *
 * A lista do organizador (`listMyTournaments`) é dono + staff, e é ela que carrega
 * `myRole` — por isso ganha sempre que tem o id. Fora dela, só super admin alcança o
 * torneio: é o mesmo alcance que o servidor já dá (`assertCanManageTournament` aceita a
 * claim `superAdmin` em qualquer torneio) e o que a aba Plataforma abre. Pra qualquer
 * outra sessão, torneio fora da lista segue indisponível: nada de desenhar uma grade que
 * o servidor vai recusar na primeira escrita.
 */
export function tournamentReach(input: TournamentReachInput): TournamentReach {
  const { selectedId, owned, loadingOwned, fetched, isSuperAdmin } = input;
  if (!selectedId) return { tournament: null, fetchId: null };

  const mine = owned.find((t) => t.id === selectedId);
  if (mine) return { tournament: mine, fetchId: null };

  // Antes da lista chegar não se sabe se o torneio é da casa — buscar aqui seria pedir
  // um doc que a lista traz logo em seguida, com papel e tudo.
  if (loadingOwned || !isSuperAdmin) return { tournament: null, fetchId: null };

  if (fetched?.id === selectedId) return { tournament: fetched, fetchId: null };
  return { tournament: null, fetchId: selectedId };
}
