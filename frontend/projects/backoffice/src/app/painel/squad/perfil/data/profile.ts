/**
 * Tela 03 · Perfil do embaixador: o contrato inteiro de uma pessoa.
 *
 * Os números saem da mesma linha da tela 02 (`buildRows`, piloto inteiro), então conversões,
 * receita, custo, ROI e status batem com a lista. Os dados esportivos (Elo, torneios, ranking,
 * indicados) são o retrato que a candidatura gravou — o mesmo que a tela 04 mostra; seguidores e
 * engajamento são os que o time conferiu lá. Dinheiro em centavos.
 */
import {
  SCORE_COMPONENTS,
  SCORE_LABELS,
  TIER_LABELS,
  type ScoreComponent,
  type SquadRules,
  type SquadTier,
  type TierPackage,
} from '../../niveis-regras/data/squad-rules';
import {
  ORIGIN_LABEL,
  STATUS_META,
  brl,
  dateOf,
  dayMonth,
  dayMonthOfKey,
  statusLabel as commissionStatusLabel,
  whenLabel,
  type Commission,
} from '../../comissoes/data/commission';
import { END_REASON_LABELS, contractFromDoc, type Contract, type EndReason } from '../../data/squad-program.repository';
import { contractDays } from '../../data/squad-program';
import { roiLabel, type AmbassadorRow } from '../../embaixadores/data/ambassador';
import type { Application } from '../../candidaturas/data/application';
import { multiplier, plural } from '../../data/squad-metrics';

type Raw = Record<string, unknown>;

const TIERS: readonly SquadTier[] = ['ath', 'amb', 'pro', 'cap'];
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isTier = (v: unknown): v is SquadTier => TIERS.includes(v as SquadTier);

// ── contrato completo ───────────────────────────────────────────────────────

export interface Amendment {
  at: Date | null;
  fromTier: SquadTier;
  toTier: SquadTier;
  reason: string;
  by: string | null;
  commissionPct: number | null;
  acceptedAt: Date | null;
  canceledAt: Date | null;
}

export interface ProfileContract extends Contract {
  followerDiscountPct: number | null;
  slug: string;
  pauseReason: string | null;
  endReason: string | null;
  endNote: string | null;
  endedAt: Date | null;
  amendments: Amendment[];
}

export function profileContractFromDoc(uid: string, d: Raw): ProfileContract {
  const amendments = (Array.isArray(d['amendments']) ? (d['amendments'] as Raw[]) : [])
    .filter((a) => isTier(a['fromTier']) && isTier(a['toTier']))
    .map((a) => ({
      at: dateOf(a['at']),
      fromTier: a['fromTier'] as SquadTier,
      toTier: a['toTier'] as SquadTier,
      reason: str(a['reason']),
      by: str((a['by'] as Raw | null)?.['name']) || null,
      commissionPct: numOrNull(a['commissionPct']),
      acceptedAt: dateOf(a['acceptedAt']),
      canceledAt: dateOf(a['canceledAt']),
    }));
  return {
    ...contractFromDoc(uid, d),
    followerDiscountPct: numOrNull(d['followerDiscountPct']),
    slug: str(d['slug']),
    pauseReason: str(d['pauseReason']) || null,
    endReason: str(d['endReason']) || null,
    endNote: str(d['endNote']) || null,
    endedAt: dateOf(d['endedAt']),
    amendments,
  };
}

// ── dados esportivos (retrato da candidatura) ──────────────────────────────

export interface AthleteFacts {
  city: string | null;
  state: string | null;
  arenaName: string | null;
  elo: string | null;
  tournaments: number | null;
  rankingPosition: number | null;
  referredCount: number | null;
  followers: number | null;
  engagementPct: number | null;
}

export function factsFromApplication(app: Application | null): AthleteFacts | null {
  if (!app) return null;
  return {
    city: app.snapshot.city ?? (app.answers?.city || null),
    state: app.snapshot.state,
    arenaName: app.snapshot.arenaName,
    elo: app.snapshot.elo,
    tournaments: app.snapshot.tournaments,
    rankingPosition: app.snapshot.rankingPosition,
    referredCount: app.snapshot.referredCount,
    followers: app.social?.followers ?? null,
    engagementPct: app.social?.engagementPct ?? null,
  };
}

/** "Goiânia · joga na Arena Errejota · Competidor II · 12 torneios no NexaGO" — só o que existe. */
export function identityLine(contract: Contract, facts: AthleteFacts | null): string {
  const city = facts?.city ?? contract.city;
  const place = city && facts?.state ? `${city}/${facts.state}` : city;
  const arena = facts?.arenaName ?? contract.arenaName;
  const tournaments = facts?.tournaments ?? null;
  return [
    place,
    arena ? `joga na ${arena}` : null,
    facts?.elo ?? null,
    tournaments !== null ? `${plural(tournaments, 'torneio', 'torneios')} no NexaGO` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ── link e QR ───────────────────────────────────────────────────────────────

export const ATHLETE_PORTAL = 'https://atleta.nexago.com.br';

/** O link que a atribuição já entende (`?squad=CODIGO`; QR acrescenta `&via=qr`). */
export function shareLinks(code: string): { link: string; label: string; qr: string } {
  const link = `${ATHLETE_PORTAL}/?squad=${encodeURIComponent(code)}`;
  return { link, label: link.replace(/^https:\/\//, ''), qr: `${link}&via=qr` };
}

// ── Score ───────────────────────────────────────────────────────────────────

/** Posição no Score entre os contratos vivos que já têm Score; `null` sem Score. */
export function scoreRank(uid: string, contracts: Contract[]): { position: number; of: number } | null {
  const ranked = contracts
    .filter((c) => c.state !== 'ended' && c.score !== null)
    .sort((a, b) => b.score! - a.score! || a.name.localeCompare(b.name, 'pt-BR'));
  const i = ranked.findIndex((c) => c.uid === uid);
  return i < 0 ? null : { position: i + 1, of: ranked.length };
}

export interface ScorePart {
  key: ScoreComponent;
  label: string;
  max: number;
}

/** Os componentes com o peso das regras (tela 06). Os valores por componente ainda não existem. */
export function scoreParts(rules: SquadRules): ScorePart[] {
  return SCORE_COMPONENTS.map((key) => ({ key, label: SCORE_LABELS[key].label, max: rules.scoreWeights[key] }));
}

// ── promoção / permanência ─────────────────────────────────────────────────

export interface Criterion {
  label: string;
  value: string;
  /** `null` = critério manual (o time avalia). */
  ok: boolean | null;
}

export interface PromotionView {
  kind: 'promotion';
  from: SquadTier;
  to: SquadTier;
  conversions: number;
  min: number;
  pct: number;
  criteria: Criterion[];
}

export interface StayView {
  kind: 'stay';
  tier: SquadTier;
  criteria: Criterion[];
  watch: string[];
}

export function promotionView(row: AmbassadorRow, rules: SquadRules): PromotionView | StayView {
  const tier = row.contract.tier;
  const rule = rules.promotion.find((p) => p.from === tier) ?? null;
  const roi = row.roi;
  if (!rule) {
    const limit = rules.termination.maxRoi;
    return {
      kind: 'stay',
      tier,
      criteria: [
        {
          label: `ROI acima de ${multiplier(limit)}`,
          value: roiLabel(roi),
          ok: roi === null ? null : roi >= limit,
        },
      ],
      watch: rules.termination.checklist,
    };
  }
  const conversions = row.conversions;
  const missing = rule.minConversions - conversions;
  const criteria: Criterion[] = [];
  if (rule.minRoi !== null) {
    criteria.push({
      label: `ROI mínimo ${multiplier(rule.minRoi)}`,
      value: roiLabel(roi),
      ok: roi !== null && roi >= rule.minRoi,
    });
  }
  for (const item of rule.checklist) criteria.push({ label: item, value: 'avaliação do time', ok: null });
  criteria.push({
    label: `≥ ${rule.minConversions} conversões`,
    value: missing > 0 ? `faltam ${missing}` : 'atingido',
    ok: missing <= 0,
  });
  return {
    kind: 'promotion',
    from: tier,
    to: rule.to,
    conversions,
    min: rule.minConversions,
    pct: rule.minConversions > 0 ? Math.min(100, (conversions / rule.minConversions) * 100) : 100,
    criteria,
  };
}

/** Meta de ROI que aparece embaixo do KPI: a da próxima promoção, senão o limite de encerramento. */
export function roiGoalHint(tier: SquadTier, rules: SquadRules): string {
  const rule = rules.promotion.find((p) => p.from === tier && p.minRoi !== null);
  if (rule) return `meta mínima ${multiplier(rule.minRoi!)}`;
  return `limite de encerramento ${multiplier(rules.termination.maxRoi)}`;
}

// ── custo ───────────────────────────────────────────────────────────────────

export interface CostPart {
  label: string;
  cents: number | null;
}

/** Comissões + kit (o que já tem fonte); inscrições gratuitas e cachês ainda sem fonte ("—"). */
export function costParts(row: AmbassadorRow, rules: SquadRules): CostPart[] {
  const pkg = rules.tiers[row.contract.tier];
  const pct = row.contract.commissionPct;
  return [
    { label: pct !== null ? `Comissão ${pct}%` : 'Comissão', cents: row.costCents - pkg.kitCostCents },
    { label: pkg.kit || 'Kit', cents: pkg.kitCostCents },
    { label: 'Inscrições gratuitas', cents: null },
    { label: 'Cachês e bônus', cents: null },
  ];
}

// ── benefícios do pacote ────────────────────────────────────────────────────

export interface Benefit {
  label: string;
  sub: string;
}

/** O pacote congelado no contrato (versão das regras do aceite). A entrega ainda não é registrada. */
export function benefitsOf(pkg: TierPackage, contract: ProfileContract): Benefit[] {
  const out: Benefit[] = [];
  if (pkg.kit) out.push({ label: pkg.kit, sub: `custo de ${brl(pkg.kitCostCents, false)} · entrega ainda não registrada` });
  const r = pkg.registrations;
  if (r.type === 'discount') {
    out.push({ label: `${r.value}% de desconto nas inscrições`, sub: 'nas inscrições do próprio embaixador' });
  } else if (r.type === 'freePerMonth') {
    out.push({ label: `${plural(r.value, 'inscrição grátis', 'inscrições grátis')} por mês`, sub: 'uso ainda não registrado' });
  } else {
    out.push({ label: 'Inscrições ilimitadas', sub: `teto de ${r.value} por mês · uso ainda não registrado` });
  }
  if (pkg.events) out.push({ label: `Eventos · ${pkg.events}`, sub: 'acesso antecipado às ações NexaGO' });
  if (pkg.partnerHalfOff) out.push({ label: '50% para a dupla', sub: 'na inscrição do parceiro' });
  const discount = contract.followerDiscountPct ?? pkg.followerDiscountPct;
  out.push({ label: `${discount}% de desconto para o seguidor`, sub: 'sai da taxa da plataforma, com teto nela' });
  if (pkg.campaignFeeCapCents) {
    out.push({ label: 'Cachê de campanha', sub: `até ${brl(pkg.campaignFeeCapCents, false)} por campanha` });
  }
  if (pkg.tournamentOriginBonusCents) {
    out.push({ label: 'Bônus por torneio originado', sub: `${brl(pkg.tournamentOriginBonusCents, false)} por torneio` });
  }
  return out;
}

// ── contrato ────────────────────────────────────────────────────────────────

export interface ContractLine {
  label: string;
  value: string;
}

const SP = 'America/Sao_Paulo';

function year(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: SP, year: 'numeric' });
}

function endReasonLabel(reason: string | null): string | null {
  return reason ? END_REASON_LABELS[reason as EndReason] ?? reason : null;
}

export function contractLines(c: ProfileContract, now: Date): ContractLine[] {
  const lines: ContractLine[] = [];
  if (c.start) {
    const end = c.end ? `${dayMonth(c.end)} ${year(c.end)}` : 'sem fim definido';
    lines.push({ label: 'Período', value: `${dayMonth(c.start)} → ${end}` });
    lines.push({ label: 'Dias de contrato', value: plural(contractDays(c.start, c.endedAt ?? now), 'dia', 'dias') });
  }
  lines.push({ label: 'Comissão', value: c.commissionPct !== null ? `${c.commissionPct}% da receita líquida` : '—' });
  if (c.followerDiscountPct !== null) lines.push({ label: 'Desconto do seguidor', value: `${c.followerDiscountPct}%` });
  if (c.rulesVersion !== null) lines.push({ label: 'Regras', value: `v${c.rulesVersion}.0 · congeladas no aceite` });
  if (c.state === 'paused') {
    const until = c.pausedUntil ? `até ${dayMonthOfKey(c.pausedUntil)}` : 'sem data de volta';
    lines.push({ label: 'Pausa', value: [until, c.pauseReason].filter(Boolean).join(' · ') });
  }
  if (c.state === 'ended') {
    const when = c.endedAt ? `em ${dayMonth(c.endedAt)}` : '';
    lines.push({ label: 'Encerrado', value: [when, endReasonLabel(c.endReason)].filter(Boolean).join(' · ') || '—' });
  } else if (c.endsAt) {
    lines.push({
      label: 'Encerramento agendado',
      value: [`em ${dayMonthOfKey(c.endsAt)}`, endReasonLabel(c.endReason)].filter(Boolean).join(' · '),
    });
  }
  return lines;
}

export interface AmendmentLine {
  label: string;
  status: string;
  tone: 'orange' | 'green' | 'dim';
}

/** Aditivos de nível, do mais novo para o mais antigo. */
export function amendmentLines(c: ProfileContract): AmendmentLine[] {
  return [...c.amendments]
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .map((a) => {
      const label = `${TIER_LABELS[a.fromTier]} → ${TIER_LABELS[a.toTier]}`;
      if (a.acceptedAt) return { label, status: `aceito ${dayMonth(a.acceptedAt)}`, tone: 'green' as const };
      if (a.canceledAt) return { label, status: 'substituído', tone: 'dim' as const };
      return { label, status: `aguardando aceite${a.at ? ` · enviado ${dayMonth(a.at)}` : ''}`, tone: 'orange' as const };
    });
}

// ── conversões ──────────────────────────────────────────────────────────────

export interface ConversionLine {
  id: string;
  when: string;
  athlete: string;
  registration: string;
  origin: string;
  grossCents: number;
  amountCents: number;
  status: string;
  tone: string;
  canceled: boolean;
}

export function conversionLines(list: Commission[], now: Date): ConversionLine[] {
  return [...list]
    .sort((a, b) => (b.registeredAt?.getTime() ?? 0) - (a.registeredAt?.getTime() ?? 0))
    .map((c) => ({
      id: c.id,
      when: whenLabel(c.registeredAt, now),
      athlete: c.convertedLabel,
      registration: [c.tournamentName, c.categoryName].filter(Boolean).join(' · ') || '—',
      origin: ORIGIN_LABEL[c.origin],
      grossCents: c.grossCents,
      amountCents: c.amountCents,
      status: commissionStatusLabel(c),
      tone: STATUS_META[c.status].tone,
      canceled: c.status === 'canceled',
    }));
}
