/**
 * Regras do programa NexaSquad (tela 06 · Níveis & regras).
 *
 * Espelho à mão de `functions/src/squad-rules.ts`: padrão, limites e validação valem
 * dos dois lados (o servidor recusa o que a tela deixaria passar). Mudou lá, muda aqui.
 * Valores em dinheiro ficam em centavos, como no resto da Loja.
 */

export const SQUAD_TIERS = ['ath', 'amb', 'pro', 'cap'] as const;
export type SquadTier = (typeof SQUAD_TIERS)[number];

export const TIER_LABELS: Record<SquadTier, string> = {
  ath: 'Athlete',
  amb: 'Ambassador',
  pro: 'Pro Ambassador',
  cap: 'Captain',
};

export type RegistrationType = 'discount' | 'freePerMonth' | 'freeUnlimited';
export type AttributionModel = 'lastTouch' | 'firstTouch';

export const SCORE_COMPONENTS = [
  'conversions',
  'revenue',
  'engagement',
  'reach',
  'events',
  'content',
  'sportsRelevance',
  'communityGrowth',
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export const SCORE_LABELS: Record<ScoreComponent, { label: string; source: string }> = {
  conversions: { label: 'Conversões', source: 'Inscrições pagas atribuídas' },
  revenue: { label: 'Receita gerada', source: 'Soma da receita líquida atribuída' },
  engagement: { label: 'Engajamento', source: 'Manual ou integração social (taxa de engajamento)' },
  reach: { label: 'Alcance', source: 'Manual ou integração social (seguidores, alcance médio)' },
  events: { label: 'Participação em eventos', source: 'Check-in em torneios e ações NexaGO' },
  content: { label: 'Conteúdo', source: 'Conteúdos aprovados pelo time' },
  sportsRelevance: { label: 'Relevância esportiva', source: 'Elo + ranking' },
  communityGrowth: { label: 'Crescimento da comunidade', source: 'Novos atletas ativos vindos do embaixador (≥ 2 jogos)' },
};

export const ATHLETE_LEVEL_NAMES = ['Bronze', 'Silver', 'Gold', 'Elite'] as const;

export const LIMITS = {
  commissionPct: 30,
  followerDiscountPct: 30,
  marginPct: 60,
  freePerMonth: 10,
  freeUnlimitedCap: 31,
  kitCostCents: 10_000_00,
  campaignFeeCapCents: 100_000_00,
  tournamentBonusCents: 10_000_00,
  windowDays: 90,
  conversions: 1000,
  roi: 100,
  checklistItems: 8,
  checklistItem: 80,
  kitText: 80,
  eventsText: 120,
  levelPoints: 1_000_000,
  actionPoints: 1000,
} as const;

export interface KitSku {
  productId: string;
  skuId: string;
}

export interface TierPackage {
  /** Número exato ou faixa `[min, max]` (só Pro: o contrato individual fixa o valor). */
  commissionPct: number | [number, number];
  followerDiscountPct: number;
  registrations: { type: RegistrationType; value: number };
  kit: string;
  kitSku: KitSku | null;
  kitCostCents: number;
  events: string;
  partnerHalfOff: boolean;
  campaignFeeCapCents?: number;
  tournamentOriginBonusCents?: number;
}

export interface PromotionRule {
  from: SquadTier;
  to: SquadTier;
  minConversions: number;
  minRoi: number | null;
  checklist: string[];
}

export interface TerminationRule {
  maxRoi: number;
  checklist: string[];
}

/** Onde o desconto do seguidor vale: inscrição em torneio, reserva de quadra e clubinho. */
export type FollowerDiscountKind = 'registration' | 'booking' | 'club';
export type FollowerDiscountScope = Record<FollowerDiscountKind, boolean>;

export interface AttributionRules {
  requirePaidConfirmation: true;
  cancelOnRefund: true;
  followerDiscountFirstOnly: boolean;
  followerDiscountScope: FollowerDiscountScope;
  blockSelfReferral: boolean;
  windowDays: number;
  model: AttributionModel;
}

export interface AthletePoints {
  levels: Array<{ name: string; min: number }>;
  perConversion: number;
  perEvent: number;
  perContent: number;
}

export interface SquadRules {
  marginMaxPct: number;
  tiers: Record<SquadTier, TierPackage>;
  attribution: AttributionRules;
  promotion: PromotionRule[];
  termination: TerminationRule;
  scoreWeights: Record<ScoreComponent, number>;
  points: AthletePoints;
}

/** Padrão v1.0 — o piloto. Vale enquanto ninguém salvou (`squadConfig/rules` ausente). */
export const DEFAULT_SQUAD_RULES: SquadRules = {
  marginMaxPct: 25,
  tiers: {
    ath: {
      commissionPct: 5,
      followerDiscountPct: 10,
      registrations: { type: 'discount', value: 20 },
      kit: 'Camiseta, boné, garrafa, adesivos',
      kitSku: null,
      kitCostCents: 60_00,
      events: '',
      partnerHalfOff: false,
    },
    amb: {
      commissionPct: 10,
      followerDiscountPct: 10,
      registrations: { type: 'freePerMonth', value: 1 },
      kit: 'Kit completo',
      kitSku: null,
      kitCostCents: 120_00,
      events: 'Prioridade',
      partnerHalfOff: false,
    },
    pro: {
      commissionPct: [10, 15],
      followerDiscountPct: 15,
      registrations: { type: 'freeUnlimited', value: 4 },
      kit: 'Kit premium + uniforme',
      kitSku: null,
      kitCostCents: 280_00,
      events: 'Prioridade + exclusivos',
      partnerHalfOff: true,
      campaignFeeCapCents: 1000_00,
    },
    cap: {
      commissionPct: 10,
      followerDiscountPct: 10,
      registrations: { type: 'freePerMonth', value: 1 },
      kit: 'Kit completo',
      kitSku: null,
      kitCostCents: 120_00,
      events: 'Prioridade',
      partnerHalfOff: false,
      tournamentOriginBonusCents: 50_00,
    },
  },
  attribution: {
    requirePaidConfirmation: true,
    cancelOnRefund: true,
    followerDiscountFirstOnly: true,
    followerDiscountScope: { registration: true, booking: true, club: true },
    blockSelfReferral: true,
    windowDays: 30,
    model: 'lastTouch',
  },
  promotion: [
    { from: 'ath', to: 'amb', minConversions: 10, minRoi: null, checklist: ['Bom comportamento', 'Participação', 'Conteúdo adequado'] },
    { from: 'amb', to: 'pro', minConversions: 30, minRoi: 3, checklist: ['Influência relevante', 'Participação consistente'] },
  ],
  termination: { maxRoi: 1.5, checklist: ['Baixa participação', 'Conduta incompatível', 'Uso inadequado da marca'] },
  scoreWeights: {
    conversions: 30,
    revenue: 20,
    engagement: 15,
    reach: 10,
    events: 10,
    content: 5,
    sportsRelevance: 5,
    communityGrowth: 5,
  },
  points: {
    levels: [
      { name: 'Bronze', min: 0 },
      { name: 'Silver', min: 500 },
      { name: 'Gold', min: 1000 },
      { name: 'Elite', min: 2000 },
    ],
    perConversion: 40,
    perEvent: 20,
    perContent: 10,
  },
};

export function cloneRules(r: SquadRules): SquadRules {
  return structuredClone(r);
}

/** "v3.0": o número inteiro da versão no formato do desenho. */
export function versionLabel(version: number): string {
  return `v${version}.0`;
}

// ── números em pt-BR ─────────────────────────────────────────────────────────

function parseOne(text: string): number {
  const s = text.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\d+([.,]\d+)?$/.test(s)) {
    return Number(s.replace(',', '.'));
  }
  return NaN;
}

/** "10", "10,5", "1.000" → número; com `allowRange`, "10–15" → [10, 15]. Inválido = NaN. */
export function parseNumberText(text: string, allowRange = false): number | [number, number] {
  if (allowRange) {
    const parts = text.split(/[–—-]/);
    if (parts.length === 2) {
      return [parseOne(parts[0]!), parseOne(parts[1]!)];
    }
  }
  return parseOne(text);
}

export function formatNumber(value: number | [number, number], grouping = false): string {
  const one = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: grouping }) : '';
  return Array.isArray(value) ? `${one(value[0])}–${one(value[1])}` : one(value);
}

/** Igualdade de valor numérico, com NaN igual a NaN (campo inválido continua inválido). */
export function sameNumber(a: number | [number, number], b: number | [number, number]): boolean {
  const eq = (x: number, y: number) => x === y || (Number.isNaN(x) && Number.isNaN(y));
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && eq(a[0], b[0]) && eq(a[1], b[1]);
  }
  return eq(a, b);
}

export function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Reais digitados → centavos; NaN segue NaN para a validação acusar. */
export function toCents(reais: number): number {
  return Number.isFinite(reais) ? Math.round(reais * 100) : NaN;
}

// ── validação (mesma regra do servidor, com a mensagem da tela) ─────────────

/** Caminho do campo (`tiers.pro.commissionPct`) → mensagem. Vazio = válido. */
export type RulesIssues = Partial<Record<string, string>>;

const isNum = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: number, min: number, max: number) => isNum(v, min, max) && Number.isInteger(v);
const textOk = (v: string, max: number) => v.trim().length <= max;
const checklistOk = (list: string[]) =>
  list.length <= LIMITS.checklistItems && list.every((s) => s.trim().length > 0 && s.trim().length <= LIMITS.checklistItem);

/** Piso da comissão: o valor exato, ou o início da faixa do Pro. */
export function commissionFloor(c: number | [number, number]): number {
  return Array.isArray(c) ? c[0] : c;
}

function registrationsIssue(r: TierPackage['registrations']): string | null {
  switch (r.type) {
    case 'discount':
      return isInt(r.value, 1, 100) ? null : 'Desconto de 1 a 100%';
    case 'freePerMonth':
      return isInt(r.value, 1, LIMITS.freePerMonth) ? null : `De 1 a ${LIMITS.freePerMonth} por mês`;
    case 'freeUnlimited':
      return isInt(r.value, 1, LIMITS.freeUnlimitedCap) ? null : `Teto de 1 a ${LIMITS.freeUnlimitedCap} por mês`;
  }
}

function commissionIssue(tier: SquadTier, c: number | [number, number]): string | null {
  const range = `Use um número ou uma faixa (10–15) de 0 a ${LIMITS.commissionPct}%`;
  if (Array.isArray(c)) {
    if (tier !== 'pro') {
      return 'Faixa só no Pro: informe um número';
    }
    return isNum(c[0], 0, LIMITS.commissionPct) && isNum(c[1], 0, LIMITS.commissionPct) && c[0] < c[1] ? null : range;
  }
  return isNum(c, 0, LIMITS.commissionPct) ? null : tier === 'pro' ? range : `De 0 a ${LIMITS.commissionPct}%`;
}

function tierIssues(tier: SquadTier, t: TierPackage, out: RulesIssues): void {
  const at = (field: string) => `tiers.${tier}.${field}`;
  const money = (max: number) => `De R$ 0 a ${brl(max)}`;
  const c = commissionIssue(tier, t.commissionPct);
  if (c) out[at('commissionPct')] = c;
  if (!isNum(t.followerDiscountPct, 0, LIMITS.followerDiscountPct)) {
    out[at('followerDiscountPct')] = `De 0 a ${LIMITS.followerDiscountPct}%`;
  }
  const r = registrationsIssue(t.registrations);
  if (r) out[at('registrations')] = r;
  if (!textOk(t.kit, LIMITS.kitText)) out[at('kit')] = `Até ${LIMITS.kitText} caracteres`;
  if (!isInt(t.kitCostCents, 0, LIMITS.kitCostCents)) out[at('kitCostCents')] = money(LIMITS.kitCostCents);
  if (!textOk(t.events, LIMITS.eventsText)) out[at('events')] = `Até ${LIMITS.eventsText} caracteres`;
  if (tier === 'pro' && !isInt(t.campaignFeeCapCents ?? NaN, 0, LIMITS.campaignFeeCapCents)) {
    out[at('campaignFeeCapCents')] = money(LIMITS.campaignFeeCapCents);
  }
  if (tier === 'cap' && !isInt(t.tournamentOriginBonusCents ?? NaN, 0, LIMITS.tournamentBonusCents)) {
    out[at('tournamentOriginBonusCents')] = money(LIMITS.tournamentBonusCents);
  }
}

export function validateRules(r: SquadRules): RulesIssues {
  const out: RulesIssues = {};
  const marginOk = isNum(r.marginMaxPct, 1, LIMITS.marginPct);
  if (!marginOk) out['marginMaxPct'] = `De 1 a ${LIMITS.marginPct}%`;

  for (const tier of SQUAD_TIERS) {
    tierIssues(tier, r.tiers[tier], out);
    const sum = commissionFloor(r.tiers[tier].commissionPct) + r.tiers[tier].followerDiscountPct;
    if (marginOk && Number.isFinite(sum) && sum > r.marginMaxPct) {
      out[`tiers.${tier}.margin`] = `Comissão + desconto passam a margem de ${formatNumber(r.marginMaxPct)}% por inscrição`;
    }
  }

  // Escada: Athlete ≤ Ambassador ≤ Pro. Captain é paralelo.
  const ladder: SquadTier[] = ['ath', 'amb', 'pro'];
  for (let i = 1; i < ladder.length; i++) {
    const below = commissionFloor(r.tiers[ladder[i - 1]!].commissionPct);
    const here = commissionFloor(r.tiers[ladder[i]!].commissionPct);
    if (Number.isFinite(below) && Number.isFinite(here) && here < below) {
      out[`tiers.${ladder[i]}.ladder`] = `Menor que a comissão do ${TIER_LABELS[ladder[i - 1]!]} (${formatNumber(below)}%)`;
    }
  }

  if (!isInt(r.attribution.windowDays, 1, LIMITS.windowDays)) {
    out['attribution.windowDays'] = `De 1 a ${LIMITS.windowDays} dias`;
  }

  r.promotion.forEach((p, i) => {
    if (!isInt(p.minConversions, 1, LIMITS.conversions)) {
      out[`promotion.${i}.minConversions`] = `De 1 a ${LIMITS.conversions} conversões`;
    }
    if (p.minRoi !== null && !(isNum(p.minRoi, 0, LIMITS.roi) && p.minRoi > 0)) {
      out[`promotion.${i}.minRoi`] = `ROI acima de 0 e até ${LIMITS.roi}x`;
    }
    if (!checklistOk(p.checklist)) {
      out[`promotion.${i}.checklist`] = `Até ${LIMITS.checklistItems} critérios, sem item vazio`;
    }
  });
  if (!(isNum(r.termination.maxRoi, 0, LIMITS.roi) && r.termination.maxRoi > 0)) {
    out['termination.maxRoi'] = `ROI acima de 0 e até ${LIMITS.roi}x`;
  }
  if (!checklistOk(r.termination.checklist)) {
    out['termination.checklist'] = `Até ${LIMITS.checklistItems} critérios, sem item vazio`;
  }

  let total = 0;
  for (const c of SCORE_COMPONENTS) {
    const w = r.scoreWeights[c];
    if (!isInt(w, 0, 100)) out[`scoreWeights.${c}`] = 'De 0 a 100';
    else total += w;
  }
  if (total !== 100) out['scoreWeights.total'] = `Total ${total} — ajuste para 100`;

  r.points.levels.forEach((l, i) => {
    const prev = r.points.levels[i - 1];
    if (!isInt(l.min, 0, LIMITS.levelPoints)) {
      out[`points.levels.${i}`] = 'Número inteiro de pontos';
    } else if (i === 0 && l.min !== 0) {
      out['points.levels.0'] = 'O primeiro nível começa em 0';
    } else if (prev && Number.isFinite(prev.min) && l.min <= prev.min) {
      out[`points.levels.${i}`] = `Acima de ${formatNumber(prev.min, true)} pts`;
    }
  });
  for (const k of ['perConversion', 'perEvent', 'perContent'] as const) {
    if (!isInt(r.points[k], 0, LIMITS.actionPoints)) out[`points.${k}`] = `De 0 a ${LIMITS.actionPoints}`;
  }
  return out;
}

/** Soma dos pesos, ignorando campo inválido (o total vermelho já acusa). */
export function scoreTotal(weights: Record<ScoreComponent, number>): number {
  return SCORE_COMPONENTS.reduce((n, c) => n + (Number.isFinite(weights[c]) ? weights[c] : 0), 0);
}

// ── diff ─────────────────────────────────────────────────────────────────────

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function sameRules(a: SquadRules, b: SquadRules): boolean {
  return same(a, b);
}

/** Só o pacote por nível entra no contrato; atribuição, Score e pontos valem para todos já. */
export function affectsContracts(prev: SquadRules, next: SquadRules): boolean {
  return SQUAD_TIERS.some((t) => !same(prev.tiers[t], next.tiers[t]));
}

/** Doc do Firestore → regras; campo ausente cai no padrão (docs antigos ou incompletos). */
export function rulesFromDoc(data: Record<string, unknown> | undefined): SquadRules {
  const raw = (data?.['rules'] ?? null) as Partial<SquadRules> | null;
  if (!raw || typeof raw !== 'object') {
    return cloneRules(DEFAULT_SQUAD_RULES);
  }
  const d = DEFAULT_SQUAD_RULES;
  const tiers = Object.fromEntries(
    SQUAD_TIERS.map((t) => [t, { ...d.tiers[t], ...(raw.tiers?.[t] ?? {}) }]),
  ) as Record<SquadTier, TierPackage>;
  return cloneRules({
    marginMaxPct: raw.marginMaxPct ?? d.marginMaxPct,
    tiers,
    attribution: {
      ...d.attribution,
      ...(raw.attribution ?? {}),
      // Regras salvas antes do escopo existir: o desconto valia em tudo.
      followerDiscountScope: { ...d.attribution.followerDiscountScope, ...(raw.attribution?.followerDiscountScope ?? {}) },
    },
    promotion: raw.promotion?.length === d.promotion.length ? raw.promotion : d.promotion,
    termination: { ...d.termination, ...(raw.termination ?? {}) },
    scoreWeights: { ...d.scoreWeights, ...(raw.scoreWeights ?? {}) },
    points: { ...d.points, ...(raw.points ?? {}) },
  });
}
