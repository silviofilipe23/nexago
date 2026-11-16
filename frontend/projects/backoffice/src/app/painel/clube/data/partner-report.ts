/**
 * Relatório do patrocinador (`/painel/clube/parceiros/:id/relatorio`, spec v2 item 10): o que um
 * parceiro recebeu do clube num período. Mesma fonte e mesma regra da aba Métricas
 * (`benefitEvents`, debounce de 30 s no servidor); resgate só o confirmado pelo parceiro e ligado a
 * um atleta (`matched`). Função pura; a tela lê eventos e resgates e chama `partnerReport`.
 */
import type { BenefitEvent } from './benefit-metrics';
import type { BenefitRedemption } from './benefit-redemption';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Uma série semanal muito longa vira uma tabela ilegível no PDF. */
export const REPORT_MAX_DAYS = 366;

export interface ReportWeek {
  /** Segunda-feira (local) que abre a semana. */
  start: Date;
  views: number;
  reach: number;
  clicks: number;
  codeCopies: number;
  leads: number;
  redemptions: number;
}

export interface ReportSource {
  source: string;
  views: number;
  clicks: number;
  athletes: number;
}

export interface PartnerReport {
  /** Atletas únicos que viram o parceiro. */
  reach: number;
  views: number;
  clicks: number;
  clickers: number;
  codeCopies: number;
  /** Um por atleta (reenvio não conta de novo). */
  leads: number;
  confirmedRedemptions: number;
  confirmedDiscountCents: number;
  weeks: ReportWeek[];
  sources: ReportSource[];
}

/** Segunda-feira 00:00 local da semana de `date`. */
export function weekStart(date: Date): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
}

function inRange(at: Date | null, from: Date, to: Date): at is Date {
  return !!at && at.getTime() >= from.getTime() && at.getTime() <= to.getTime();
}

interface WeekTally {
  views: number;
  reach: Set<string>;
  clicks: number;
  codeCopies: number;
  leads: Set<string>;
  redemptions: number;
}

function emptyTally(): WeekTally {
  return { views: 0, reach: new Set(), clicks: 0, codeCopies: 0, leads: new Set(), redemptions: 0 };
}

/** As semanas que cobrem o período, da primeira à última (vazias incluídas: o gráfico não pula). */
function weeksOf(from: Date, to: Date): Map<number, WeekTally> {
  const weeks = new Map<number, WeekTally>();
  for (let w = weekStart(from); w.getTime() <= to.getTime(); w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
    weeks.set(w.getTime(), emptyTally());
  }
  return weeks;
}

export function partnerReport(
  events: readonly BenefitEvent[],
  redemptions: readonly BenefitRedemption[],
  partnerId: string,
  from: Date,
  to: Date,
): PartnerReport {
  const weeks = weeksOf(from, to);
  const viewers = new Set<string>();
  const clickers = new Set<string>();
  const leads = new Set<string>();
  const sources = new Map<string, { views: number; clicks: number; uids: Set<string> }>();
  let views = 0;
  let clicks = 0;
  let codeCopies = 0;

  for (const e of events) {
    if (e.partnerId !== partnerId || !inRange(e.createdAt, from, to)) continue;
    const week = weeks.get(weekStart(e.createdAt).getTime());
    const src = sources.get(e.source) ?? { views: 0, clicks: 0, uids: new Set<string>() };
    if (e.type === 'partner_view') {
      views++;
      viewers.add(e.uid);
      src.views++;
      src.uids.add(e.uid);
      if (week) {
        week.views++;
        week.reach.add(e.uid);
      }
    } else if (e.type === 'cta_click') {
      clicks++;
      clickers.add(e.uid);
      src.clicks++;
      src.uids.add(e.uid);
      if (week) week.clicks++;
    } else if (e.type === 'code_copy') {
      codeCopies++;
      if (week) week.codeCopies++;
    } else if (e.type === 'lead_submit') {
      leads.add(e.uid);
      week?.leads.add(e.uid);
    }
    if (src.views + src.clicks > 0) sources.set(e.source, src);
  }

  let confirmedRedemptions = 0;
  let confirmedDiscountCents = 0;
  for (const r of redemptions) {
    if (r.partnerId !== partnerId || r.status !== 'matched' || !inRange(r.redeemedAt, from, to)) continue;
    confirmedRedemptions++;
    confirmedDiscountCents += r.discountCents;
    const week = weeks.get(weekStart(r.redeemedAt).getTime());
    if (week) week.redemptions++;
  }

  return {
    reach: viewers.size,
    views,
    clicks,
    clickers: clickers.size,
    codeCopies,
    leads: leads.size,
    confirmedRedemptions,
    confirmedDiscountCents,
    weeks: [...weeks.entries()].map(([start, w]) => ({
      start: new Date(start),
      views: w.views,
      reach: w.reach.size,
      clicks: w.clicks,
      codeCopies: w.codeCopies,
      leads: w.leads.size,
      redemptions: w.redemptions,
    })),
    sources: [...sources.entries()]
      .map(([source, s]) => ({ source, views: s.views, clicks: s.clicks, athletes: s.uids.size }))
      .sort((a, b) => b.views + b.clicks - (a.views + a.clicks) || a.source.localeCompare(b.source)),
  };
}

/** Período do relatório a partir dos inputs date ("AAAA-MM-DD"): início 00:00, fim 23:59:59,999. */
export function reportRange(fromRaw: string, toRaw: string): { from: Date; to: Date } | { error: string } {
  const parse = (raw: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] as const : null;
  };
  const a = parse(fromRaw);
  const b = parse(toRaw);
  if (!a || !b) return { error: 'Escolha o início e o fim do período.' };
  const from = new Date(a[0], a[1], a[2]);
  const to = new Date(b[0], b[1], b[2], 23, 59, 59, 999);
  if (to.getTime() < from.getTime()) return { error: 'O fim precisa ser depois do início.' };
  if ((to.getTime() - from.getTime()) / DAY_MS > REPORT_MAX_DAYS) return { error: 'Período de no máximo 1 ano.' };
  return { from, to };
}

/** "16/11" para o eixo da série. */
export function shortDay(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
