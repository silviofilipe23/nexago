import { resolveSport, sportLabel } from '@nexago/sports';
import type { AthletePublicProfile } from '../../data/public-profiles-repository';
import {
  matchIsCompleted,
  teamCaptainId,
  teamIsLargeRoster,
  teamMemberIds,
  type ArenaMatch,
  type ArenaTeam,
} from '../../data/teams-repository';

/**
 * Dados do card de compartilhar o perfil da equipe/dupla — porta de
 * `nexago_app/lib/features/tournaments/domain/team_profile/team_share_card.dart` (PR #1002).
 *
 * Função pura sobre o que o perfil já carregou (equipe, elenco, partidas, ranking geral de
 * equipes): nenhuma leitura nova. O desenho fica em `team-share-card.ts`.
 */

/** As três direções dos canvas "Card Perfil da Equipe" e "Card Perfil da Dupla". A dupla e a
 *  equipe (trio pra cima) têm desenhos próprios em cada uma. */
export type TeamShareCardStyle = 'profile' | 'roster' | 'ranking';

export interface TeamShareMember {
  name: string;
  initials: string;
  avatarUrl: string | null;
  /** Linha embaixo do nome na ficha da dupla ("#12 NO RANKING 2026"); vazia some. */
  detail: string;
}

/** Uma etapa recente: torneio e até onde a equipe foi ("1º", "2º", "SEMI"…). */
export interface TeamShareStage {
  name: string;
  result: string;
}

export interface TeamShareCardData {
  teamId: string;
  /** Nome da equipe; na dupla, "Ana / Bruno". */
  name: string;
  /** Dupla usa os desenhos de dupla (duas fotos, "A / B"); trio pra cima, os de equipe. */
  isDuo: boolean;
  /** Iniciais do escudo ("ACS") — a equipe não tem logo próprio. */
  monogram: string;
  /** Matiz do escudo e do brilho de fundo, estável por equipe. */
  hue: number;
  members: readonly TeamShareMember[];
  /** Tamanho declarado — quarteto com convite pendente segue quarteto. */
  rosterSize: number;
  /** "Vôlei de Praia"; vazio sem esporte conhecido. */
  sportLabel: string;
  /** "Fortaleza · CE"; vazio sem cidade no elenco. */
  location: string;
  sinceYear: number | null;
  /** Posição no ranking de `rankingLabel`; `null` fora dele. */
  rank: number | null;
  points: number;
  /** De qual ranking é a posição — no perfil, o geral de equipes (o mesmo do selo). */
  rankingLabel: string;
  games: number;
  wins: number;
  winRatePercent: number;
  titles: number;
  /** Até três, da mais recente para a mais antiga. */
  stages: readonly TeamShareStage[];
  /** Últimos até cinco jogos decididos, do mais antigo para o mais recente (`true` = vitória). */
  form: readonly boolean[];
  /** Perfil da equipe no portal (o QR). */
  link: string;
}

/** O QR leva o link completo; na arte só vai o host — o id da equipe não significa nada para
 *  quem lê. Fixo, como no app: o card é lido fora do portal (nos stories), e o perfil público da
 *  equipe mora sempre no portal de produção. */
export const TEAM_SHARE_PORTAL_HOST = 'atleta.nexago.com.br';

export function teamShareLink(teamId: string): string {
  return `https://${TEAM_SHARE_PORTAL_HOST}/equipes/${teamId}`;
}

export function teamShareHasRank(data: Pick<TeamShareCardData, 'rank'>): boolean {
  return data.rank != null && data.rank > 0;
}

export function teamShareRankLabel(data: Pick<TeamShareCardData, 'rank'>): string {
  return teamShareHasRank(data) ? `${data.rank}º` : '—';
}

export function teamShareUnit(data: Pick<TeamShareCardData, 'isDuo'>): 'dupla' | 'equipe' {
  return data.isDuo ? 'dupla' : 'equipe';
}

/** "PERFIL DA DUPLA" / "PERFIL DA EQUIPE". */
export function teamShareKicker(data: Pick<TeamShareCardData, 'isDuo'>): string {
  return `PERFIL DA ${teamShareUnit(data).toUpperCase()}`;
}

/** "SIGA A DUPLA" / "SIGA A EQUIPE". */
export function teamShareFollowLabel(data: Pick<TeamShareCardData, 'isDuo'>): string {
  return `SIGA A ${teamShareUnit(data).toUpperCase()}`;
}

/** O ranking do selo do perfil: o geral de equipes. */
export const TEAM_SHARE_GENERAL_RANKING_LABEL = 'RANKING DE EQUIPES · GERAL';

/** "FORTALEZA · CE · JUNTOS DESDE 2024": cidade e há quanto tempo. */
export function teamShareOriginLine(data: Pick<TeamShareCardData, 'location' | 'sinceYear' | 'isDuo'>): string {
  const since = data.sinceYear == null ? '' : data.isDuo ? `JUNTOS DESDE ${data.sinceYear}` : `DESDE ${data.sinceYear}`;
  return [data.location, since]
    .filter((s) => s.length > 0)
    .join(' · ')
    .toUpperCase();
}

/** Sem posição no ranking não existe o card de ranking. */
export function teamShareStyles(data: Pick<TeamShareCardData, 'rank'>): TeamShareCardStyle[] {
  return teamShareHasRank(data) ? ['profile', 'roster', 'ranking'] : ['profile', 'roster'];
}

export function teamShareStyleLabel(data: Pick<TeamShareCardData, 'isDuo'>, style: TeamShareCardStyle): string {
  switch (style) {
    case 'profile':
      return 'Perfil';
    case 'roster':
      return data.isDuo ? 'Ficha' : 'Elenco';
    case 'ranking':
      return 'Ranking';
  }
}

/** A hashtag da campanha na legenda — `withNexaHashtag` do app, sem duplicar. */
const NEXA_HASHTAG = '#vamosnexa';

/** Legenda que vai junto do PNG. */
export function teamShareCardText(data: TeamShareCardData, style: TeamShareCardStyle): string {
  const unit = `${teamShareUnit(data)} ${data.name}`;
  const lead =
    style === 'ranking' && teamShareHasRank(data) ? `${data.rank}º no ranking de equipes do nexaGO! Perfil da ${unit}` : `Conheça a ${unit} no nexaGO`;
  const base = `${lead}: ${data.link}`;
  return base.toLowerCase().includes(NEXA_HASHTAG) ? base : `${base} ${NEXA_HASHTAG}`;
}

export interface TeamShareSource {
  team: ArenaTeam;
  /** Perfis públicos do elenco por uid — quem não carregou vira "Atleta". */
  profiles: ReadonlyMap<string, AthletePublicProfile>;
  matches: readonly ArenaMatch[];
  tournamentNames: ReadonlyMap<string, string>;
  /** `sport` cru do torneio da equipe (`team.tournamentId`); `null` sem ele. */
  tournamentSport: string | null;
  /** Posição no ranking geral de equipes. */
  rank: number | null;
  points: number;
  /** Ranking individual por uid ("#12 NO RANKING 2026"), para a ficha da dupla. */
  memberDetails?: ReadonlyMap<string, string>;
}

export function teamShareCardDataFrom(source: TeamShareSource): TeamShareCardData {
  const { team, profiles, matches } = source;
  const teamId = team.id;
  const isDuo = !teamIsLargeRoster(team);
  const ids = teamMemberIds(team);
  const members = ids.map((uid) => memberOf(profiles.get(uid), source.memberDetails?.get(uid) ?? ''));
  // Equipe nomeada sempre tem nome; sem ele, "Fulano / Beltrano" esconderia o resto do elenco.
  const name = isDuo ? members.map((m) => m.name).join(' / ') : (team.teamName ?? 'Equipe');
  const completed = matches.filter(matchIsCompleted);
  const decided = decidedMatches(completed);
  const wins = decided.filter((m) => m.winnerId === teamId).length;
  const campaigns = teamShareCampaigns(completed, teamId, source.tournamentNames);

  return {
    teamId,
    name,
    isDuo,
    monogram: teamShareMonogram(name),
    hue: teamShareHue(teamId),
    members,
    rosterSize: team.teamSize != null && team.teamSize > 0 ? team.teamSize : ids.length,
    link: teamShareLink(teamId),
    sportLabel: sportLabelOf(source.tournamentSport, ids.map((uid) => profiles.get(uid))),
    location: locationOf(team, profiles),
    sinceYear: team.createdAt?.getFullYear() ?? null,
    rank: source.rank != null && source.rank > 0 ? source.rank : null,
    points: source.points,
    rankingLabel: TEAM_SHARE_GENERAL_RANKING_LABEL,
    games: completed.length,
    wins,
    // Mesma conta do `buildTeamProfileStats` do app: sobre todas as encerradas, com ou sem vencedor.
    winRatePercent: completed.length === 0 ? 0 : Math.round((wins / completed.length) * 100),
    titles: campaigns.filter((c) => c.result === '1º').length,
    stages: campaigns.slice(0, 3).map((c) => ({ name: c.name, result: teamShareStageResult(c.result) })),
    form: decided.slice(-5).map((m) => m.winnerId === teamId),
  };
}

/** Iniciais do escudo: a primeira letra das três primeiras palavras que contam ("Arena Costa
 *  Sul" → "ACS"); palavra única dá duas letras. */
export function teamShareMonogram(name: string): string {
  const skip = new Set(['de', 'da', 'do', 'das', 'dos', 'e', '/', '&']);
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !skip.has(w.toLowerCase()));
  if (words.length === 0) return '?';
  if (words.length === 1) return firstGraphemesUpper(words[0]!, 2);
  return words
    .slice(0, 3)
    .map((w) => firstGraphemesUpper(w, 1))
    .join('');
}

/** Matiz estável por equipe: o mesmo id sempre dá a mesma cor — o mesmo hash do app, então a
 *  equipe tem a mesma cor nos dois. */
export function teamShareHue(teamId: string): number {
  let hash = 0;
  for (let i = 0; i < teamId.length; i++) {
    hash = (hash * 31 + teamId.charCodeAt(i)) & 0x7fffffff;
  }
  return hash % 360;
}

/** Matizes dos atletas sem foto: deslocados a partir do matiz da equipe para os vizinhos não
 *  saírem iguais. */
export function teamShareMemberHue(teamHue: number, index: number): number {
  return (teamHue + 24 + index * 67) % 360;
}

/** O resultado da campanha por extenso para quem não conhece a sigla da chave: vice vira "2º",
 *  semifinal vira "SEMI". */
export function teamShareStageResult(label: string): string {
  switch (label) {
    case 'F':
      return '2º';
    case 'SF':
      return 'SEMI';
    case 'QF':
      return 'QUARTAS';
    case 'O16':
      return 'OITAVAS';
    default:
      return label;
  }
}

/** "14.820": milhar com ponto, como o canvas (`toLocaleString('pt-BR')`). */
export function teamShareThousands(n: number): string {
  const digits = String(Math.abs(Math.trunc(n)));
  let out = n < 0 ? '-' : '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return out;
}

/** Apelido quando tem; senão primeiro e último nome — "Maria Eduarda Santos Oliveira" não cabe
 *  ao lado do parceiro. */
export function teamShareMemberName(profile: Pick<AthletePublicProfile, 'nickname' | 'displayName'> | undefined): string {
  if (!profile) return 'Atleta';
  const nickname = profile.nickname?.trim() ?? '';
  if (nickname) return nickname;
  const words = profile.displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Atleta';
  if (words.length === 1) return words[0]!;
  return `${words[0]} ${words[words.length - 1]}`;
}

/** "#12 NO RANKING 2026" — o ranking individual embaixo do nome na ficha da dupla. Sem posição,
 *  a linha some. */
export function teamShareRankDetail(rank: number | null, seasonYear: number | null): string {
  if (rank == null || rank <= 0) return '';
  return seasonYear == null ? `#${rank} NO RANKING` : `#${rank} NO RANKING ${seasonYear}`;
}

/**
 * Posição de cada atleta no ranking da temporada — espelha `loadAthleteRankingByYear` do app:
 * cada resultado do ano soma os pontos para todo o elenco da equipe que o conquistou; quem não
 * tem equipe carregada não pontua. Ordem por total, posição = índice + 1.
 */
export function athleteSeasonRanks(
  results: readonly { teamId: string; pointsEarned: number }[],
  teams: ReadonlyMap<string, Pick<ArenaTeam, 'player1Id' | 'player2Id' | 'memberUids'>>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const result of results) {
    const team = teams.get(result.teamId);
    if (!team) continue;
    for (const uid of teamMemberIds(team)) totals.set(uid, (totals.get(uid) ?? 0) + result.pointsEarned);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(sorted.map(([uid], i) => [uid, i + 1]));
}

interface Campaign {
  tournamentId: string;
  name: string;
  /** "1º", "F", "SF"… — o rótulo curto da campanha do app. */
  result: string;
  playedAt: Date | null;
}

/**
 * Uma campanha por torneio, da mais recente para a mais antiga — espelha `buildTeamCampaigns`
 * do app (só o rótulo e a data, que é o que o card usa).
 */
export function teamShareCampaigns(
  matches: readonly ArenaMatch[],
  teamId: string,
  tournamentNames: ReadonlyMap<string, string>,
): Campaign[] {
  const byTournament = new Map<string, ArenaMatch[]>();
  for (const match of matches) {
    if (!matchIsCompleted(match)) continue;
    const tid = match.tournamentId.trim();
    if (!tid) continue;
    const list = byTournament.get(tid) ?? [];
    list.push(match);
    byTournament.set(tid, list);
  }

  const campaigns: Campaign[] = [];
  for (const [tournamentId, list] of byTournament) {
    const latest = list.reduce<Date | null>((acc, m) => {
      const at = playedAtOf(m);
      return at && (!acc || at > acc) ? at : acc;
    }, null);
    campaigns.push({
      tournamentId,
      name: tournamentNames.get(tournamentId)?.trim() || 'Torneio',
      result: campaignResultLabel(list, teamId),
      playedAt: latest,
    });
  }

  // Sem data vai para o fim, como no app.
  return campaigns.sort((a, b) => {
    if (!a.playedAt && !b.playedAt) return 0;
    if (!a.playedAt) return 1;
    if (!b.playedAt) return -1;
    return b.playedAt.getTime() - a.playedAt.getTime();
  });
}

/** Venceu a final → "1º"; senão a fase da derrota mais funda; sem derrota, a fase do primeiro
 *  jogo (a campanha ainda em andamento). */
function campaignResultLabel(matches: readonly ArenaMatch[], teamId: string): string {
  if (matches.some((m) => m.matchType.trim().toLowerCase() === 'final' && m.winnerId === teamId)) return '1º';

  let deepest: ArenaMatch | null = null;
  let maxDepth = -1;
  for (const match of matches) {
    if (match.winnerId === teamId || !match.winnerId) continue;
    const depth = roundDepth(match);
    if (depth > maxDepth) {
      maxDepth = depth;
      deepest = match;
    }
  }
  if (deepest) return abbreviateRoundLabel(matchRoundLabel(deepest));
  return matches.length > 0 ? abbreviateRoundLabel(matchRoundLabel(matches[0]!)) : '—';
}

function roundDepth(match: ArenaMatch): number {
  const type = match.matchType.trim().toLowerCase();
  if (type === 'final') return 100;
  if (type === 'third place') return 90;
  if (type.includes('semi')) return 80;
  if (type.includes('quarter')) return 70;
  if (type.includes('16')) return 60;
  if (type.includes('32')) return 50;
  if (match.round > 0) return 40 + match.round;
  return 10;
}

/** `matchTypeLabelPt` do app. */
function matchTypeLabelPt(type: string): string {
  if (type.toLowerCase().replace(/_/g, ' ') === 'grand final') return 'Grand Final';
  const labels: Record<string, string> = {
    Group: 'Fase de Grupos',
    group: 'Fase de Grupos',
    groups: 'Fase de Grupos',
    knockout: 'Mata-mata',
    WB: 'Chave Principal',
    LB: 'Chave de Repescagem',
    Final: 'Final',
    'Third Place': 'Disputa 3º lugar',
    'Semi-Final': 'Semifinais',
    'Quarter-Final': 'Quartas de final',
    'Round of 16': 'Oitavas de final',
    'Round of 32': '32 avos de final',
    Other: 'Partida',
  };
  return labels[type] ?? type;
}

/** `matchRoundLabel` do app (o portal não lê `description`, que só entra sem `matchType`). */
function matchRoundLabel(match: ArenaMatch): string {
  const type = match.matchType.trim();
  if (type === 'WB' || type === 'LB') return match.round > 0 ? `${type}${match.round}` : matchTypeLabelPt(type);
  if (type === 'Final') return 'Final';
  if (type.toLowerCase().replace(/_/g, ' ') === 'grand final') return 'Grand Final';
  if (type === 'Third Place') return '3º lugar';
  if (type.toLowerCase() === 'knockout' && match.round > 0) return `Rodada ${match.round}`;
  if (type) return matchTypeLabelPt(type);
  if (match.round > 0) return `Rodada ${match.round}`;
  return 'Eliminatórias';
}

/** A sigla da fase. Quartas, oitavas e 32 avos antes de "final": "Quartas de final" também
 *  contém a palavra, e cair no "F" escreveria "2º" no card de quem parou nas quartas. (O app
 *  testa "final" primeiro; só chave legada com `matchType` por extenso chega a esse caso.) */
function abbreviateRoundLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('semi')) return 'SF';
  if (normalized.includes('quart')) return 'QF';
  if (normalized.includes('oitav')) return 'O16';
  if (normalized.includes('32')) return 'R32';
  if (normalized.includes('final')) return 'F';
  return label.length <= 4 ? label.toUpperCase() : label;
}

function playedAtOf(match: ArenaMatch): Date | null {
  return match.matchEndedAt ?? match.scheduleTime;
}

/** Jogos encerrados com vencedor, do mais antigo para o mais recente (sem data vão para o
 *  começo). */
function decidedMatches(completed: readonly ArenaMatch[]): ArenaMatch[] {
  return completed.filter((m) => m.winnerId).sort((a, b) => (playedAtOf(a)?.getTime() ?? 0) - (playedAtOf(b)?.getTime() ?? 0));
}

function memberOf(profile: AthletePublicProfile | undefined, detail: string): TeamShareMember {
  const name = teamShareMemberName(profile);
  return {
    name,
    initials: initialsOf(name),
    avatarUrl: profile?.avatarUrl?.trim() || null,
    detail,
  };
}

/** Esporte do TORNEIO da equipe quando o catálogo reconhece; senão o esporte principal do
 *  primeiro do elenco — o `teamProfileHeaderSportLabel` do app. */
function sportLabelOf(tournamentSport: string | null, roster: readonly (AthletePublicProfile | undefined)[]): string {
  const fromTournament = resolveSport(tournamentSport)?.label;
  if (fromTournament) return fromTournament;
  const first = roster.find((p) => p != null);
  return sportLabel(first?.primarySportId ?? null) ?? '';
}

/** Cidade do capitão; sem ela, a do primeiro do elenco que tiver. */
function locationOf(team: ArenaTeam, profiles: ReadonlyMap<string, AthletePublicProfile>): string {
  const captain = teamCaptainId(team);
  const ids = teamMemberIds(team);
  const ordered = [...ids.filter((id) => id === captain), ...ids.filter((id) => id !== captain)];
  for (const uid of ordered) {
    const city = profiles.get(uid)?.city?.trim() ?? '';
    if (!city) continue;
    const state = profiles.get(uid)?.state?.trim() ?? '';
    return state ? `${city} · ${state}` : city;
  }
  return '';
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

/** Os primeiros grafemas em caixa alta — nunca `str[0]`, que parte emoji ao meio. */
function firstGraphemesUpper(input: string, count: number): string {
  const graphemes = segmenter ? [...segmenter.segment(input)].map((s) => s.segment) : [...input];
  if (graphemes.length === 0 || count <= 0) return '?';
  return graphemes.slice(0, count).join('').toUpperCase();
}

/** `initialsFromDisplayName` do app: primeira e última palavra; palavra única dá duas letras. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return firstGraphemesUpper(parts[0]!, 2);
  return `${firstGraphemesUpper(parts[0]!, 1)}${firstGraphemesUpper(parts[parts.length - 1]!, 1)}`;
}
