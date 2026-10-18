/**
 * NexaSquad no portal do atleta: Squad › Painel (01), Ganhos (02), Nível & benefícios (03) e
 * Entrar no Squad (04).
 *
 * Uma callable de leitura, `getMySquadView`, monta tudo no servidor. Os docs de origem guardam o
 * que o atleta não vê — motivo de retenção, notas e timeline do time, custo, Score, ROI e as regras
 * internas — e rule não filtra campo; por isso nenhum deles ganha leitura de cliente. O que sai
 * daqui é a lista fechada de campos de `SquadAthleteView`. Nada é gravado.
 *
 *   · Conversão = comissão liberada ou paga (a mesma conta do backoffice).
 *   · Pontos = conversões × `points.perConversion`. Presença em evento e conteúdo aprovado ainda
 *     não têm fonte: entram como `null` e a tela diz que a contagem vem depois.
 *   · Squad Ranking = contratos vivos ordenados por pontos, com a posição de 7 dias atrás para a
 *     seta. Nunca por Score.
 *   · Pacote do contrato = o da versão das regras congelada no aceite; promoção e pontos vêm da
 *     vigente (são internos e valem para todos a partir do salvamento).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {
  SQUAD_APPLICATIONS,
  SQUAD_INVITES,
  athleteSnapshot,
  loadCurrentRules,
  loadCycle,
  seatsLeft,
} from "./squad-applications";
import {SQUAD_ATTRIBUTIONS} from "./squad-attribution";
import {shortAthleteName} from "./squad-commission-lifecycle";
import {
  SQUAD_ADJUSTMENTS,
  SQUAD_AMBASSADORS,
  SQUAD_COMMISSIONS,
  SQUAD_WALLETS,
  lastDonePayout,
  loadPayoutConfig,
  openPayoutDate,
  spDateKey,
  type CancelReason,
} from "./squad-commissions";
import {nextCycleStart, type Cycle} from "./squad-program";
import {
  DEFAULT_SQUAD_RULES,
  SQUAD_CONFIG,
  SQUAD_RULES_DOC,
  SQUAD_RULES_VERSIONS,
  SQUAD_TIERS,
  type RegistrationType,
  type SquadRules,
  type SquadTier,
  type TierPackage,
} from "./squad-rules";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
/** Extrato da tela Ganhos: as mais recentes bastam (o piloto inteiro cabe com folga). */
const MAX_LINES = 200;
/** Quantos aparecem no card do ranking (o atleta entra no fim se estiver fora). */
const RANKING_TOP = 5;

type Raw = Record<string, unknown>;

// ── tipos da resposta ───────────────────────────────────────────────────────

export type AthleteCommissionStatus = "pending" | "released" | "held" | "paid" | "canceled";
export type ContractStatus = "active" | "paused" | "ended";

/** O pacote como o atleta vê: sem custo do kit, SKU nem o teto oculto do "ilimitado". */
export interface PublicPackage {
  commissionPct: number | [number, number];
  followerDiscountPct: number;
  registrations: {type: RegistrationType; value: number | null};
  kit: string;
  events: string;
  partnerHalfOff: boolean;
  campaignFee: boolean;
  tournamentOriginBonusCents: number | null;
}

export interface SquadCommissionLine {
  id: string;
  /** Data da inscrição (ISO). */
  at: string | null;
  releasedAt: string | null;
  athlete: string;
  event: string;
  origin: "code" | "link" | "qr";
  grossCents: number;
  amountCents: number;
  status: AthleteCommissionStatus;
  cancelReason: CancelReason | null;
}

export interface SquadAdjustmentLine {
  id: string;
  at: string | null;
  amountCents: number;
  athlete: string;
}

export interface SquadWalletLine {
  id: string;
  at: string | null;
  amountCents: number;
  label: string;
}

export interface SquadRankRow {
  position: number;
  name: string;
  points: number;
  /** Posições ganhas (+) ou perdidas (−) em 7 dias; 0 = parado. */
  delta: number;
  me: boolean;
}

export interface SquadTotals {
  /** Comissão de tudo que foi pago (liberada + paga). */
  earnedCents: number;
  /** Liberada e ainda fora de repasse, já com estornos em aberto. Vai no próximo repasse. */
  availableCents: number;
  /** Liberada mas retida pelo time para revisão neste repasse. */
  heldCents: number;
  /** Aguardando o pagamento do atleta. */
  pendingCents: number;
  pendingCount: number;
  /** Já creditado na carteira do Squad. */
  receivedCents: number;
  lastPayoutAt: string | null;
  /** Valor das inscrições pagas com o código. */
  grossCents: number;
  conversions: number;
  /** Atletas distintos nas conversões (quem paga a dupla traz dois). */
  athletes: number;
  /** Conversões cujo pagamento foi confirmado neste mês (SP). */
  monthConversions: number;
}

export interface SquadFunnel {
  /** Cliques no link/QR ainda não são medidos. */
  clicks: null;
  signups: number;
  registrations: number;
  paid: number;
}

export interface SquadPoints {
  total: number;
  conversions: number;
  events: number | null;
  content: number | null;
  perConversion: number;
  perEvent: number;
  perContent: number;
  levels: Array<{name: string; min: number}>;
}

export type SquadPromotion =
  | {
      kind: "promotion";
      to: SquadTier;
      conversions: number;
      min: number;
      /** Critérios que o time avalia (sem ROI, que é interno). */
      checklist: string[];
      /** Data civil (SP) da avaliação: fim do contrato. */
      evaluation: string | null;
      nextPackage: PublicPackage;
    }
  | {kind: "top"}
  | {kind: "captain"};

export interface AmbassadorView {
  kind: "ambassador";
  name: string;
  contract: {
    tier: SquadTier;
    code: string;
    status: ContractStatus;
    start: string | null;
    end: string | null;
    endedAt: string | null;
    pausedUntil: string | null;
    commissionPct: number;
    followerDiscountPct: number;
    followerDiscountFirstOnly: boolean;
    /** Aditivo de nível aguardando o aceite do atleta no app. */
    pendingTier: SquadTier | null;
  };
  cycle: Cycle;
  package: PublicPackage;
  payout: {nextDate: string; days: number[]; minNetCents: number};
  totals: SquadTotals;
  funnel: SquadFunnel;
  commissions: SquadCommissionLine[];
  adjustments: SquadAdjustmentLine[];
  wallet: SquadWalletLine[];
  points: SquadPoints;
  ranking: {rows: SquadRankRow[]; of: number};
  promotion: SquadPromotion;
}

export type PublicApplicationStatus = "review" | "invited" | "waitlist" | "rejected";

export interface CandidateView {
  kind: "candidate";
  profile: {
    name: string;
    city: string | null;
    state: string | null;
    arenaName: string | null;
    tournaments: number | null;
    elo: string | null;
    photoUrl: string | null;
  } | null;
  application: {status: PublicApplicationStatus; submittedAt: string | null} | null;
  /** Convite em aberto: o aceite (código e contrato) é no app. */
  invite: {tier: SquadTier; expiresAt: string | null} | null;
  cycle: Cycle;
  seatsLeft: number;
  nextCycleStart: string;
  /** Desconto do seguidor do Ambassador nas regras vigentes ("seu amigo ganha até X%"). */
  followerDiscountPct: number;
}

export type SquadAthleteView = AmbassadorView | CandidateView;

// ── utilidades ──────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function cents(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

function dateOf(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  return v && typeof (v as {toDate?: unknown}).toDate === "function" ? (v as {toDate(): Date}).toDate() : null;
}

function iso(v: unknown): string | null {
  return dateOf(v)?.toISOString() ?? null;
}

function isTier(v: unknown): v is SquadTier {
  return typeof v === "string" && (SQUAD_TIERS as readonly string[]).includes(v);
}

const CANCEL_REASONS: readonly CancelReason[] = ["refund", "chargeback", "payment_failed", "manual"];

// ── lógica pura ─────────────────────────────────────────────────────────────

export function publicPackage(pkg: TierPackage): PublicPackage {
  const r = pkg.registrations;
  return {
    commissionPct: Array.isArray(pkg.commissionPct) ?
      [pkg.commissionPct[0], pkg.commissionPct[1]] : pkg.commissionPct,
    followerDiscountPct: pkg.followerDiscountPct,
    registrations: {type: r.type, value: r.type === "freeUnlimited" ? null : r.value},
    kit: pkg.kit,
    events: pkg.events,
    partnerHalfOff: pkg.partnerHalfOff,
    campaignFee: (pkg.campaignFeeCapCents ?? 0) > 0,
    tournamentOriginBonusCents: (pkg.tournamentOriginBonusCents ?? 0) > 0 ? pkg.tournamentOriginBonusCents! : null,
  };
}

export function squadPoints(points: SquadRules["points"], input: {conversions: number; events: number; content: number}): number {
  return input.conversions * points.perConversion + input.events * points.perEvent + input.content * points.perContent;
}

export interface RankInput {
  uid: string;
  name: string;
  points: number;
  pointsWeekAgo: number;
}

function ordered(list: RankInput[], key: "points" | "pointsWeekAgo"): RankInput[] {
  return [...list].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "pt-BR") || a.uid.localeCompare(b.uid));
}

/** Top N por pontos + o atleta no fim, se estiver fora. A seta compara com a posição de 7 dias atrás. */
export function squadRanking(list: RankInput[], meUid: string, top = RANKING_TOP): SquadRankRow[] {
  const before = new Map(ordered(list, "pointsWeekAgo").map((e, i) => [e.uid, i + 1]));
  const rows = ordered(list, "points").map((e, i) => ({
    uid: e.uid,
    row: {
      position: i + 1,
      name: e.name,
      points: e.points,
      delta: (before.get(e.uid) ?? i + 1) - (i + 1),
      me: e.uid === meUid,
    },
  }));
  const out = rows.slice(0, top).map((r) => r.row);
  const mine = rows.find((r) => r.uid === meUid);
  if (mine && mine.row.position > top) out.push(mine.row);
  return out;
}

export interface CommissionInput {
  id: string;
  status: string;
  registeredAt: Date | null;
  releasedAt: Date | null;
  payoutId: string | null;
  holdPayoutDate: string | null;
  amountCents: number;
  grossCents: number;
  convertedAthleteIds: string[];
}

export function athleteStatusOf(c: Pick<CommissionInput, "status" | "payoutId" | "holdPayoutDate">, openPayout: string): AthleteCommissionStatus {
  if (c.status === "canceled") return "canceled";
  if (c.status === "paid") return "paid";
  if (c.status === "released") return c.payoutId === null && c.holdPayoutDate === openPayout ? "held" : "released";
  return "pending";
}

function isConversion(status: string): boolean {
  return status === "released" || status === "paid";
}

export function squadTotals(input: {
  commissions: CommissionInput[];
  openAdjustmentsCents: number;
  wallet: Array<{amountCents: number; at: Date | null}>;
  openPayout: string;
  now: Date;
}): SquadTotals {
  const month = spDateKey(input.now).slice(0, 7);
  const athletes = new Set<string>();
  let earned = 0;
  let available = input.openAdjustmentsCents;
  let held = 0;
  let pending = 0;
  let pendingCount = 0;
  let gross = 0;
  let conversions = 0;
  let monthConversions = 0;
  for (const c of input.commissions) {
    const status = athleteStatusOf(c, input.openPayout);
    if (status === "pending") {
      pending += c.amountCents;
      pendingCount++;
      continue;
    }
    if (!isConversion(c.status)) continue;
    conversions++;
    earned += c.amountCents;
    gross += c.grossCents;
    for (const uid of c.convertedAthleteIds) athletes.add(uid);
    if (c.releasedAt && spDateKey(c.releasedAt).slice(0, 7) === month) monthConversions++;
    if (status === "held") held += c.amountCents;
    else if (status === "released") available += c.amountCents;
  }
  const credits = input.wallet.filter((t) => t.amountCents > 0);
  const last = credits.map((t) => t.at).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    earnedCents: earned,
    availableCents: available,
    heldCents: held,
    pendingCents: pending,
    pendingCount,
    receivedCents: credits.reduce((n, t) => n + t.amountCents, 0),
    lastPayoutAt: last?.toISOString() ?? null,
    grossCents: gross,
    conversions,
    athletes: athletes.size,
    monthConversions,
  };
}

export function squadPromotion(input: {
  tier: SquadTier;
  conversions: number;
  rules: SquadRules;
  evaluation: string | null;
}): SquadPromotion {
  if (input.tier === "cap") return {kind: "captain"};
  const step = input.rules.promotion.find((p) => p.from === input.tier);
  if (!step || !input.rules.tiers[step.to]) return {kind: "top"};
  return {
    kind: "promotion",
    to: step.to,
    conversions: input.conversions,
    min: step.minConversions,
    checklist: [...step.checklist],
    evaluation: input.evaluation,
    nextPackage: publicPackage(input.rules.tiers[step.to]),
  };
}

/** O que a candidatura mostra ao atleta. Nota, motivo interno e nível sugerido nunca saem. */
export function publicApplicationStatus(stage: string, archivedReason: string): PublicApplicationStatus | null {
  if (stage === "new" || stage === "review") return "review";
  if (stage === "invited" || stage === "contract") return "invited";
  if (stage === "archived" && archivedReason === "waitlist") return "waitlist";
  if (stage === "archived" && archivedReason === "rejected") return "rejected";
  // Expirada, cancelada ou aceita: o atleta pode se candidatar de novo.
  return null;
}

// ── leitura ─────────────────────────────────────────────────────────────────

/** Regras de uma versão (o pacote congelado no contrato); sem o retrato, as vigentes. */
async function rulesOfVersion(db: Firestore, version: number | null, current: SquadRules): Promise<SquadRules> {
  if (version === null) return current;
  const d = (await db.collection(SQUAD_CONFIG).doc(SQUAD_RULES_DOC)
    .collection(SQUAD_RULES_VERSIONS).doc(String(version)).get()).data();
  const rules = d?.["rules"];
  return isObj(rules) && isObj(rules["tiers"]) ? (rules as unknown as SquadRules) : current;
}

function commissionInputOf(id: string, d: Raw): CommissionInput {
  const hold = isObj(d["hold"]) ? d["hold"] : null;
  const converted = Array.isArray(d["convertedAthleteIds"]) ?
    (d["convertedAthleteIds"] as unknown[]).filter((v): v is string => typeof v === "string") : [];
  return {
    id,
    status: str(d["status"]),
    registeredAt: dateOf(d["registeredAt"]) ?? dateOf(d["createdAt"]),
    releasedAt: dateOf(d["releasedAt"]),
    payoutId: str(d["payoutId"]) || null,
    holdPayoutDate: hold ? str(hold["payoutDate"]) || null : null,
    amountCents: cents(d["amountCents"]),
    grossCents: cents(d["grossCents"]),
    convertedAthleteIds: converted.length > 0 ? converted : [str(d["payerUid"])].filter(Boolean),
  };
}

function commissionLineOf(c: CommissionInput, d: Raw, openPayout: string): SquadCommissionLine {
  const origin = d["origin"] === "qr" ? "qr" : d["origin"] === "link" ? "link" : "code";
  const reason = CANCEL_REASONS.find((r) => r === d["cancelReason"]) ?? null;
  return {
    id: c.id,
    at: c.registeredAt?.toISOString() ?? null,
    releasedAt: c.releasedAt?.toISOString() ?? null,
    athlete: str(d["convertedLabel"]) || "Atleta",
    event: [str(d["tournamentName"]), str(d["categoryName"])].filter(Boolean).join(" · "),
    origin,
    grossCents: c.grossCents,
    amountCents: c.amountCents,
    status: athleteStatusOf(c, openPayout),
    cancelReason: c.status === "canceled" ? reason : null,
  };
}

async function rankingOf(db: Firestore, rules: SquadRules, meUid: string, now: Date): Promise<{rows: SquadRankRow[]; of: number}> {
  const [active, paused, released, paid] = await Promise.all([
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "active").get(),
    db.collection(SQUAD_AMBASSADORS).where("status", "==", "paused").get(),
    db.collection(SQUAD_COMMISSIONS).where("status", "==", "released").select("ambassadorId", "releasedAt").get(),
    db.collection(SQUAD_COMMISSIONS).where("status", "==", "paid").select("ambassadorId", "releasedAt").get(),
  ]);
  const weekAgo = now.getTime() - WEEK_MS;
  const counts = new Map<string, {now: number; before: number}>();
  for (const s of [...released.docs, ...paid.docs]) {
    const id = str(s.data()["ambassadorId"]);
    const at = dateOf(s.data()["releasedAt"]);
    const c = counts.get(id) ?? {now: 0, before: 0};
    c.now++;
    if (at && at.getTime() < weekAgo) c.before++;
    counts.set(id, c);
  }
  const zero = {conversions: 0, events: 0, content: 0};
  const list: RankInput[] = [...active.docs, ...paused.docs].map((s) => {
    const c = counts.get(s.id) ?? {now: 0, before: 0};
    return {
      uid: s.id,
      name: shortAthleteName(str(s.data()["displayName"]) || "Atleta"),
      points: squadPoints(rules.points, {...zero, conversions: c.now}),
      pointsWeekAgo: squadPoints(rules.points, {...zero, conversions: c.before}),
    };
  });
  return {rows: squadRanking(list, meUid), of: list.length};
}

async function ambassadorView(db: Firestore, uid: string, contract: Raw, now: Date): Promise<AmbassadorView> {
  const [{rules}, cycle, payoutConfig, lastDone] = await Promise.all([
    loadCurrentRules(db), loadCycle(db), loadPayoutConfig(db), lastDonePayout(db),
  ]);
  const tier: SquadTier = isTier(contract["tier"]) ? contract["tier"] : "ath";
  const version = typeof contract["rulesVersion"] === "number" ? (contract["rulesVersion"] as number) : null;
  const frozen = await rulesOfVersion(db, version, rules);
  const pkg = frozen.tiers[tier] ?? rules.tiers[tier] ?? DEFAULT_SQUAD_RULES.tiers[tier];
  const openPayout = openPayoutDate(spDateKey(now), lastDone, payoutConfig.days);

  const [commissionSnap, adjustmentSnap, transactionSnap, signupSnap, ranking] = await Promise.all([
    db.collection(SQUAD_COMMISSIONS).where("ambassadorId", "==", uid).get(),
    db.collection(SQUAD_ADJUSTMENTS).where("ambassadorId", "==", uid).get(),
    db.collection(SQUAD_WALLETS).doc(uid).collection("transactions").get(),
    db.collection(SQUAD_ATTRIBUTIONS).where("ambassadorId", "==", uid).select().get(),
    rankingOf(db, rules, uid, now),
  ]);

  const raw = new Map(commissionSnap.docs.map((s) => [s.id, s.data() as Raw]));
  const inputs = commissionSnap.docs.map((s) => commissionInputOf(s.id, s.data()));
  const byRecent = (a: {at: string | null}, b: {at: string | null}) => (b.at ?? "").localeCompare(a.at ?? "");
  const commissions = inputs.map((c) => commissionLineOf(c, raw.get(c.id)!, openPayout)).sort(byRecent);

  const labelOf = new Map(commissions.map((c) => [c.id, c.athlete]));
  const adjustments: SquadAdjustmentLine[] = adjustmentSnap.docs.map((s) => {
    const d = s.data();
    return {
      id: s.id,
      at: iso(d["createdAt"]),
      amountCents: cents(d["amountCents"]),
      athlete: labelOf.get(str(d["commissionId"])) ?? "Atleta",
    };
  }).sort(byRecent);
  const openAdjustmentsCents = adjustmentSnap.docs
    .filter((s) => !str(s.data()["payoutId"]))
    .reduce((n, s) => n + cents(s.data()["amountCents"]), 0);

  const wallet: SquadWalletLine[] = transactionSnap.docs.map((s) => {
    const d = s.data();
    return {id: s.id, at: iso(d["createdAt"]), amountCents: cents(d["amountCents"]), label: str(d["label"]) || "Repasse"};
  }).sort(byRecent);

  const totals = squadTotals({
    commissions: inputs,
    openAdjustmentsCents,
    wallet: wallet.map((t) => ({amountCents: t.amountCents, at: t.at ? new Date(t.at) : null})),
    openPayout,
    now,
  });

  const status: ContractStatus = contract["status"] === "paused" ? "paused" : contract["status"] === "ended" ? "ended" : "active";
  const end = dateOf(contract["end"]);
  const amendments = Array.isArray(contract["amendments"]) ? (contract["amendments"] as unknown[]).filter(isObj) : [];
  const pending = amendments.find((a) => !a["acceptedAt"] && !a["canceledAt"]);
  const attribution = isObj(rules.attribution) ? rules.attribution : DEFAULT_SQUAD_RULES.attribution;
  const points = isObj(rules.points) ? rules.points : DEFAULT_SQUAD_RULES.points;

  return {
    kind: "ambassador",
    name: str(contract["displayName"]) || "Atleta",
    contract: {
      tier,
      code: str(contract["code"]),
      status,
      start: iso(contract["start"]),
      end: end?.toISOString() ?? null,
      endedAt: iso(contract["endedAt"]),
      pausedUntil: str(contract["pausedUntil"]) || null,
      commissionPct: typeof contract["commissionPct"] === "number" ? (contract["commissionPct"] as number) : 0,
      followerDiscountPct: typeof contract["followerDiscountPct"] === "number" ?
        (contract["followerDiscountPct"] as number) : pkg.followerDiscountPct,
      followerDiscountFirstOnly: attribution.followerDiscountFirstOnly,
      pendingTier: pending && isTier(pending["toTier"]) ? pending["toTier"] : null,
    },
    cycle,
    package: publicPackage(pkg),
    payout: {nextDate: openPayout, days: payoutConfig.days, minNetCents: payoutConfig.minNetCents},
    totals,
    funnel: {clicks: null, signups: signupSnap.size, registrations: inputs.length, paid: totals.conversions},
    commissions: commissions.slice(0, MAX_LINES),
    adjustments: adjustments.slice(0, MAX_LINES),
    wallet: wallet.slice(0, MAX_LINES),
    points: {
      total: squadPoints(points, {conversions: totals.conversions, events: 0, content: 0}),
      conversions: totals.conversions,
      events: null,
      content: null,
      perConversion: points.perConversion,
      perEvent: points.perEvent,
      perContent: points.perContent,
      levels: points.levels.map((l) => ({name: l.name, min: l.min})),
    },
    ranking: status === "ended" ? {rows: ranking.rows.filter((r) => !r.me), of: ranking.of} : ranking,
    promotion: squadPromotion({
      tier,
      conversions: totals.conversions,
      rules,
      evaluation: end ? spDateKey(end) : cycle.end,
    }),
  };
}

async function candidateView(db: Firestore, uid: string): Promise<CandidateView> {
  const [{rules}, cycle, profile, applications, invites] = await Promise.all([
    loadCurrentRules(db),
    loadCycle(db),
    athleteSnapshot(db, uid),
    db.collection(SQUAD_APPLICATIONS).where("athleteId", "==", uid).get(),
    db.collection(SQUAD_INVITES).where("athleteId", "==", uid).get(),
  ]);
  const latest = applications.docs
    .map((s) => s.data())
    .sort((a, b) => (dateOf(b["submittedAt"])?.getTime() ?? 0) - (dateOf(a["submittedAt"])?.getTime() ?? 0))[0];
  const status = latest ? publicApplicationStatus(str(latest["stage"]), str(latest["archivedReason"])) : null;
  const open = invites.docs.map((s) => s.data()).find((d) => d["status"] === "sent" || d["status"] === "opened");
  return {
    kind: "candidate",
    profile: profile ? {
      name: profile.name,
      city: profile.city,
      state: profile.state,
      arenaName: profile.arenaName,
      tournaments: profile.tournaments,
      elo: profile.elo,
      photoUrl: profile.photoUrl,
    } : null,
    application: latest && status ? {status, submittedAt: iso(latest["submittedAt"])} : null,
    invite: open && isTier(open["tier"]) ? {tier: open["tier"], expiresAt: iso(open["expiresAt"])} : null,
    cycle,
    seatsLeft: await seatsLeft(db, cycle),
    nextCycleStart: nextCycleStart(cycle),
    followerDiscountPct: (rules.tiers.amb ?? DEFAULT_SQUAD_RULES.tiers.amb).followerDiscountPct,
  };
}

/** Embaixador (contrato em qualquer estado, inclusive encerrado: o extrato segue dele) ou candidato. */
export async function mySquadViewCore(db: Firestore, uid: string, now: Date): Promise<SquadAthleteView> {
  const contract = (await db.collection(SQUAD_AMBASSADORS).doc(uid).get()).data();
  return contract ? ambassadorView(db, uid, contract, now) : candidateView(db, uid);
}

export const getMySquadView = onCall({region: CLIENT_FACING_REGIONS, invoker: "public"}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return mySquadViewCore(getFirestore(), uid, new Date());
});
