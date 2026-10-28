/**
 * NexaSquad no portal do atleta: o que as telas mostram, a partir de `getMySquad`,
 * `getSquadRanking` e `getSquadPortalInfo`.
 *
 * Módulo puro (sem Angular, sem Firebase): rótulos, dinheiro, datas de São Paulo, barras de nível,
 * benefícios do pacote, semanas de comissão e o extrato. As regras de negócio (o que é conversão,
 * o que entra no repasse, a posição no ranking) já vêm prontas do servidor.
 */
import type {
  AthletePackage,
  CancelReason,
  CommissionOrigin,
  CommissionStatus,
  RankingEntry,
  SquadMember,
  SquadPortalMemberInfo,
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

/** "R$ 1.240,00"; `withCents = false` arredonda para o real ("R$ 324"). Negativo leva o sinal. */
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

/** "Piloto · dia 38 de 90": o dia do contrato dentro do período dele. */
export function cyclePill(m: Pick<SquadMember, 'cycleId' | 'start' | 'end'>, now: Date): string {
  const name = m.cycleId === 'piloto' ? 'Piloto' : 'Ciclo';
  if (!m.start || !m.end) return name;
  const start = keyOf(m.start);
  const end = keyOf(m.end);
  const today = spKey(now);
  const total = daysBetweenKeys(start, end) + 1;
  if (today < start) return `${name} · começa em ${dayMonth(start)}`;
  if (today > end) return `${name} · encerrado em ${dayMonth(end)}`;
  return `${name} · dia ${daysBetweenKeys(start, today) + 1} de ${total}`;
}

/** Faixa de aviso no topo das telas do embaixador. `null` = contrato ativo sem pendência. */
export function contractNotice(m: SquadMember): { tone: 'warning' | 'info'; text: string } | null {
  if (m.status === 'paused') {
    return {
      tone: 'warning',
      text: `Contrato pausado${m.pausedUntil ? ` até ${dayMonth(m.pausedUntil)}` : ''}: enquanto isso o seu código não dá desconto nem gera comissão.`,
    };
  }
  if (m.endsAt) {
    return {
      tone: 'warning',
      text: `Seu contrato do Squad termina em ${dayMonth(m.endsAt)}. As comissões pagas até lá seguem para o repasse.`,
    };
  }
  if (m.pendingAmendment) {
    return {
      tone: 'info',
      text: `O time NexaGO propôs a mudança para ${m.pendingAmendment.package.tierLabel}. Abra o app nexaGO para ver o aditivo e aceitar.`,
    };
  }
  return null;
}

/** "desde 08 set · contrato até 06 dez". */
export function contractPeriod(m: Pick<SquadMember, 'start' | 'end' | 'endsAt'>): string {
  const parts: string[] = [];
  if (m.start) parts.push(`desde ${dayMonth(m.start)}`);
  const end = m.endsAt ?? m.end;
  if (end) parts.push(`contrato até ${dayMonth(end)}`);
  return parts.join(' · ');
}

/**
 * Onde o desconto vale, pelas regras: "na primeira inscrição e reserva", "em reservas e clubinhos"…
 * `null` = desligado em tudo.
 */
export function discountWhere(
  m: Pick<SquadMember, 'followerDiscountFirstOnly' | 'followerDiscountScope'>,
): string | null {
  const scope = m.followerDiscountScope ?? { registration: true, booking: true, club: true };
  const kinds = (
    [
      ['registration', 'inscrição', 'inscrições'],
      ['booking', 'reserva', 'reservas'],
      ['club', 'clubinho', 'clubinhos'],
    ] as const
  ).filter(([k]) => scope[k]);
  if (kinds.length === 0) return null;
  const names = kinds.map(([, one, many]) => (m.followerDiscountFirstOnly ? one : many));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return m.followerDiscountFirstOnly ? `na primeira ${list}` : `em ${list}`;
}

/**
 * "Quem usa o seu código ganha até 10% OFF…": o desconto real tem teto na taxa da plataforma.
 * Nível sem desconto do seguidor (0%) não promete nada (`discount: null`).
 */
export function followerOffer(
  m: Pick<SquadMember, 'followerDiscountPct' | 'followerDiscountFirstOnly' | 'followerDiscountScope' | 'commissionPct'>,
): { discount: string | null; rest: string } {
  // O código vale onde as regras ligaram o desconto ("só na primeira" = uma de cada tipo).
  const where = discountWhere(m);
  return {
    discount: m.followerDiscountPct > 0 && where ? `até ${m.followerDiscountPct}% OFF ${where}` : null,
    rest: `Você recebe ${m.commissionPct}% depois que o pagamento é confirmado.`,
  };
}

// ── status da comissão ─────────────────────────────────────────────────────

export type StatusTone = 'pending' | 'win' | 'dim' | 'live';

const CANCEL_LABELS: Record<CancelReason, string> = {
  refund: 'Cancelada · reembolso',
  chargeback: 'Cancelada · contestação',
  manual: 'Cancelada',
};

export function commissionStatusMeta(status: CommissionStatus, reason: CancelReason | null): { label: string; tone: StatusTone } {
  switch (status) {
    case 'pending':
      return { label: 'Aguardando pgto', tone: 'pending' };
    case 'released':
      return { label: 'Liberada', tone: 'win' };
    case 'paid':
      return { label: 'Paga', tone: 'dim' };
    case 'canceled':
      return { label: reason ? CANCEL_LABELS[reason] : 'Cancelada', tone: 'live' };
  }
}

export const ORIGIN_LABELS: Record<CommissionOrigin, string> = { code: 'Código', link: 'Link', qr: 'QR' };

// ── painel ──────────────────────────────────────────────────────────────────

/** Comissão confirmada (liberada ou paga): o "Você ganhou" e o total do ciclo, sem o pendente. */
export function earnedCents(m: Pick<SquadMember, 'earnings'>): number {
  return Math.max(0, m.earnings.totalCents - m.earnings.pendingCents);
}

/** Conversões cuja inscrição foi neste mês (SP), entre as comissões recentes. */
export function monthConversions(m: Pick<SquadMember, 'commissions'>, now: Date): number {
  const month = spKey(now).slice(0, 7);
  return m.commissions.filter(
    (c) => (c.status === 'released' || c.status === 'paid') && c.at !== null && spKey(new Date(c.at)).slice(0, 7) === month,
  ).length;
}

export interface FunnelStep {
  label: string;
  value: number | null;
  pct: number;
}

/** Cliques ainda não são medidos ("—"). Mesmas definições do backoffice (tela 01). */
export function funnelSteps(m: Pick<SquadMember, 'conversions'>, extras: SquadPortalMemberInfo): FunnelStep[] {
  const steps: Array<[string, number | null]> = [
    ['Cliques', null],
    ['Cadastros', extras.signups],
    ['Inscrições', Math.max(extras.registrations, m.conversions)],
    ['Pagas', m.conversions],
  ];
  const max = Math.max(1, ...steps.map(([, v]) => v ?? 0));
  return steps.map(([label, value]) => ({ label, value, pct: !value ? 0 : Math.max(6, (value / max) * 100) }));
}

/**
 * Embaixo do "Disponível": quanto entra no repasse em aberto e quando. O que ficou de fora (retido
 * ou liberado depois do fechamento) entra num repasse seguinte; abaixo do mínimo, acumula.
 */
export function availableHint(m: Pick<SquadMember, 'earnings'>): string {
  const e = m.earnings;
  const date = dayMonth(e.nextPayoutDate);
  if (e.availableCents <= 0) return `próximo repasse em ${date}`;
  if (e.nextPayoutCents <= 0) return 'entra num próximo repasse';
  if (e.nextPayoutCents < e.minPayoutCents) return `acumulando · repasse a partir de ${brl(e.minPayoutCents, false)}`;
  if (e.nextPayoutCents < e.availableCents) return `${brl(e.nextPayoutCents)} vão pra carteira em ${date}`;
  return `vai pra carteira em ${date}`;
}

export interface RankRow extends RankingEntry {
  deltaLabel: string;
  deltaTone: 'up' | 'down' | 'flat';
}

/** Os 5 primeiros e o atleta no fim, se estiver fora. A seta compara com 7 dias atrás. */
export function rankingRows(entries: readonly RankingEntry[], me: RankingEntry | null, top = 5): RankRow[] {
  const rows = entries.slice(0, top);
  if (me && !rows.some((r) => r.me)) rows.push(me);
  return rows.map((r) => ({
    ...r,
    deltaLabel: r.delta === null ? 'novo' : r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '—',
    deltaTone: r.delta !== null && r.delta > 0 ? 'up' : r.delta !== null && r.delta < 0 ? 'down' : 'flat',
  }));
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
export function levelProgress(points: Pick<SquadMember['points'], 'total' | 'levels'>): LevelProgress {
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

// ── pacote e promoção ───────────────────────────────────────────────────────

function commissionLabel(pct: AthletePackage['commissionPct']): string {
  return Array.isArray(pct) ? `Comissão de ${pct[0]} a ${pct[1]}%` : `Comissão de ${pct}%`;
}

function registrationsLabel(r: AthletePackage['registrations']): string {
  if (r.type === 'discount') return `${r.value ?? 0}% off nas suas inscrições`;
  if (r.type === 'freePerMonth') {
    const n = r.value ?? 1;
    return n === 1 ? '1 inscrição gratuita por mês' : `${n} inscrições gratuitas por mês`;
  }
  return 'Inscrições gratuitas';
}

/** Chips "O que muda" do próximo nível. */
export function packageChips(pkg: AthletePackage): string[] {
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
 * O pacote congelado no contrato. "Ativo" só no que o NexaGO já opera sozinho (comissão, desconto
 * do seguidor e as inscrições do próprio embaixador); o resto é "No pacote", porque uso e entrega
 * ainda não são registrados.
 */
export function benefitsOf(
  m: Pick<
    SquadMember,
    'status' | 'commissionPct' | 'followerDiscountPct' | 'followerDiscountFirstOnly' | 'followerDiscountScope' | 'package'
  >,
): Benefit[] {
  const pkg = m.package;
  const live: BenefitStatus = m.status === 'active' ? 'active' : 'paused';
  const out: Benefit[] = [
    { label: `${m.commissionPct}% de comissão`, sub: 'sobre cada inscrição paga com seu código', icon: 'trend', status: live },
  ];
  const where = discountWhere(m);
  if (m.followerDiscountPct > 0 && where) {
    out.push({
      label: `Até ${m.followerDiscountPct}% OFF pra quem usa seu código`,
      sub: `${where} · sai da taxa da plataforma, com teto nela`,
      icon: 'gift',
      status: live,
    });
  }
  // Aplicado no checkout das inscrições do próprio embaixador (desconto ou parcela grátis).
  out.push({ label: registrationsLabel(pkg.registrations), sub: 'na sua parcela, direto no pagamento', icon: 'gift', status: live });
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
  kind: 'promotion' | 'top' | 'captain';
  /** "Faltam 3 conversões pra concorrer". */
  title: string;
  /** Texto curto do painel ("Mais 3 até a avaliação de 06 dez…"). */
  summary: string;
  pct: number;
  conversions: number;
  min: number;
  to: SquadTier | null;
}

export function promotionCopy(m: Pick<SquadMember, 'tier' | 'progress'>): PromotionCopy {
  const p = m.progress;
  if (!p) {
    if (m.tier === 'cap') {
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
  const missing = Math.max(0, p.minConversions - p.conversions);
  const when = p.reviewDate ? ` até a avaliação de ${dayMonth(p.reviewDate)}` : '';
  return {
    kind: 'promotion',
    title: missing > 0 ? `Faltam ${plural(missing, 'conversão', 'conversões')} pra concorrer` : `Você já pode concorrer a ${p.toTierLabel}`,
    summary:
      missing > 0
        ? `Mais ${missing}${when} para concorrer a ${p.toTierLabel}.`
        : `Meta de conversões batida: o time avalia a promoção a ${p.toTierLabel}${p.reviewDate ? ` em ${dayMonth(p.reviewDate)}` : ''}.`,
    pct: p.minConversions > 0 ? Math.min(100, (p.conversions / p.minConversions) * 100) : 100,
    conversions: p.conversions,
    min: p.minConversions,
    to: p.toTier,
  };
}

// ── ganhos ──────────────────────────────────────────────────────────────────

export interface WeekBar {
  /** "7 set" no primeiro e em virada de mês; senão só o dia ("14"). */
  label: string;
  cents: number;
  pct: number;
  best: boolean;
}

/** As semanas do servidor (segunda a domingo, pela confirmação do pagamento) em barras. */
export function weekBars(weekly: SquadMember['weekly']): { bars: WeekBar[]; best: { cents: number; weekStart: string } | null } {
  const max = Math.max(0, ...weekly.map((w) => w.cents));
  const bestIndex = max > 0 ? weekly.findIndex((w) => w.cents === max) : -1;
  const bars = weekly.map((w, i) => {
    const prev = weekly[i - 1];
    const label =
      i === 0 || !prev || w.weekStart.slice(5, 7) !== prev.weekStart.slice(5, 7)
        ? dayMonth(w.weekStart).replace(/^0/, '')
        : String(Number(w.weekStart.slice(8, 10)));
    return { label, cents: w.cents, pct: max > 0 ? Math.max(3, (w.cents / max) * 100) : 3, best: i === bestIndex };
  });
  return { bars, best: bestIndex >= 0 ? { cents: max, weekStart: weekly[bestIndex]!.weekStart } : null };
}

export type StatementFilter = 'all' | 'commissions' | 'payouts';

export interface StatementLine {
  id: string;
  at: string | null;
  when: string;
  title: string;
  amount: string;
  kind: 'commission' | 'payout';
  status: { label: string; tone: StatusTone } | null;
  struck: boolean;
}

/** Extrato da tela Ganhos: comissões e repasses para a carteira, do mais novo ao mais velho. */
export function statementLines(m: Pick<SquadMember, 'commissions' | 'payouts'>, filter: StatementFilter, now: Date): StatementLine[] {
  const day = (at: string | null) => whenLabel(at, now).replace(/ \d{2}:\d{2}$/, '');
  const out: StatementLine[] = [];
  if (filter !== 'payouts') {
    for (const c of m.commissions) {
      out.push({
        id: `c:${c.id}`,
        at: c.at,
        when: day(c.at),
        title: [c.label, c.tournamentName].filter(Boolean).join(' · '),
        amount: c.status === 'canceled' ? brl(c.amountCents) : `+ ${brl(c.amountCents)}`,
        kind: 'commission',
        status: commissionStatusMeta(c.status, c.cancelReason),
        struck: c.status === 'canceled',
      });
    }
  }
  if (filter !== 'commissions') {
    for (const p of m.payouts) {
      out.push({
        id: `p:${p.id}`,
        at: p.at,
        when: day(p.at),
        title: 'Repasse para a carteira',
        amount: brl(-p.amountCents),
        kind: 'payout',
        status: null,
        struck: false,
      });
    }
  }
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

/** "10% de R$ 3.240" quando há receita; senão o texto de partida. */
export function totalHint(m: Pick<SquadMember, 'earnings' | 'commissionPct'>): string {
  if (m.earnings.revenueCents <= 0) return 'nenhuma inscrição paga ainda';
  return `${m.commissionPct}% de ${brl(m.earnings.revenueCents, false)}`;
}
