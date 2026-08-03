import { matchBestOf, matchClosedSets, matchIsLive, matchLiveCurrentSet, matchSetWins, type MatchSet, type TournamentMatch } from '../data/matches-repository';
import { displaySetsOf } from './tournament-live.selectors';

/** Formatação compartilhada pela aba Hoje, pela aba Partidas e pela tela de Partida. Tudo em
 *  America/Sao_Paulo, o fuso canônico dos eventos. */

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

export function timeLabelOf(date: Date | null): string {
  return date ? TIME.format(date) : '—';
}

export function dayLabelOf(date: Date | null): string | null {
  if (!date) return null;
  const wd = WEEKDAY.format(date).replace('.', '');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${DAY_MONTH.format(date)}`;
}

/** `1` → "Quadra 1"; nomes que já contêm "quadra" passam intactos. Porta de
 *  `formatCourtLabelForCard` (tournament_match_display.dart). */
export function courtLabelOf(courtName: string | null): string | null {
  const court = courtName?.trim() ?? '';
  if (!court) return null;
  return /quadra/i.test(court) ? court : `Quadra ${court}`;
}

/** Versão curta pra tabelas: "Q3". */
export function shortCourtLabelOf(courtName: string | null): string | null {
  const court = courtName?.trim() ?? '';
  if (!court) return null;
  const digits = court.match(/\d+/)?.[0];
  return digits ? `Q${digits}` : court.slice(0, 4).toUpperCase();
}

export function ordinalOf(position: number): string {
  return `${position}º`;
}

/** "começa em 42 min" / "começa em 2h10" / "começa agora" / "atrasada 8 min". */
export function countdownLabelOf(target: Date | null, now: Date): string | null {
  if (!target) return null;
  const diffMs = target.getTime() - now.getTime();
  const minutes = Math.round(Math.abs(diffMs) / 60_000);
  if (minutes < 1) return 'começa agora';
  if (diffMs < 0) return minutes < 60 ? `atrasada ${minutes} min` : `atrasada ${hoursMinutes(minutes)}`;
  return minutes < 60 ? `começa em ${minutes} min` : `começa em ${hoursMinutes(minutes)}`;
}

/** Tempo decorrido desde o início da partida: "0:52". */
export function elapsedLabelOf(startedAt: Date | null, now: Date): string | null {
  if (!startedAt) return null;
  const totalMinutes = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function hoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** "21-15 · 21-12" — os sets já fechados. */
export function partialsLabelOf(sets: readonly MatchSet[]): string | null {
  return sets.length > 0 ? sets.map((s) => `${s.a}-${s.b}`).join(' · ') : null;
}

export function closedPartialsLabelOf(m: TournamentMatch): string | null {
  return partialsLabelOf(matchClosedSets(m));
}

/** "2 – 0" em sets, do ponto de vista do lado A. */
export function setWinsLabelOf(m: TournamentMatch): string {
  const [a, b] = matchSetWins(m);
  return `${a} – ${b}`;
}

/** Linha de placar ao vivo: "1–0 · 2º set 14-11". Fora do ao vivo devolve `null`. */
export function liveScoreLineOf(m: TournamentMatch): string | null {
  if (!matchIsLive(m)) return null;
  const current = matchLiveCurrentSet(m);
  if (!current) return null;
  const [a, b] = matchSetWins(m);
  return `${a}–${b} · ${current.setNumber}º set ${current.a}-${current.b}`;
}

/** "MD3" / "MD5". */
export function bestOfLabelOf(m: TournamentMatch): string {
  return `MD${matchBestOf(m)}`;
}

/** "Antes da 1ª rodada" / "Após 1 de 3 rodadas" / "Todas as 3 rodadas disputadas".
 *  Existe porque "Após 0 de 1 rodadas" — a forma ingênua — soa errado nos dois extremos. */
export function roundsProgressLabel(played: number, total: number): string {
  if (total <= 0) return 'Classificação do grupo';
  if (played === 0) return 'Antes da 1ª rodada';
  if (played >= total) return total === 1 ? 'Rodada única disputada' : `Todas as ${total} rodadas disputadas`;
  return `Após ${played} de ${total} rodadas`;
}

/** Número do set em andamento, pro badge "AO VIVO · 3º SET". */
export function currentSetNumberOf(m: TournamentMatch): number | null {
  if (!matchIsLive(m)) return null;
  const sets = displaySetsOf(m);
  const inProgress = sets.find((s) => s.inProgress);
  if (inProgress) return inProgress.index;
  return matchLiveCurrentSet(m)?.setNumber ?? sets.length + 1;
}
