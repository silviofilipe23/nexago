import type { TournamentMatch } from './matches-repository';

// Dia/hora do agendamento na parede America/Sao_Paulo — mesmo fuso canônico que o
// agendamento usa pra gravar (`spWallToDate` em agendamento.component.ts).
const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DAY_WD = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
const DAY_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });

/** "16:30" na parede SP. */
export function spTimeLabel(d: Date): string {
  return TIME.format(d);
}

/** "Sáb 29/03" na parede SP. */
export function spDayLabel(d: Date): string {
  const wd = DAY_WD.format(d).replace('.', '');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${DAY_DATE.format(d)}`;
}

/** Normaliza o nome da quadra (`1` → `Quadra 1`) — paridade com
 *  `formatCourtLabelForCard` no app. */
export function formatCourtLabel(courtName: string | null | undefined): string {
  const court = (courtName ?? '').trim();
  if (!court) return '';
  if (/quadra/i.test(court)) return court;
  return `Quadra ${court}`;
}

/** Topo do card da chave: `#2 · Quadra 1` — paridade com `matchMetaLabelForCard`. */
export function matchMetaLabel(m: TournamentMatch): string {
  const parts: string[] = [];
  if (m.matchNumber > 0) parts.push(`#${m.matchNumber}`);
  const court = formatCourtLabel(m.court);
  if (court) parts.push(court);
  return parts.length > 0 ? parts.join(' · ') : '#—';
}

/** Só dia + hora (`Sáb 29/03 · 16:30`), sem quadra — a quadra vai no topo e no chip. */
export function matchWhenLabel(m: TournamentMatch): string {
  if (!m.scheduledAt) return 'Sem horário';
  return `${spDayLabel(m.scheduledAt)} · ${spTimeLabel(m.scheduledAt)}`;
}

/** Rodapé dos cards da chave: "Sáb 29/03 · 16:30 · Quadra 1" quando agendada; senão o que
 *  existir ("Quadra 1 · sem horário" / "Sem horário"). Paridade com o app
 *  (`matchScheduleFooterLabelPt` em tournament_match_display.dart). */
export function matchScheduleLabel(m: TournamentMatch): string {
  const court = formatCourtLabel(m.court);
  if (!m.scheduledAt) return court ? `${court} · sem horário` : 'Sem horário';
  const parts = [spDayLabel(m.scheduledAt), spTimeLabel(m.scheduledAt)];
  if (court) parts.push(court);
  return parts.join(' · ');
}
