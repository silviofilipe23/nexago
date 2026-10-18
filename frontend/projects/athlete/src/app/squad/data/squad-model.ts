/**
 * NexaSquad no portal do atleta: o que as telas mostram, a partir de `getMySquadView`.
 *
 * Módulo puro (sem Angular, sem Firebase): rótulos, dinheiro, datas de São Paulo, barras de
 * nível, benefícios do pacote, semanas de comissão e o extrato. As regras de negócio (o que é
 * conversão, o que está disponível, a posição no ranking) já vêm prontas do servidor.
 */
import type {
  AmbassadorView,
  CancelReason,
  CommissionOrigin,
  CommissionStatus,
  PublicPackage,
  SquadCommissionLine,
  SquadCycle,
  SquadPoints,
  SquadPromotion,
  SquadTier,
} from './squad-view';

const SP = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const TIER_LABELS: Record<SquadTier, string> = {
  ath: 'Athlete',
  amb: 'Ambassador',
  pro: 'Pro Ambassador',
  cap: 'Captain',
};

/** O que cada perfil é e o que ganha (card "Quatro perfis" da tela 04). */
export const TIER_PROFILES: ReadonlyArray<{ tier: SquadTier; who: string; gets: string }> = [
  { tier: 'ath', who: 'Atleta relevante na comunidade', gets: 'Benefício + status' },
  { tier: 'amb', who: 'Influência e capacidade de ativação', gets: 'Comissão + conteúdo' },
  { tier: 'pro', who: 'Atleta estratégico para a marca', gets: 'Patrocínio seletivo' },
  { tier: 'cap', who: 'Lidera uma turma, arena ou região', gets: 'Comunidade + aquisição' },
];

export const LEADS_OPTIONS = [
  { value: 'no', label: 'Não' },
  { value: 'lt10', label: 'Sim, até 10' },
  { value: '10to30', label: 'Sim, 10–30' },
  { value: 'gt30', label: 'Mais de 30' },
] as const;

/** Mesmo link do backoffice (perfil do embaixador): a atribuição já entende `?squad=` e `&via=qr`. */
export const ATHLETE_PORTAL = 'https://atleta.nexago.com.br';

export function shareLinks(code: string): { link: string; label: string; qr: string } {
  const link = `${ATHLETE_PORTAL}/?squad=${encodeURIComponent(code)}`;
  return { link, label: link.replace(/^https:\/\//, ''), qr: `${link}&via=qr` };
}

/** Link de um torneio já com o código do embaixador. */
export function tournamentShareLink(tournamentId: string, code: string): string {
  return `${ATHLETE_PORTAL}/torneios/${encodeURIComponent(tournamentId)}?squad=${encodeURIComponent(code)}`;
}

// ── dinheiro e datas ────────────────────────────────────────────────────────

/** "R$ 1.240,00"; `cents = false` arredonda para o real ("R$ 324"). Negativo leva o sinal. */
export function brl(cents: number, withCents = true): string {
  const v = Math.abs(cents) / 100;
  const body = v.toLocaleString('pt-BR', {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
  return `${cents < 0 ? '− ' : ''}R$ ${body}`;
}

/** Data civil de São Paulo (`YYYY-MM-DD`) de um instante. */
export function spKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(d);
}

function keyOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : spKey(new Date(value));
}

/** "20 out" a partir de ISO ou `YYYY-MM-DD`. */
export function dayMonth(value: string | null): string {
  if (!value) return '—';
  const key = keyOf(value);
  return `${key.slice(8, 10)} ${MONTHS[Number(key.slice(5, 7)) - 1] ?? ''}`;
}

function hourMinute(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { timeZone: SP, hour: '2-digit', minute: '2-digit' });
}

function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

/** "Hoje 14:12", "Ontem", "14 out". */
export function whenLabel(value: string | null, now: Date): string {
  if (!value) return '—';
  const d = new Date(value);
  const diff = daysBetweenKeys(spKey(d), spKey(now));
  if (diff === 0) return `Hoje ${hourMinute(d)}`;
  if (diff === 1) return 'Ontem';
  return dayMonth(value);
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}

// ── ciclo e contrato ────────────────────────────────────────────────────────

/** "Piloto · dia 38 de 90" (mesma conta do backoffice, tela 01). */
export function cyclePill(cycle: SquadCycle, now: Date): string {
  const total = daysBetweenKeys(cycle.start, cycle.end) + 1;
  const today = spKey(now);
  const name = cycle.id === 'piloto' ? 'Piloto' : 'Ciclo';
  if (today < cycle.start) return `${name} · começa em ${dayMonth(cycle.start)}`;
  if (today > cycle.end) return `${name} · encerrado em ${dayMonth(cycle.end)}`;
  return `${name} · dia ${daysBetweenKeys(cycle.start, today) + 1} de ${total}`;
}

/** Faixa de aviso no topo das telas do embaixador. `null` = contrato ativo sem pendência. */
export function contractNotice(c: AmbassadorView['contract']): { tone: 'warning' | 'info'; text: string } | null {
  if (c.status === 'ended') {
    return {
      tone: 'warning',
      text: `Seu contrato do Squad terminou${c.endedAt ? ` em ${dayMonth(c.endedAt)}` : ''}. O código não dá mais desconto; comissões já pagas pelo atleta seguem para o repasse.`,
    };
  }
  if (c.status === 'paused') {
    return {
      tone: 'warning',
      text: `Contrato pausado${c.pausedUntil ? ` até ${dayMonth(c.pausedUntil)}` : ''}: enquanto isso o seu código não dá desconto nem gera comissão.`,
    };
  }
  if (c.pendingTier) {
    return {
      tone: 'info',
      text: `O time NexaGO propôs a mudança para ${TIER_LABELS[c.pendingTier]}. Abra o app nexaGO para ver o aditivo e aceitar.`,
    };
  }
  return null;
}

/** "desde 08 set · contrato até 06 dez". */
export function contractPeriod(c: AmbassadorView['contract']): string {
  const parts: string[] = [];
  if (c.start) parts.push(`desde ${dayMonth(c.start)}`);
  if (c.status === 'ended') parts.push(`encerrado${c.endedAt ? ` em ${dayMonth(c.endedAt)}` : ''}`);
  else if (c.end) parts.push(`contrato até ${dayMonth(c.end)}`);
  return parts.join(' · ');
}

/**
 * "Quem usa o seu código ganha até 10% OFF…": o desconto real tem teto na taxa da plataforma.
 * Nível sem desconto do seguidor (0%) não promete nada (`discount: null`).
 */
export function followerOffer(c: AmbassadorView['contract']): { discount: string | null; rest: string } {
  const where = c.followerDiscountFirstOnly ? 'na primeira inscrição' : 'nas inscrições';
  return {
    discount: c.followerDiscountPct > 0 ? `até ${c.followerDiscountPct}% OFF ${where}` : null,
    rest: `Você recebe ${c.commissionPct}% depois que o pagamento é confirmado.`,
  };
}

// ── status da comissão ─────────────────────────────────────────────────────

export type StatusTone = 'pending' | 'win' | 'dim' | 'live';

const CANCEL_LABELS: Record<CancelReason, string> = {
  refund: 'Cancelada · reembolso',
  chargeback: 'Cancelada · contestação',
  payment_failed: 'Cancelada · não pago',
  manual: 'Cancelada',
};

export function commissionStatusMeta(status: CommissionStatus, reason: CancelReason | null): { label: string; tone: StatusTone } {
  switch (status) {
    case 'pending':
      return { label: 'Aguardando pgto', tone: 'pending' };
    case 'released':
      return { label: 'Liberada', tone: 'win' };
    case 'held':
      return { label: 'Em revisão', tone: 'pending' };
    case 'paid':
      return { label: 'Paga', tone: 'dim' };
    case 'canceled':
      return { label: reason ? CANCEL_LABELS[reason] : 'Cancelada', tone: 'live' };
  }
}

export const ORIGIN_LABELS: Record<CommissionOrigin, string> = { code: 'Código', link: 'Link', qr: 'QR' };

// ── painel ──────────────────────────────────────────────────────────────────

export interface FunnelStep {
  label: string;
  value: number | null;
  pct: number;
}

export function funnelSteps(f: AmbassadorView['funnel']): FunnelStep[] {
  const steps: Array<[string, number | null]> = [
    ['Cliques', f.clicks],
    ['Cadastros', f.signups],
    ['Inscrições', f.registrations],
    ['Pagas', f.paid],
  ];
  const max = Math.max(1, ...steps.map(([, v]) => v ?? 0));
  return steps.map(([label, value]) => ({ label, value, pct: !value ? 0 : Math.max(6, (value / max) * 100) }));
}

/** "Você recebe" do painel: "repasse em 20 out", ou o mínimo que ainda falta acumular. */
export function availableHint(view: Pick<AmbassadorView, 'totals' | 'payout'>): string {
  const { availableCents, heldCents } = view.totals;
  const held = heldCents > 0 ? ` · ${brl(heldCents)} em revisão` : '';
  if (availableCents <= 0) return `próximo repasse em ${dayMonth(view.payout.nextDate)}${held}`;
  if (availableCents < view.payout.minNetCents) {
    return `acumulando · repasse a partir de ${brl(view.payout.minNetCents, false)}${held}`;
  }
  return `vai pra carteira em ${dayMonth(view.payout.nextDate)}${held}`;
}

// ── pontos e nível ──────────────────────────────────────────────────────────

export interface LevelBar {
  name: string;
  /** Quanto da faixa já foi preenchido (0–100). */
  pct: number;
  current: boolean;
  done: boolean;
}

export interface LevelProgress {
  current: string;
  next: { name: string; missing: number } | null;
  bars: LevelBar[];
}

/** Bronze 0 · Silver 500 · Gold 1000 · Elite 2000 → 1.280 pts = Gold, 28% da faixa, 720 p/ Elite. */
export function levelProgress(points: Pick<SquadPoints, 'total' | 'levels'>): LevelProgress {
  const levels = [...points.levels].sort((a, b) => a.min - b.min);
  if (levels.length === 0) return { current: '—', next: null, bars: [] };
  let index = 0;
  levels.forEach((l, i) => {
    if (points.total >= l.min) index = i;
  });
  const bars = levels.map((l, i) => {
    const upper = levels[i + 1]?.min ?? null;
    const pct =
      points.total < l.min
        ? 0
        : upper === null
          ? 100
          : Math.min(100, ((points.total - l.min) / Math.max(1, upper - l.min)) * 100);
    return { name: l.name, pct: Math.round(pct), current: i === index, done: i < index };
  });
  const next = levels[index + 1];
  return {
    current: levels[index]!.name,
    next: next ? { name: next.name, missing: next.min - points.total } : null,
    bars,
  };
}

export interface PointsRule {
  label: string;
  value: string;
  /** Ainda sem contagem no NexaGO. */
  soon: boolean;
}

export function pointsRules(points: SquadPoints): PointsRule[] {
  return [
    { label: 'Conversão paga', value: `+${points.perConversion}`, soon: false },
    { label: 'Presença em evento', value: `+${points.perEvent}`, soon: points.events === null },
    { label: 'Conteúdo aprovado', value: `+${points.perContent}`, soon: points.content === null },
  ];
}

// ── pacote e promoção ───────────────────────────────────────────────────────

function commissionLabel(pct: PublicPackage['commissionPct']): string {
  return Array.isArray(pct) ? `Comissão de ${pct[0]} a ${pct[1]}%` : `Comissão de ${pct}%`;
}

function registrationsLabel(r: PublicPackage['registrations']): string {
  if (r.type === 'discount') return `${r.value ?? 0}% off nas suas inscrições`;
  if (r.type === 'freePerMonth') {
    const n = r.value ?? 1;
    return n === 1 ? '1 inscrição gratuita por mês' : `${n} inscrições gratuitas por mês`;
  }
  return 'Inscrições gratuitas';
}

/** Chips "O que muda" do próximo nível. */
export function packageChips(pkg: PublicPackage): string[] {
  const out = [commissionLabel(pkg.commissionPct), registrationsLabel(pkg.registrations)];
  if (pkg.kit) out.push(pkg.kit);
  if (pkg.events) out.push(`Eventos: ${pkg.events}`);
  if (pkg.partnerHalfOff) out.push('50% para sua dupla');
  if (pkg.campaignFee) out.push('Cachê por campanha');
  if (pkg.tournamentOriginBonusCents) out.push('Bônus por torneio originado');
  return out;
}

export type BenefitIcon = 'trend' | 'gift' | 'bag' | 'star';
export type BenefitStatus = 'active' | 'paused' | 'package';

export interface Benefit {
  label: string;
  sub: string;
  icon: BenefitIcon;
  status: BenefitStatus;
}

/**
 * O pacote congelado no contrato. "Ativo" só no que o NexaGO já opera sozinho (comissão e desconto
 * do seguidor); o resto é "No pacote", porque uso e entrega ainda não são registrados.
 */
export function benefitsOf(view: Pick<AmbassadorView, 'contract' | 'package'>): Benefit[] {
  const { contract: c, package: pkg } = view;
  const live: BenefitStatus = c.status === 'active' ? 'active' : 'paused';
  const out: Benefit[] = [
    { label: `${c.commissionPct}% de comissão`, sub: 'sobre cada inscrição paga com seu código', icon: 'trend', status: live },
  ];
  if (c.followerDiscountPct > 0) {
    out.push({
      label: `Até ${c.followerDiscountPct}% OFF pra quem usa seu código`,
      sub: `${c.followerDiscountFirstOnly ? 'na primeira inscrição' : 'nas inscrições'} · sai da taxa da plataforma, com teto nela`,
      icon: 'gift',
      status: live,
    });
  }
  out.push({ label: registrationsLabel(pkg.registrations), sub: 'benefício do seu nível', icon: 'gift', status: 'package' });
  if (pkg.kit) out.push({ label: pkg.kit, sub: 'kit do seu nível', icon: 'bag', status: 'package' });
  if (pkg.events) out.push({ label: `Eventos: ${pkg.events}`, sub: 'acesso às ações NexaGO', icon: 'star', status: 'package' });
  if (pkg.partnerHalfOff) out.push({ label: '50% para sua dupla', sub: 'em ações selecionadas', icon: 'gift', status: 'package' });
  if (pkg.campaignFee) out.push({ label: 'Cachê por campanha', sub: 'combinado com o time a cada campanha', icon: 'star', status: 'package' });
  if (pkg.tournamentOriginBonusCents) {
    out.push({
      label: `Bônus de ${brl(pkg.tournamentOriginBonusCents, false)} por torneio originado`,
      sub: 'quando um torneio novo nasce pela sua indicação',
      icon: 'star',
      status: 'package',
    });
  }
  return out;
}

export const BENEFIT_STATUS_LABELS: Record<BenefitStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  package: 'No pacote',
};

export interface PromotionCopy {
  kind: SquadPromotion['kind'];
  /** "Faltam 3 conversões pra concorrer". */
  title: string;
  /** Texto curto do painel ("Mais 3 até a avaliação de 06 dez…"). */
  summary: string;
  pct: number;
  conversions: number;
  min: number;
  to: SquadTier | null;
}

export function promotionCopy(p: SquadPromotion): PromotionCopy {
  if (p.kind === 'captain') {
    return {
      kind: 'captain',
      title: 'Captain é o seu caminho',
      summary: 'Captain corre em paralelo à escada: o time avalia a sua comunidade ao fim do ciclo.',
      pct: 100,
      conversions: 0,
      min: 0,
      to: null,
    };
  }
  if (p.kind === 'top') {
    return {
      kind: 'top',
      title: 'Você está no topo do Squad',
      summary: 'Pro Ambassador é o último nível da escada. A renovação é avaliada pelo time ao fim do ciclo.',
      pct: 100,
      conversions: 0,
      min: 0,
      to: null,
    };
  }
  const missing = Math.max(0, p.min - p.conversions);
  const when = p.evaluation ? ` até a avaliação de ${dayMonth(p.evaluation)}` : '';
  const target = TIER_LABELS[p.to];
  return {
    kind: 'promotion',
    title: missing > 0 ? `Faltam ${plural(missing, 'conversão', 'conversões')} pra concorrer` : `Você já pode concorrer a ${target}`,
    summary:
      missing > 0
        ? `Mais ${missing}${when} para concorrer a ${target}.`
        : `Meta de conversões batida: o time avalia a promoção a ${target}${when ? ` na avaliação de ${dayMonth(p.evaluation)}` : ''}.`,
    pct: p.min > 0 ? Math.min(100, (p.conversions / p.min) * 100) : 100,
    conversions: p.conversions,
    min: p.min,
    to: p.to,
  };
}

// ── ganhos ──────────────────────────────────────────────────────────────────

export interface WeekBar {
  /** "8 set" no primeiro e em virada de mês; senão só o dia ("15"). */
  label: string;
  cents: number;
  pct: number;
  best: boolean;
}

/** Segunda-feira (SP) da semana de uma data civil. */
function mondayOf(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Comissão das conversões por semana (segunda a domingo, pela data da inscrição), as últimas
 * `weeks` com a atual no fim. A melhor semana leva o torneio que mais rendeu nela.
 */
export function weeklyCommissions(
  lines: readonly SquadCommissionLine[],
  now: Date,
  weeks = 6,
): { bars: WeekBar[]; best: { cents: number; event: string | null } | null } {
  const last = mondayOf(spKey(now));
  const starts = Array.from({ length: weeks }, (_, i) => addDays(last, (i - weeks + 1) * 7));
  const sums = starts.map(() => 0);
  const events = starts.map(() => new Map<string, number>());
  for (const c of lines) {
    if ((c.status !== 'released' && c.status !== 'paid' && c.status !== 'held') || !c.at) continue;
    const i = starts.indexOf(mondayOf(spKey(new Date(c.at))));
    if (i < 0) continue;
    sums[i]! += c.amountCents;
    const name = c.event.split(' · ')[0] || '';
    if (name) events[i]!.set(name, (events[i]!.get(name) ?? 0) + c.amountCents);
  }
  const max = Math.max(...sums);
  const bestIndex = max > 0 ? sums.indexOf(max) : -1;
  const bars = starts.map((key, i) => {
    const prev = starts[i - 1];
    const label = i === 0 || key.slice(5, 7) !== prev!.slice(5, 7) ? dayMonth(key).replace(/^0/, '') : String(Number(key.slice(8, 10)));
    return { label, cents: sums[i]!, pct: max > 0 ? Math.max(3, (sums[i]! / max) * 100) : 3, best: i === bestIndex };
  });
  if (bestIndex < 0) return { bars, best: null };
  const top = [...events[bestIndex]!.entries()].sort((a, b) => b[1] - a[1])[0];
  return { bars, best: { cents: max, event: top?.[0] ?? null } };
}

export type StatementFilter = 'all' | 'commissions' | 'payouts';

export interface StatementLine {
  id: string;
  at: string | null;
  when: string;
  title: string;
  amount: string;
  kind: 'commission' | 'adjustment' | 'payout';
  status: { label: string; tone: StatusTone } | null;
  struck: boolean;
}

/** Extrato da tela Ganhos: comissões, estornos e repasses para a carteira, do mais novo ao mais velho. */
export function statementLines(
  view: Pick<AmbassadorView, 'commissions' | 'adjustments' | 'wallet'>,
  filter: StatementFilter,
  now: Date,
): StatementLine[] {
  const out: StatementLine[] = [];
  if (filter !== 'payouts') {
    for (const c of view.commissions) {
      out.push({
        id: `c:${c.id}`,
        at: c.at,
        when: whenLabel(c.at, now).replace(/ \d{2}:\d{2}$/, ''),
        title: [c.athlete, c.event.split(' · ')[0]].filter(Boolean).join(' · '),
        amount: c.status === 'canceled' ? brl(c.amountCents) : `+ ${brl(c.amountCents)}`,
        kind: 'commission',
        status: commissionStatusMeta(c.status, c.cancelReason),
        struck: c.status === 'canceled',
      });
    }
    for (const a of view.adjustments) {
      out.push({
        id: `a:${a.id}`,
        at: a.at,
        when: whenLabel(a.at, now).replace(/ \d{2}:\d{2}$/, ''),
        title: `Estorno · ${a.athlete}`,
        amount: brl(a.amountCents),
        kind: 'adjustment',
        status: null,
        struck: false,
      });
    }
  }
  if (filter !== 'commissions') {
    for (const t of view.wallet) {
      out.push({
        id: `w:${t.id}`,
        at: t.at,
        when: whenLabel(t.at, now).replace(/ \d{2}:\d{2}$/, ''),
        title: 'Repasse para a carteira',
        amount: brl(-t.amountCents),
        kind: 'payout',
        status: null,
        struck: false,
      });
    }
  }
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** "dias 06 e 20" / "dia 15". */
export function payoutDaysLabel(days: readonly number[]): string {
  const two = [...days].sort((a, b) => a - b).map((d) => String(d).padStart(2, '0'));
  if (two.length <= 1) return `dia ${two[0] ?? '—'}`;
  return `dias ${two.slice(0, -1).join(', ')} e ${two[two.length - 1]}`;
}

/** "10% de R$ 3.240" quando há receita; senão o texto de partida. */
export function totalHint(view: Pick<AmbassadorView, 'totals' | 'contract'>): string {
  if (view.totals.grossCents <= 0) return 'nenhuma inscrição paga ainda';
  return `${view.contract.commissionPct}% de ${brl(view.totals.grossCents, false)}`;
}
