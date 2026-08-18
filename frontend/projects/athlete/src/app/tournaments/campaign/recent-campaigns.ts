import { matchIsCompleted } from '../../data/matches-repository';
import { outcomeOf, sideOf } from '../tournament-live.selectors';
import { campaignPlacementOf, type CampaignPlacement, type PlacementMatch } from './campaign-share';

/**
 * O card de campanha da HOME: quanto tempo ele fica de pé depois do torneio, e quantos cabem.
 *
 * A janela é curta de propósito. O card existe pro impulso de postar logo depois do evento; passado
 * isso ele vira entulho numa tela que já disputa espaço com evolução, comunidade e missões. Quem
 * quiser compartilhar mais tarde continua achando o card na aba Minha inscrição do torneio, que
 * não expira.
 */
export const CAMPAIGN_HOME_WINDOW_DAYS = 5;

/** Teto de cards na home. Um fim de semana com 3 categorias empurraria o resto da home pra baixo;
 *  o excedente continua acessível pela aba Minha inscrição. */
export const CAMPAIGN_HOME_MAX_CARDS = 2;

/** O que esta derivação lê de uma inscrição. */
export interface CampaignRegistrationLike {
  tournamentId: string;
  categoryId: string;
  teamId: string | null;
  /** `null` = dupla clássica; 3–5 = categoria de equipe, que não recebe card. */
  teamSize: number | null;
}

/** O que ela lê de um torneio. */
export interface CampaignTournamentLike {
  name: string;
  startAt: Date | null;
  endAt: Date | null;
  isCancelled: boolean;
}

/**
 * A partida como a HOME a conhece.
 *
 * É `PlacementMatch` (o mínimo que decide colocação) mais `tournamentId`. A home carrega
 * `ArenaMatch` (`teams-repository`), que não tem `round`, `poolId` nem `bestOf` — e é justamente
 * por a colocação ser decidida SÓ pelo `matchType` que o card da home não precisa de nenhuma
 * consulta nova pra saber se o atleta foi campeão.
 */
export type RecentCampaignMatch = PlacementMatch & { tournamentId: string };

export interface RecentCampaign {
  tournamentId: string;
  categoryId: string;
  teamId: string;
  tournamentName: string;
  /** `null` enquanto o doc do torneio (que carrega as categorias) ainda não chegou. */
  categoryName: string | null;
  placement: CampaignPlacement;
  wins: number;
  losses: number;
  /** A data que colocou esta campanha na janela — fim do torneio, ou início na falta dele. */
  referenceAt: Date;
}

export interface RecentCampaignSource {
  registrations: readonly CampaignRegistrationLike[];
  tournamentsById: ReadonlyMap<string, CampaignTournamentLike>;
  categoryNameOf: (tournamentId: string, categoryId: string) => string | null;
  matches: readonly RecentCampaignMatch[];
  myTeamIds: ReadonlySet<string>;
  now: Date;
  windowDays?: number;
  maxCards?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * As campanhas que merecem card na home: torneio do atleta que JÁ TERMINOU há no máximo
 * `CAMPAIGN_HOME_WINDOW_DAYS` dias, com pelo menos uma partida encerrada dele na categoria.
 *
 * Função pura sobre dados que a home JÁ carrega — inscrições, resumos de torneio e as partidas
 * encerradas das equipes do atleta. Nenhuma consulta nova no boot: a imagem em si, que precisa de
 * partidas completas, equipes e perfis, só é montada quando o atleta toca em compartilhar.
 *
 * A régua é o FIM do torneio, com o início como reserva — um torneio de um dia costuma gravar só
 * `startAt`. Sem nenhuma das duas datas não dá pra afirmar janela nenhuma, e a campanha fica de
 * fora em vez de aparecer pra sempre.
 *
 * Torneio que ainda não terminou não entra: durante o evento quem serve é o Modo Focus, e um card
 * de "campanha" no meio da disputa contaria uma história pela metade.
 */
export function recentCampaignsOf(source: RecentCampaignSource): RecentCampaign[] {
  const windowMs = (source.windowDays ?? CAMPAIGN_HOME_WINDOW_DAYS) * DAY_MS;
  const now = source.now.getTime();

  const campaigns: RecentCampaign[] = [];

  for (const registration of source.registrations) {
    // Equipe (trio+) não recebe card: a arte desenha dois atletas. Mesmo portão das outras entradas.
    if (registration.teamSize != null || !registration.teamId) continue;

    const tournament = source.tournamentsById.get(registration.tournamentId);
    if (!tournament || tournament.isCancelled) continue;

    const referenceAt = tournament.endAt ?? tournament.startAt;
    if (!referenceAt) continue;
    const elapsed = now - referenceAt.getTime();
    if (elapsed < 0 || elapsed > windowMs) continue;

    // Por TORNEIO antes de por categoria: `categoryId` é um id de subdocumento e não é garantido
    // único entre torneios diferentes.
    const mine = source.matches.filter((m) => m.tournamentId === registration.tournamentId);
    const decided = mine.filter(
      (m) => m.categoryId === registration.categoryId && sideOf(m, source.myTeamIds) !== null && matchIsCompleted(m) && outcomeOf(m, source.myTeamIds) !== null,
    );
    if (decided.length === 0) continue;

    const wins = decided.filter((m) => outcomeOf(m, source.myTeamIds) === 'win').length;

    campaigns.push({
      tournamentId: registration.tournamentId,
      categoryId: registration.categoryId,
      teamId: registration.teamId,
      tournamentName: tournament.name,
      categoryName: source.categoryNameOf(registration.tournamentId, registration.categoryId),
      placement: campaignPlacementOf(mine, registration.categoryId, source.myTeamIds),
      wins,
      losses: decided.length - wins,
      referenceAt,
    });
  }

  return campaigns
    .sort((a, b) => b.referenceAt.getTime() - a.referenceAt.getTime())
    .slice(0, source.maxCards ?? CAMPAIGN_HOME_MAX_CARDS);
}
