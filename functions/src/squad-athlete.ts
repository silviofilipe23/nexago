/**
 * NexaSquad: o que o próprio atleta vê do programa (app 01–06; portal do atleta 01–03).
 *
 * As rules só deixam o atleta ler o próprio convite (`squadInvites`) e a própria carteira
 * (`squadWallets`); contrato, comissões e regras são do backoffice. Estas callables montam a visão
 * do atleta a partir deles e devolvem só o que é dele: pontos, nível, ganhos e o pacote do nível.
 * Nunca saem daqui Score, ROI, custo do kit, teto de cachê, motivo de pausa/encerramento, notas
 * internas nem o teto oculto das inscrições grátis.
 *
 *   getMySquad      — contrato, ganhos, conversões, pontos e pacote (ou o convite em aberto).
 *   getSquadRanking — embaixadores do ciclo por pontos (só para quem tem contrato vivo).
 *   viewSquadInvite — o convite com o pacote do nível; ver é abrir (mesmo `openInviteCore` de
 *                     `openSquadInvite`: o card vai para Contrato enviado e o prazo conta dali).
 *
 * Conversão = comissão com pagamento confirmado (`released` ou `paid`), como no backoffice.
 * Pontos = conversões × `points.perConversion` das regras vigentes. Presença em evento e conteúdo
 * ainda não têm fonte de dados: contam zero até existirem (`squadPoints` já recebe os três).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {artifactsPublicDataBase} from "./firebase-paths";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {SQUAD_INVITES, dateOf, loadCurrentRules, loadCycle, openInviteCore, spDateKey} from "./squad-applications";
import {
  SQUAD_ADJUSTMENTS,
  SQUAD_AMBASSADORS,
  SQUAD_COMMISSIONS,
  SQUAD_WALLETS,
  lastDonePayout,
  loadPayoutConfig,
  openPayoutDate,
} from "./squad-commissions";
import {pendingAmendment} from "./squad-contracts";
import {
  DEFAULT_SQUAD_RULES,
  SQUAD_CONFIG,
  SQUAD_RULES_DOC,
  SQUAD_RULES_VERSIONS,
  SQUAD_TIERS,
  TIER_LABELS,
  commissionFloor,
  loadAttributionRules,
  type RegistrationType,
  type SquadRules,
  type SquadTier,
  type TierPackage,
} from "./squad-rules";

type Raw = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 6;
const RECENT_MAX = 50;
const RANKING_MAX = 100;
const LIVE_CONTRACT = ["active", "paused"];
const CONFIRMED = ["released", "paid"];

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function int(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === "string" && (SQUAD_TIERS as readonly string[]).includes(v);
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

// ── pontos e nível ──────────────────────────────────────────────────────────

export interface PointsInput {
  conversions: number;
  events?: number;
  content?: number;
}

export function squadPoints(input: PointsInput, points: SquadRules["points"]): number {
  return input.conversions * points.perConversion +
    (input.events ?? 0) * points.perEvent +
    (input.content ?? 0) * points.perContent;
}

/** O maior nível cujo mínimo já foi alcançado (o primeiro começa em 0). */
export function levelFor(total: number, levels: SquadRules["points"]["levels"]): string {
  let name = levels[0]?.name ?? "";
  for (const l of levels) {
    if (total >= l.min) name = l.name;
  }
  return name;
}

// ── pacote do nível, sem o que é interno ────────────────────────────────────

export interface AthletePackage {
  tier: SquadTier;
  tierLabel: string;
  /** Exato, ou a faixa `[min, max]` do Pro antes do contrato fixar o valor. */
  commissionPct: number | [number, number];
  followerDiscountPct: number;
  /** `freeUnlimited` sai sem `value`: o teto mensal é oculto por regra do programa. */
  registrations: {type: RegistrationType; value: number | null};
  kit: string;
  events: string;
  partnerHalfOff: boolean;
  /** Pro recebe cachê por campanha; o teto do cachê é interno. */
  campaignFee: boolean;
  /** Captain: bônus por torneio originado. */
  tournamentOriginBonusCents: number | null;
}

export function athletePackage(tier: SquadTier, pkg: TierPackage, commissionPct?: number | null): AthletePackage {
  const commission: number | [number, number] = typeof commissionPct === "number" ?
    commissionPct :
    Array.isArray(pkg.commissionPct) ? [pkg.commissionPct[0], pkg.commissionPct[1]] : pkg.commissionPct;
  const type = pkg.registrations?.type ?? "discount";
  return {
    tier,
    tierLabel: TIER_LABELS[tier],
    commissionPct: commission,
    followerDiscountPct: pkg.followerDiscountPct,
    registrations: {type, value: type === "freeUnlimited" ? null : int(pkg.registrations?.value)},
    kit: str(pkg.kit).trim(),
    events: str(pkg.events).trim(),
    partnerHalfOff: pkg.partnerHalfOff === true,
    campaignFee: tier === "pro" && int(pkg.campaignFeeCapCents) > 0,
    tournamentOriginBonusCents: tier === "cap" && int(pkg.tournamentOriginBonusCents) > 0 ?
      int(pkg.tournamentOriginBonusCents) : null,
  };
}

function packageOf(rules: SquadRules, tier: SquadTier): TierPackage {
  return isObj(rules.tiers?.[tier]) ? rules.tiers[tier] : DEFAULT_SQUAD_RULES.tiers[tier];
}

/** Regras de uma versão (o retrato congelado no contrato); sem retrato, as vigentes. */
async function rulesForVersion(db: Firestore, version: number | null, current: SquadRules): Promise<SquadRules> {
  if (version === null) return current;
  const snap = await db.collection(SQUAD_CONFIG).doc(SQUAD_RULES_DOC)
    .collection(SQUAD_RULES_VERSIONS).doc(String(version)).get();
  const rules = snap.data()?.["rules"];
  return isObj(rules) && isObj(rules["tiers"]) ? (rules as unknown as SquadRules) : current;
}

// ── comissões do atleta ─────────────────────────────────────────────────────

export type AthleteCommissionStatus = "pending" | "released" | "paid" | "canceled";

export interface AthleteCommission {
  id: string;
  at: string | null;
  /** "Lucas M." ou "Equipe CFC (4 atl.)" — o rótulo que a comissão já guarda. */
  label: string;
  tournamentName: string;
  categoryName: string;
  origin: "code" | "link" | "qr";
  amountCents: number;
  status: AthleteCommissionStatus;
  /** Só para cancelada: o motivo em código. A nota escrita pelo time é interna. */
  cancelReason: "refund" | "chargeback" | "manual" | null;
}

interface CommissionRow {
  id: string;
  ambassadorId: string;
  status: string;
  cancelReason: string;
  registeredAt: Date | null;
  releasedAt: Date | null;
  amountCents: number;
  grossCents: number;
  converted: number;
  payoutId: string | null;
  raw: Raw;
}

function rowOf(id: string, d: Raw): CommissionRow {
  const converted = Array.isArray(d["convertedAthleteIds"]) ? d["convertedAthleteIds"].length : 1;
  return {
    id,
    ambassadorId: str(d["ambassadorId"]),
    status: str(d["status"]),
    cancelReason: str(d["cancelReason"]),
    registeredAt: dateOf(d["registeredAt"]) ?? dateOf(d["createdAt"]),
    releasedAt: dateOf(d["releasedAt"]),
    amountCents: int(d["amountCents"]),
    grossCents: int(d["grossCents"]),
    converted: Math.max(1, converted),
    payoutId: typeof d["payoutId"] === "string" ? d["payoutId"] : null,
    raw: d,
  };
}

/** Comissões do contrato atual: as do ciclo anterior (contrato renovado) ficam de fora. */
function inContract(rows: CommissionRow[], start: Date | null): CommissionRow[] {
  if (!start) return rows;
  return rows.filter((r) => r.registeredAt === null || r.registeredAt.getTime() >= start.getTime());
}

/**
 * Cancelada por pagamento não concluído nunca virou venda (PIX vencido): não entra no extrato do
 * atleta, só confundiria. Reembolso, estorno e cancelamento manual entram, riscados.
 */
function visibleToAthlete(r: CommissionRow): boolean {
  return !(r.status === "canceled" && r.cancelReason === "payment_failed");
}

function athleteCommission(r: CommissionRow): AthleteCommission {
  const origin = r.raw["origin"] === "qr" ? "qr" : r.raw["origin"] === "link" ? "link" : "code";
  const status: AthleteCommissionStatus = r.status === "released" || r.status === "paid" || r.status === "canceled" ?
    r.status : "pending";
  const reason = r.cancelReason === "refund" || r.cancelReason === "chargeback" ? r.cancelReason : "manual";
  return {
    id: r.id,
    at: iso(r.registeredAt),
    label: str(r.raw["convertedLabel"]) || "Atleta",
    tournamentName: str(r.raw["tournamentName"]),
    categoryName: str(r.raw["categoryName"]),
    origin,
    amountCents: r.amountCents,
    status,
    cancelReason: status === "canceled" ? reason : null,
  };
}

/** Segunda-feira (data civil de SP) da semana de `key`. */
export function weekStartKey(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Ganhos confirmados por semana (pela data da confirmação), das últimas `weeks` semanas. */
export function weeklyEarnings(rows: CommissionRow[], now: Date, weeks = WEEKS): Array<{weekStart: string; cents: number}> {
  const current = weekStartKey(spDateKey(now));
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(`${current}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    keys.push(d.toISOString().slice(0, 10));
  }
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const r of rows) {
    if (!CONFIRMED.includes(r.status) || !r.releasedAt) continue;
    const k = weekStartKey(spDateKey(r.releasedAt));
    if (sums.has(k)) sums.set(k, sums.get(k)! + r.amountCents);
  }
  return keys.map((k) => ({weekStart: k, cents: sums.get(k)!}));
}

// ── visão do atleta ─────────────────────────────────────────────────────────

export interface SquadInviteSummary {
  id: string;
  tier: SquadTier;
  tierLabel: string;
  expiresAt: string | null;
}

export interface SquadMemberView {
  tier: SquadTier;
  tierLabel: string;
  code: string;
  status: "active" | "paused";
  /** Data civil de retorno da pausa, quando marcada. */
  pausedUntil: string | null;
  /** Data civil em que o contrato encerra antes do fim do ciclo, quando marcada. */
  endsAt: string | null;
  start: string | null;
  end: string | null;
  cycleId: string;
  commissionPct: number;
  followerDiscountPct: number;
  /** "Desconto só na primeira inscrição" das regras de atribuição. */
  followerDiscountFirstOnly: boolean;
  pendingAmendment: null | {at: string | null; package: AthletePackage};
  earnings: {
    /** Pendente + liberada + paga: tudo que o código gerou no ciclo. */
    totalCents: number;
    /** Liberada e ainda não repassada (com os ajustes de reembolso descontados). */
    availableCents: number;
    /** Aguardando o pagamento da inscrição. */
    pendingCents: number;
    /** O que já caiu na carteira neste ciclo. */
    receivedCents: number;
    /** Valor das inscrições confirmadas com o código. */
    revenueCents: number;
    nextPayoutDate: string;
    minPayoutCents: number;
  };
  conversions: number;
  athletes: number;
  weekly: Array<{weekStart: string; cents: number}>;
  commissions: AthleteCommission[];
  payouts: Array<{id: string; at: string | null; amountCents: number}>;
  points: {total: number; level: string; levels: Array<{name: string; min: number}>; perConversion: number};
  /** Próxima promoção por conversões; `null` no topo da escada (Pro) e no Captain, que é paralelo. */
  progress: null | {toTier: SquadTier; toTierLabel: string; conversions: number; minConversions: number; reviewDate: string | null};
  package: AthletePackage;
  nextPackage: AthletePackage | null;
}

export interface MySquadView {
  member: SquadMemberView | null;
  invite: SquadInviteSummary | null;
}

/** Convite enviado/aberto e dentro do prazo (o agendado ainda não chegou ao atleta). */
export async function openInviteFor(db: Firestore, uid: string, now: Date): Promise<SquadInviteSummary | null> {
  const snap = await db.collection(SQUAD_INVITES).where("athleteId", "==", uid).get();
  const open = snap.docs
    .map((d) => ({id: d.id, d: d.data() as Raw}))
    .filter(({d}) => {
      const expiresAt = dateOf(d["expiresAt"]);
      return (d["status"] === "sent" || d["status"] === "opened") && (!expiresAt || expiresAt > now);
    })
    .sort((a, b) => (dateOf(b.d["sentAt"])?.getTime() ?? 0) - (dateOf(a.d["sentAt"])?.getTime() ?? 0));
  const first = open[0];
  if (!first) return null;
  const tier = isTier(first.d["tier"]) ? first.d["tier"] : "ath";
  return {id: first.id, tier, tierLabel: TIER_LABELS[tier], expiresAt: iso(dateOf(first.d["expiresAt"]))};
}

export async function mySquadCore(db: Firestore, uid: string, now: Date): Promise<MySquadView> {
  const contract = (await db.collection(SQUAD_AMBASSADORS).doc(uid).get()).data();
  if (!contract || !LIVE_CONTRACT.includes(str(contract["status"]))) {
    return {member: null, invite: await openInviteFor(db, uid, now)};
  }

  const [{rules}, attribution, payoutConfig, lastDone, commissionsSnap, adjustmentsSnap, walletSnap, cycle] =
    await Promise.all([
      loadCurrentRules(db),
      loadAttributionRules(db),
      loadPayoutConfig(db),
      lastDonePayout(db),
      db.collection(SQUAD_COMMISSIONS).where("ambassadorId", "==", uid).get(),
      db.collection(SQUAD_ADJUSTMENTS).where("ambassadorId", "==", uid).get(),
      db.collection(SQUAD_WALLETS).doc(uid).collection("transactions").get(),
      loadCycle(db),
    ]);

  const tier = isTier(contract["tier"]) ? contract["tier"] : "ath";
  const start = dateOf(contract["start"]) ?? dateOf(contract["createdAt"]);
  const end = dateOf(contract["end"]);
  const version = typeof contract["rulesVersion"] === "number" ? contract["rulesVersion"] : null;
  const contractRules = await rulesForVersion(db, version, rules);
  const pkg = packageOf(contractRules, tier);
  const commissionPct = typeof contract["commissionPct"] === "number" ?
    contract["commissionPct"] : commissionFloor(pkg.commissionPct);
  const followerDiscountPct = typeof contract["followerDiscountPct"] === "number" ?
    contract["followerDiscountPct"] : pkg.followerDiscountPct;

  const rows = inContract(commissionsSnap.docs.map((d) => rowOf(d.id, d.data() as Raw)), start);
  const confirmed = rows.filter((r) => CONFIRMED.includes(r.status));
  const sum = (list: CommissionRow[], f: (r: CommissionRow) => number) => list.reduce((n, r) => n + f(r), 0);
  const pendingCents = sum(rows.filter((r) => r.status === "pending"), (r) => r.amountCents);
  const releasedUnpaid = sum(rows.filter((r) => r.status === "released" && r.payoutId === null), (r) => r.amountCents);
  const adjustments = adjustmentsSnap.docs
    .map((d) => d.data() as Raw)
    .filter((a) => (a["payoutId"] ?? null) === null)
    .reduce((n, a) => n + int(a["amountCents"]), 0);

  const payouts = walletSnap.docs
    .map((d) => ({id: d.id, at: dateOf((d.data() as Raw)["createdAt"]), amountCents: int((d.data() as Raw)["amountCents"])}))
    .filter((p) => !start || !p.at || p.at.getTime() >= start.getTime())
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));

  const conversions = confirmed.length;
  const total = squadPoints({conversions}, rules.points);
  const promotion = rules.promotion.find((p) => p.from === tier) ?? null;

  const amendment = pendingAmendment(contract);
  let pendingView: SquadMemberView["pendingAmendment"] = null;
  if (amendment && isTier(amendment["toTier"])) {
    const toTier = amendment["toTier"];
    const aVersion = typeof amendment["rulesVersion"] === "number" ? amendment["rulesVersion"] : null;
    const aRules = await rulesForVersion(db, aVersion, rules);
    const aPkg = {...packageOf(aRules, toTier)};
    if (typeof amendment["followerDiscountPct"] === "number") aPkg.followerDiscountPct = amendment["followerDiscountPct"];
    pendingView = {
      at: iso(dateOf(amendment["at"])),
      package: athletePackage(toTier, aPkg, typeof amendment["commissionPct"] === "number" ? amendment["commissionPct"] : null),
    };
  }

  return {
    member: {
      tier,
      tierLabel: TIER_LABELS[tier],
      code: str(contract["code"]),
      status: contract["status"] === "paused" ? "paused" : "active",
      pausedUntil: str(contract["pausedUntil"]) || null,
      endsAt: str(contract["endsAt"]) || null,
      start: iso(start),
      end: iso(end),
      cycleId: str(contract["cycleId"]) || cycle.id,
      commissionPct,
      followerDiscountPct,
      followerDiscountFirstOnly: attribution.followerDiscountFirstOnly,
      pendingAmendment: pendingView,
      earnings: {
        totalCents: pendingCents + sum(confirmed, (r) => r.amountCents),
        availableCents: Math.max(0, releasedUnpaid + adjustments),
        pendingCents,
        receivedCents: payouts.reduce((n, p) => n + p.amountCents, 0),
        revenueCents: sum(confirmed, (r) => r.grossCents),
        nextPayoutDate: openPayoutDate(spDateKey(now), lastDone, payoutConfig.days),
        minPayoutCents: payoutConfig.minNetCents,
      },
      conversions,
      athletes: sum(confirmed, (r) => r.converted),
      weekly: weeklyEarnings(rows, now),
      commissions: rows
        .filter(visibleToAthlete)
        .sort((a, b) => (b.registeredAt?.getTime() ?? 0) - (a.registeredAt?.getTime() ?? 0))
        .slice(0, RECENT_MAX)
        .map(athleteCommission),
      payouts: payouts.map((p) => ({id: p.id, at: iso(p.at), amountCents: p.amountCents})),
      points: {
        total,
        level: levelFor(total, rules.points.levels),
        levels: rules.points.levels.map((l) => ({name: l.name, min: l.min})),
        perConversion: rules.points.perConversion,
      },
      progress: promotion ? {
        toTier: promotion.to,
        toTierLabel: TIER_LABELS[promotion.to],
        conversions,
        minConversions: promotion.minConversions,
        reviewDate: iso(end),
      } : null,
      package: athletePackage(tier, pkg, commissionPct),
      nextPackage: promotion ? athletePackage(promotion.to, packageOf(rules, promotion.to)) : null,
    },
    invite: null,
  };
}

// ── ranking por pontos ──────────────────────────────────────────────────────

export interface RankingEntry {
  position: number;
  name: string;
  photoUrl: string | null;
  points: number;
  /** Posições ganhas na semana (negativo = caiu); `null` = não estava no ranking há 7 dias. */
  delta: number | null;
  me: boolean;
}

export interface SquadRankingView {
  entries: RankingEntry[];
  me: RankingEntry | null;
  level: string;
  levels: Array<{name: string; min: number}>;
}

interface Ranked {
  uid: string;
  name: string;
  points: number;
}

function rankOrder(list: Ranked[]): Ranked[] {
  return [...list].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Posição de cada embaixador agora e há 7 dias. Os pontos da semana passada contam só as conversões
 * confirmadas até aquele instante; quem assinou depois disso não tinha posição.
 */
export function rankSquad(input: {
  contracts: Array<{uid: string; name: string; start: Date | null}>;
  commissions: CommissionRow[];
  points: SquadRules["points"];
  now: Date;
}): Array<Ranked & {position: number; delta: number | null}> {
  const weekAgo = input.now.getTime() - 7 * DAY_MS;
  const byAmbassador = new Map<string, CommissionRow[]>();
  for (const c of input.commissions) {
    const list = byAmbassador.get(c.ambassadorId) ?? [];
    list.push(c);
    byAmbassador.set(c.ambassadorId, list);
  }
  const nowList: Ranked[] = [];
  const prevList: Ranked[] = [];
  for (const contract of input.contracts) {
    const mine = inContract(byAmbassador.get(contract.uid) ?? [], contract.start);
    nowList.push({uid: contract.uid, name: contract.name, points: squadPoints({conversions: mine.length}, input.points)});
    if (!contract.start || contract.start.getTime() <= weekAgo) {
      const before = mine.filter((c) => c.releasedAt !== null && c.releasedAt.getTime() <= weekAgo);
      prevList.push({uid: contract.uid, name: contract.name, points: squadPoints({conversions: before.length}, input.points)});
    }
  }
  const prevPos = new Map(rankOrder(prevList).map((r, i) => [r.uid, i + 1]));
  return rankOrder(nowList).map((r, i) => {
    const prev = prevPos.get(r.uid);
    return {...r, position: i + 1, delta: prev === undefined ? null : prev - (i + 1)};
  });
}

function photoOf(u: Raw | undefined): string | null {
  return str(u?.["profilePhotoUrl"]) || str(u?.["photoURL"]) || str(u?.["avatarUrl"]) || null;
}

export async function squadRankingCore(db: Firestore, uid: string, now: Date): Promise<SquadRankingView> {
  const mine = (await db.collection(SQUAD_AMBASSADORS).doc(uid).get()).data();
  if (!mine || !LIVE_CONTRACT.includes(str(mine["status"]))) {
    throw new HttpsError("permission-denied", "O ranking do Squad é só para embaixadores.");
  }
  const [{rules}, active, paused, released, paid] = await Promise.all([
    loadCurrentRules(db),
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "active").get(),
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "paused").get(),
    db.collection(SQUAD_COMMISSIONS).where("status", "==", "released").get(),
    db.collection(SQUAD_COMMISSIONS).where("status", "==", "paid").get(),
  ]);
  const contracts = [...active.docs, ...paused.docs].map((d) => {
    const c = d.data() as Raw;
    return {uid: d.id, name: str(c["displayName"]) || "Embaixador", start: dateOf(c["start"]) ?? dateOf(c["createdAt"])};
  });
  const ranked = rankSquad({
    contracts,
    commissions: [...released.docs, ...paid.docs].map((d) => rowOf(d.id, d.data() as Raw)),
    points: rules.points,
    now,
  });
  const top = ranked.slice(0, RANKING_MAX);
  const meRow = ranked.find((r) => r.uid === uid) ?? null;
  const shown = meRow && !top.includes(meRow) ? [...top, meRow] : top;
  const users = shown.length > 0 ?
    await db.getAll(...shown.map((r) => db.collection("users").doc(r.uid))) :
    [];
  const photos = new Map(users.map((s) => [s.id, photoOf(s.data() as Raw | undefined)]));
  const entryOf = (r: (typeof ranked)[number]): RankingEntry => ({
    position: r.position,
    name: r.name,
    photoUrl: photos.get(r.uid) ?? null,
    points: r.points,
    delta: r.delta,
    me: r.uid === uid,
  });
  const me = meRow ? entryOf(meRow) : null;
  return {
    entries: top.map(entryOf),
    me,
    level: levelFor(me?.points ?? 0, rules.points.levels),
    levels: rules.points.levels.map((l) => ({name: l.name, min: l.min})),
  };
}

// ── convite (app 06) ────────────────────────────────────────────────────────

export interface SquadInviteView {
  id: string;
  /** Enviado/aberto vencido aparece como `expired` (a varredura roda de hora em hora). */
  status: string;
  package: AthletePackage;
  suggestedCode: string;
  periodStart: string | null;
  periodEnd: string | null;
  message: string | null;
  expiresAt: string | null;
  firstName: string;
  tournaments: number | null;
}

/** O convite do próprio atleta, com o pacote que o aceite vai congelar (regras vigentes). */
export async function inviteViewCore(db: Firestore, uid: string, inviteId: string, now: Date): Promise<SquadInviteView> {
  const d = (await db.collection(SQUAD_INVITES).doc(inviteId).get()).data();
  if (!d || d["athleteId"] !== uid) throw new HttpsError("not-found", "Convite não encontrado.");
  const [{rules}, user, ranking] = await Promise.all([
    loadCurrentRules(db),
    db.collection("users").doc(uid).get(),
    db.doc(`${artifactsPublicDataBase()}/athleteRankings/${uid}`).get(),
  ]);
  const tier = isTier(d["tier"]) ? d["tier"] : "ath";
  const expiresAt = dateOf(d["expiresAt"]);
  const rawStatus = str(d["status"]);
  const status = (rawStatus === "sent" || rawStatus === "opened") && expiresAt && now >= expiresAt ? "expired" : rawStatus;
  const u = (user.data() ?? {}) as Raw;
  const name = str(u["fullName"]) || str(u["name"]) || str(u["displayName"]) || str(d["athleteName"]);
  const tournaments = ranking.data()?.["tournamentsCount"];
  return {
    id: inviteId,
    status,
    package: athletePackage(tier, packageOf(rules, tier), typeof d["commissionPct"] === "number" ? d["commissionPct"] : null),
    suggestedCode: str(d["suggestedCode"]),
    periodStart: str(d["periodStart"]) || null,
    periodEnd: str(d["periodEnd"]) || null,
    message: str(d["message"]) || null,
    expiresAt: iso(expiresAt),
    firstName: name.trim().split(/\s+/)[0] ?? "",
    tournaments: typeof tournaments === "number" && Number.isFinite(tournaments) ? tournaments : null,
  };
}

// ── callables ───────────────────────────────────────────────────────────────

const CLIENT_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

function athleteUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

export const getMySquad = onCall(CLIENT_CALLABLE, async (request) => {
  return mySquadCore(getFirestore(), athleteUid(request.auth?.uid), new Date());
});

export const getSquadRanking = onCall(CLIENT_CALLABLE, async (request) => {
  return squadRankingCore(getFirestore(), athleteUid(request.auth?.uid), new Date());
});

export const viewSquadInvite = onCall(CLIENT_CALLABLE, async (request) => {
  const uid = athleteUid(request.auth?.uid);
  const inviteId = (request.data ?? {}).inviteId;
  const db = getFirestore();
  const now = new Date();
  await openInviteCore(db, {uid, inviteId}, now);
  return inviteViewCore(db, uid, inviteId as string, now);
});
