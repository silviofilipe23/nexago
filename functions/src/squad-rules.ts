/**
 * NexaSquad: regras do programa de embaixadores (backoffice › Squad › Níveis & regras).
 *
 *   squadConfig/rules                  — `{rules, version, updatedAt, updatedBy}`: a versão vigente.
 *   squadConfig/rules/versions/{n}     — retrato de cada versão salva (histórico + restaurar).
 *
 * Doc ausente = versão 1 com `DEFAULT_SQUAD_RULES` (o padrão do piloto). O primeiro salvamento
 * grava esse retrato como `versions/1` antes da `versions/2`, para o histórico começar no piloto.
 *
 * Contrato assinado congela a versão vigente (`rulesVersion`): mudar o pacote de um nível vale
 * para contratos novos e renovações. Pesos do Score, pontos e atribuição são internos e valem
 * para todos a partir do salvamento. As rules negam escrita de cliente: esta callable é a porta.
 *
 * Espelhado à mão em `frontend/projects/backoffice/src/app/painel/squad/niveis-regras/data/`
 * (padrão, limites e validação): mudou aqui, muda lá.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

export const SQUAD_CONFIG = "squadConfig";
export const SQUAD_RULES_DOC = "rules";
export const SQUAD_RULES_VERSIONS = "versions";

export const SQUAD_TIERS = ["ath", "amb", "pro", "cap"] as const;
export type SquadTier = (typeof SQUAD_TIERS)[number];

export const TIER_LABELS: Record<SquadTier, string> = {
  ath: "Athlete",
  amb: "Ambassador",
  pro: "Pro Ambassador",
  cap: "Captain",
};

export const REGISTRATION_TYPES = ["discount", "freePerMonth", "freeUnlimited"] as const;
export type RegistrationType = (typeof REGISTRATION_TYPES)[number];

export const SCORE_COMPONENTS = [
  "conversions",
  "revenue",
  "engagement",
  "reach",
  "events",
  "content",
  "sportsRelevance",
  "communityGrowth",
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export const ATHLETE_LEVEL_NAMES = ["Bronze", "Silver", "Gold", "Elite"] as const;

/** As duas promoções do programa, nesta ordem. Captain é paralelo: não entra na escada. */
export const PROMOTION_STEPS: ReadonlyArray<{from: SquadTier; to: SquadTier}> = [
  {from: "ath", to: "amb"},
  {from: "amb", to: "pro"},
];

/** Limites espelhados no backoffice. */
export const MAX_COMMISSION_PCT = 30;
export const MAX_FOLLOWER_DISCOUNT_PCT = 30;
export const MAX_MARGIN_PCT = 60;
export const MAX_FREE_PER_MONTH = 10;
export const MAX_FREE_UNLIMITED_CAP = 31;
export const MAX_KIT_COST_CENTS = 10_000_00;
export const MAX_CAMPAIGN_FEE_CAP_CENTS = 100_000_00;
export const MAX_TOURNAMENT_BONUS_CENTS = 10_000_00;
export const MAX_WINDOW_DAYS = 90;
export const MAX_CONVERSIONS = 1000;
export const MAX_ROI = 100;
export const MAX_CHECKLIST_ITEMS = 8;
export const CHECKLIST_ITEM_MAX = 80;
export const KIT_TEXT_MAX = 80;
export const EVENTS_TEXT_MAX = 120;
export const NOTE_MAX = 140;
export const MAX_LEVEL_POINTS = 1_000_000;
export const MAX_ACTION_POINTS = 1000;

export interface TierPackage {
  /** Número exato ou faixa `[min, max]` (só Pro: o contrato individual fixa o valor). */
  commissionPct: number | [number, number];
  followerDiscountPct: number;
  /** `discount`: % na inscrição · `freePerMonth`: N por mês · `freeUnlimited`: teto mensal oculto. */
  registrations: {type: RegistrationType; value: number};
  kit: string;
  /** SKU da Loja que dá baixa no estoque ao entregar o kit. */
  kitSku: {productId: string; skuId: string} | null;
  kitCostCents: number;
  events: string;
  partnerHalfOff: boolean;
  /** Só Pro. */
  campaignFeeCapCents?: number;
  /** Só Captain. */
  tournamentOriginBonusCents?: number;
}

export interface SquadRules {
  /** Comissão + desconto do seguidor não passam disto, por inscrição. */
  marginMaxPct: number;
  tiers: Record<SquadTier, TierPackage>;
  attribution: {
    requirePaidConfirmation: true;
    cancelOnRefund: true;
    followerDiscountFirstOnly: boolean;
    blockSelfReferral: boolean;
    windowDays: number;
    model: "lastTouch" | "firstTouch";
  };
  promotion: Array<{
    from: SquadTier;
    to: SquadTier;
    minConversions: number;
    minRoi: number | null;
    checklist: string[];
  }>;
  termination: {maxRoi: number; checklist: string[]};
  scoreWeights: Record<ScoreComponent, number>;
  points: {
    levels: Array<{name: string; min: number}>;
    perConversion: number;
    perEvent: number;
    perContent: number;
  };
}

export interface Actor {
  uid: string;
  name: string;
}

/** Padrão v1.0 — o piloto. */
export const DEFAULT_SQUAD_RULES: SquadRules = {
  marginMaxPct: 25,
  tiers: {
    ath: {
      commissionPct: 5,
      followerDiscountPct: 10,
      registrations: {type: "discount", value: 20},
      kit: "Camiseta, boné, garrafa, adesivos",
      kitSku: null,
      kitCostCents: 60_00,
      events: "",
      partnerHalfOff: false,
    },
    amb: {
      commissionPct: 10,
      followerDiscountPct: 10,
      registrations: {type: "freePerMonth", value: 1},
      kit: "Kit completo",
      kitSku: null,
      kitCostCents: 120_00,
      events: "Prioridade",
      partnerHalfOff: false,
    },
    pro: {
      commissionPct: [10, 15],
      followerDiscountPct: 15,
      registrations: {type: "freeUnlimited", value: 4},
      kit: "Kit premium + uniforme",
      kitSku: null,
      kitCostCents: 280_00,
      events: "Prioridade + exclusivos",
      partnerHalfOff: true,
      campaignFeeCapCents: 1000_00,
    },
    cap: {
      commissionPct: 10,
      followerDiscountPct: 10,
      registrations: {type: "freePerMonth", value: 1},
      kit: "Kit completo",
      kitSku: null,
      kitCostCents: 120_00,
      events: "Prioridade",
      partnerHalfOff: false,
      tournamentOriginBonusCents: 50_00,
    },
  },
  attribution: {
    requirePaidConfirmation: true,
    cancelOnRefund: true,
    followerDiscountFirstOnly: true,
    blockSelfReferral: true,
    windowDays: 30,
    model: "lastTouch",
  },
  promotion: [
    {
      from: "ath",
      to: "amb",
      minConversions: 10,
      minRoi: null,
      checklist: ["Bom comportamento", "Participação", "Conteúdo adequado"],
    },
    {
      from: "amb",
      to: "pro",
      minConversions: 30,
      minRoi: 3,
      checklist: ["Influência relevante", "Participação consistente"],
    },
  ],
  termination: {
    maxRoi: 1.5,
    checklist: ["Baixa participação", "Conduta incompatível", "Uso inadequado da marca"],
  },
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
      {name: "Bronze", min: 0},
      {name: "Silver", min: 500},
      {name: "Gold", min: 1000},
      {name: "Elite", min: 2000},
    ],
    perConversion: 40,
    perEvent: 20,
    perContent: 10,
  },
};

// ── validação ────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

function isObj(v: unknown): v is Raw {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

function int(v: unknown, min: number, max: number): v is number {
  return num(v, min, max) && Number.isInteger(v);
}

function text(v: unknown, min: number, max: number): v is string {
  return typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
}

/** Piso da comissão: o valor exato, ou o início da faixa do Pro. */
export function commissionFloor(c: unknown): number {
  if (Array.isArray(c)) return typeof c[0] === "number" ? c[0] : NaN;
  return typeof c === "number" ? c : NaN;
}

function commissionOk(c: unknown, allowRange: boolean): boolean {
  if (Array.isArray(c)) {
    return allowRange && c.length === 2 &&
      num(c[0], 0, MAX_COMMISSION_PCT) && num(c[1], 0, MAX_COMMISSION_PCT) && c[0] < c[1];
  }
  return num(c, 0, MAX_COMMISSION_PCT);
}

function registrationsOk(r: unknown): boolean {
  if (!isObj(r)) return false;
  switch (r["type"]) {
  case "discount": return int(r["value"], 1, 100);
  case "freePerMonth": return int(r["value"], 1, MAX_FREE_PER_MONTH);
  case "freeUnlimited": return int(r["value"], 1, MAX_FREE_UNLIMITED_CAP);
  default: return false;
  }
}

function skuOk(s: unknown): boolean {
  if (s === null) return true;
  return isObj(s) && text(s["productId"], 1, 128) && text(s["skuId"], 1, 128);
}

function checklistOk(list: unknown): boolean {
  return Array.isArray(list) && list.length <= MAX_CHECKLIST_ITEMS &&
    list.every((item) => text(item, 1, CHECKLIST_ITEM_MAX));
}

function tierErrors(tier: SquadTier, t: unknown): string[] {
  const at = (field: string) => `tiers.${tier}.${field}`;
  if (!isObj(t)) return [at("commissionPct")];
  const fields: string[] = [];
  if (!commissionOk(t["commissionPct"], tier === "pro")) fields.push(at("commissionPct"));
  if (!num(t["followerDiscountPct"], 0, MAX_FOLLOWER_DISCOUNT_PCT)) fields.push(at("followerDiscountPct"));
  if (!registrationsOk(t["registrations"])) fields.push(at("registrations"));
  if (!text(t["kit"], 0, KIT_TEXT_MAX)) fields.push(at("kit"));
  if (!skuOk(t["kitSku"])) fields.push(at("kitSku"));
  if (!int(t["kitCostCents"], 0, MAX_KIT_COST_CENTS)) fields.push(at("kitCostCents"));
  if (!text(t["events"], 0, EVENTS_TEXT_MAX)) fields.push(at("events"));
  if (typeof t["partnerHalfOff"] !== "boolean") fields.push(at("partnerHalfOff"));
  if (tier === "pro" && !int(t["campaignFeeCapCents"], 0, MAX_CAMPAIGN_FEE_CAP_CENTS)) {
    fields.push(at("campaignFeeCapCents"));
  }
  if (tier === "cap" && !int(t["tournamentOriginBonusCents"], 0, MAX_TOURNAMENT_BONUS_CENTS)) {
    fields.push(at("tournamentOriginBonusCents"));
  }
  return fields;
}

/** Campos inválidos como caminhos (`tiers.pro.commissionPct`, `scoreWeights`…), ordenados. */
export function squadRulesErrors(rules: unknown): string[] {
  if (!isObj(rules)) return ["rules"];
  const fields: string[] = [];

  const margin = rules["marginMaxPct"];
  const marginOk = num(margin, 1, MAX_MARGIN_PCT);
  if (!marginOk) fields.push("marginMaxPct");

  const tiers = isObj(rules["tiers"]) ? rules["tiers"] : {};
  for (const tier of SQUAD_TIERS) fields.push(...tierErrors(tier, tiers[tier]));

  // Margem por inscrição: o desconto já sai do valor pago e a comissão sai do que sobra.
  for (const tier of SQUAD_TIERS) {
    const t = tiers[tier];
    if (!isObj(t) || !marginOk) continue;
    const sum = commissionFloor(t["commissionPct"]) + Number(t["followerDiscountPct"]);
    if (Number.isFinite(sum) && sum > (margin as number)) fields.push(`tiers.${tier}.margin`);
  }

  // Escada: Athlete ≤ Ambassador ≤ Pro. Captain é paralelo.
  const ladder: SquadTier[] = ["ath", "amb", "pro"];
  for (let i = 1; i < ladder.length; i++) {
    const below = isObj(tiers[ladder[i - 1]]) ? commissionFloor((tiers[ladder[i - 1]] as Raw)["commissionPct"]) : NaN;
    const here = isObj(tiers[ladder[i]]) ? commissionFloor((tiers[ladder[i]] as Raw)["commissionPct"]) : NaN;
    if (Number.isFinite(below) && Number.isFinite(here) && here < below) {
      fields.push(`tiers.${ladder[i]}.ladder`);
    }
  }

  const a = rules["attribution"];
  if (!isObj(a)) {
    fields.push("attribution");
  } else {
    // Travadas: são regra do programa, não escolha da tela.
    if (a["requirePaidConfirmation"] !== true) fields.push("attribution.requirePaidConfirmation");
    if (a["cancelOnRefund"] !== true) fields.push("attribution.cancelOnRefund");
    if (typeof a["followerDiscountFirstOnly"] !== "boolean") fields.push("attribution.followerDiscountFirstOnly");
    if (typeof a["blockSelfReferral"] !== "boolean") fields.push("attribution.blockSelfReferral");
    if (!int(a["windowDays"], 1, MAX_WINDOW_DAYS)) fields.push("attribution.windowDays");
    if (a["model"] !== "lastTouch" && a["model"] !== "firstTouch") fields.push("attribution.model");
  }

  const promotion = rules["promotion"];
  if (!Array.isArray(promotion) || promotion.length !== PROMOTION_STEPS.length) {
    fields.push("promotion");
  } else {
    PROMOTION_STEPS.forEach((step, i) => {
      const p = promotion[i];
      const at = (field: string) => `promotion.${i}.${field}`;
      if (!isObj(p) || p["from"] !== step.from || p["to"] !== step.to) {
        fields.push(at("step"));
        return;
      }
      if (!int(p["minConversions"], 1, MAX_CONVERSIONS)) fields.push(at("minConversions"));
      if (p["minRoi"] !== null && !(num(p["minRoi"], 0, MAX_ROI) && (p["minRoi"] as number) > 0)) {
        fields.push(at("minRoi"));
      }
      if (!checklistOk(p["checklist"])) fields.push(at("checklist"));
    });
  }

  const term = rules["termination"];
  if (!isObj(term)) {
    fields.push("termination");
  } else {
    if (!(num(term["maxRoi"], 0, MAX_ROI) && (term["maxRoi"] as number) > 0)) fields.push("termination.maxRoi");
    if (!checklistOk(term["checklist"])) fields.push("termination.checklist");
  }

  const weights = rules["scoreWeights"];
  if (!isObj(weights)) {
    fields.push("scoreWeights");
  } else {
    let total = 0;
    for (const c of SCORE_COMPONENTS) {
      if (!int(weights[c], 0, 100)) fields.push(`scoreWeights.${c}`);
      else total += weights[c] as number;
    }
    if (total !== 100) fields.push("scoreWeights.total");
  }

  const points = rules["points"];
  if (!isObj(points)) {
    fields.push("points");
  } else {
    const levels = points["levels"];
    if (!Array.isArray(levels) || levels.length !== ATHLETE_LEVEL_NAMES.length) {
      fields.push("points.levels");
    } else {
      levels.forEach((l, i) => {
        if (!isObj(l) || l["name"] !== ATHLETE_LEVEL_NAMES[i] || !int(l["min"], 0, MAX_LEVEL_POINTS)) {
          fields.push(`points.levels.${i}`);
        } else if (i === 0 && l["min"] !== 0) {
          fields.push("points.levels.0");
        } else if (i > 0 && isObj(levels[i - 1]) && (l["min"] as number) <= Number(levels[i - 1]["min"])) {
          fields.push(`points.levels.${i}`);
        }
      });
    }
    for (const k of ["perConversion", "perEvent", "perContent"]) {
      if (!int(points[k], 0, MAX_ACTION_POINTS)) fields.push(`points.${k}`);
    }
  }

  return [...new Set(fields)].sort();
}

/** Regras validadas → como ficam guardadas: só campos conhecidos, em ordem fixa, textos aparados. */
export function normalizeSquadRules(r: SquadRules): SquadRules {
  const tier = (key: SquadTier): TierPackage => {
    const t = r.tiers[key];
    const out: TierPackage = {
      commissionPct: Array.isArray(t.commissionPct) ?
        [t.commissionPct[0], t.commissionPct[1]] : t.commissionPct,
      followerDiscountPct: t.followerDiscountPct,
      registrations: {type: t.registrations.type, value: t.registrations.value},
      kit: t.kit.trim(),
      kitSku: t.kitSku ? {productId: t.kitSku.productId.trim(), skuId: t.kitSku.skuId.trim()} : null,
      kitCostCents: t.kitCostCents,
      events: t.events.trim(),
      partnerHalfOff: t.partnerHalfOff,
    };
    if (key === "pro") out.campaignFeeCapCents = t.campaignFeeCapCents;
    if (key === "cap") out.tournamentOriginBonusCents = t.tournamentOriginBonusCents;
    return out;
  };
  const list = (items: string[]) => items.map((s) => s.trim());
  return {
    marginMaxPct: r.marginMaxPct,
    tiers: {ath: tier("ath"), amb: tier("amb"), pro: tier("pro"), cap: tier("cap")},
    attribution: {
      requirePaidConfirmation: true,
      cancelOnRefund: true,
      followerDiscountFirstOnly: r.attribution.followerDiscountFirstOnly,
      blockSelfReferral: r.attribution.blockSelfReferral,
      windowDays: r.attribution.windowDays,
      model: r.attribution.model,
    },
    promotion: r.promotion.map((p) => ({
      from: p.from,
      to: p.to,
      minConversions: p.minConversions,
      minRoi: p.minRoi,
      checklist: list(p.checklist),
    })),
    termination: {maxRoi: r.termination.maxRoi, checklist: list(r.termination.checklist)},
    scoreWeights: Object.fromEntries(SCORE_COMPONENTS.map((c) => [c, r.scoreWeights[c]])) as
      Record<ScoreComponent, number>,
    points: {
      levels: r.points.levels.map((l) => ({name: l.name, min: l.min})),
      perConversion: r.points.perConversion,
      perEvent: r.points.perEvent,
      perContent: r.points.perContent,
    },
  };
}

/**
 * Regras de atribuição vigentes (valem para todos a partir do salvamento, não ficam no contrato).
 * Doc ausente ou campo inválido cai no padrão do piloto.
 */
export async function loadAttributionRules(db: Firestore): Promise<SquadRules["attribution"]> {
  const snap = await db.collection(SQUAD_CONFIG).doc(SQUAD_RULES_DOC).get();
  const raw = snap.exists ? (snap.data()?.["rules"] as Raw | undefined)?.["attribution"] : undefined;
  const d = DEFAULT_SQUAD_RULES.attribution;
  if (!isObj(raw)) return {...d};
  return {
    requirePaidConfirmation: true,
    cancelOnRefund: true,
    followerDiscountFirstOnly: typeof raw["followerDiscountFirstOnly"] === "boolean" ?
      raw["followerDiscountFirstOnly"] : d.followerDiscountFirstOnly,
    blockSelfReferral: typeof raw["blockSelfReferral"] === "boolean" ? raw["blockSelfReferral"] : d.blockSelfReferral,
    windowDays: int(raw["windowDays"], 1, MAX_WINDOW_DAYS) ? raw["windowDays"] : d.windowDays,
    model: raw["model"] === "firstTouch" ? "firstTouch" : "lastTouch",
  };
}

/**
 * Desconto do seguidor de um nível na versão das regras congelada no contrato. Versão ausente
 * (ou sem o retrato) cai na vigente e, por fim, no padrão do piloto.
 */
export async function tierFollowerDiscountPct(
  db: Firestore,
  tier: SquadTier | null,
  rulesVersion: number | null,
): Promise<number> {
  if (!tier) return 0;
  const pctOf = (data: Raw | undefined): number | null => {
    const tiers = isObj(data?.["rules"]) ? (data!["rules"] as Raw)["tiers"] : undefined;
    const t = isObj(tiers) ? tiers[tier] : undefined;
    const pct = isObj(t) ? t["followerDiscountPct"] : undefined;
    return num(pct, 0, MAX_FOLLOWER_DISCOUNT_PCT) ? pct : null;
  };
  const rulesRef = db.collection(SQUAD_CONFIG).doc(SQUAD_RULES_DOC);
  if (rulesVersion !== null) {
    const fromVersion = pctOf((await rulesRef.collection(SQUAD_RULES_VERSIONS).doc(String(rulesVersion)).get()).data());
    if (fromVersion !== null) return fromVersion;
  }
  const current = pctOf((await rulesRef.get()).data());
  return current ?? DEFAULT_SQUAD_RULES.tiers[tier].followerDiscountPct;
}

// ── diff entre versões ──────────────────────────────────────────────────────

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Resumo do que mudou, na ordem da tela ("Pacote · Athlete", "Pesos do Score"…). */
export function rulesChanges(prev: SquadRules, next: SquadRules): string[] {
  const out: string[] = [];
  for (const t of SQUAD_TIERS) {
    if (!same(prev.tiers[t], next.tiers[t])) out.push(`Pacote · ${TIER_LABELS[t]}`);
  }
  if (prev.marginMaxPct !== next.marginMaxPct) out.push("Margem máxima");
  if (!same(prev.attribution, next.attribution)) out.push("Regras de atribuição");
  if (!same(prev.promotion, next.promotion) || !same(prev.termination, next.termination)) {
    out.push("Promoção e encerramento");
  }
  if (!same(prev.scoreWeights, next.scoreWeights)) out.push("Pesos do Score");
  if (!same(prev.points, next.points)) out.push("Pontos do atleta");
  return out;
}

/** Só o pacote por nível entra no contrato; o resto é interno e vale para todos já. */
export function affectsContracts(prev: SquadRules, next: SquadRules): boolean {
  return SQUAD_TIERS.some((t) => !same(prev.tiers[t], next.tiers[t]));
}

// ── gravação ────────────────────────────────────────────────────────────────

export interface SaveSquadRulesInput {
  rules: SquadRules;
  /** A `version` lida pela tela (doc ausente = 1, o padrão). Outra pessoa salvou = recusa. */
  version: number;
  note?: string | null;
  /** Restaurar = salvar o conteúdo de uma versão antiga como a próxima. */
  restoredFrom?: number | null;
}

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields});
}

function currentVersion(data: Raw | undefined): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 1;
}

export async function saveSquadRulesCore(
  db: Firestore,
  input: SaveSquadRulesInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; rules: SquadRules; changes: string[]}> {
  if (!isObj(input)) throw invalidFields(["rules"]);
  const errors = squadRulesErrors(input.rules);
  if (!int(input.version, 1, Number.MAX_SAFE_INTEGER)) errors.push("version");
  const note = input.note ?? null;
  if (note !== null && !text(note, 0, NOTE_MAX)) errors.push("note");
  const restoredFrom = input.restoredFrom ?? null;
  if (restoredFrom !== null && !int(restoredFrom, 1, Number.MAX_SAFE_INTEGER)) errors.push("restoredFrom");
  if (errors.length > 0) throw invalidFields(errors);

  const rules = normalizeSquadRules(input.rules);
  const ref = db.collection(SQUAD_CONFIG).doc(SQUAD_RULES_DOC);
  const versions = ref.collection(SQUAD_RULES_VERSIONS);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data()! : undefined;
    const version = currentVersion(current);
    if (version !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "As regras foram alteradas por outra pessoa. Recarregue antes de salvar.",
        {updatedBy: current?.["updatedBy"] ?? null, version},
      );
    }
    const prev = current ? (current["rules"] as SquadRules) : DEFAULT_SQUAD_RULES;
    const changes = rulesChanges(prev, rules);
    if (changes.length === 0) {
      throw new HttpsError("invalid-argument", "Nenhuma alteração para salvar.", {fields: []});
    }
    if (restoredFrom !== null && restoredFrom >= version) {
      throw invalidFields(["restoredFrom"]);
    }

    const next = version + 1;
    if (!current) {
      // O piloto vira a v1 do histórico, para "Restaurar" alcançá-lo.
      tx.set(versions.doc("1"), {
        version: 1,
        rules: DEFAULT_SQUAD_RULES,
        createdAt: now,
        createdBy: null,
        note: "Padrão do piloto",
        changes: [],
        affectsContracts: false,
        restoredFrom: null,
      });
    }
    tx.set(versions.doc(String(next)), {
      version: next,
      rules,
      createdAt: now,
      createdBy: actor,
      note: note?.trim() || null,
      changes,
      affectsContracts: affectsContracts(prev, rules),
      restoredFrom,
    });
    tx.set(ref, {rules, version: next, updatedAt: now, updatedBy: actor});
    return {version: next, rules, changes};
  });
}

async function assertSquadAdmin(uid: string): Promise<Actor> {
  let caller;
  try {
    caller = await getAuth().getUser(uid);
  } catch (err: unknown) {
    if ((err as {code?: string})?.code === "auth/user-not-found") {
      throw new HttpsError("unauthenticated", "Sua sessão expirou. Entre novamente para continuar.");
    }
    throw err;
  }
  if (!callerCanAccessBackoffice(caller)) {
    throw new HttpsError(
      "permission-denied",
      "Apenas administradores da plataforma podem editar as regras do Squad.",
    );
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const saveSquadRules = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const actor = await assertSquadAdmin(uid);
  return saveSquadRulesCore(getFirestore(), (request.data ?? {}) as SaveSquadRulesInput, actor, new Date());
});
