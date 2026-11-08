/**
 * Backoffice › Arenas › Modelo comercial: leitura (com a prévia por arena, das reservas pagas
 * reais do mês) e gravação versionada do modelo de `arena-billing-model.ts`.
 *
 *   arenaBillingConfig/model               — modelo vigente + `version` (doc ausente = exemplo, v1).
 *   arenaBillingConfig/model/versions/{n}  — retrato de cada versão salva (histórico + restaurar).
 *
 * Nada aqui cobra: a prévia só mostra o que o modelo cobraria. A cobrança atual (taxa por reserva
 * 8/6/5% do `planTier` e as assinaturas Starter/Pro/Elite) segue intacta.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {callerCanAccessBackoffice} from "./auth-roles";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {dateOf, isMonthKey, monthKeyOf, shiftMonth} from "./company-finance";
import {
  ARENA_BILLING_CONFIG,
  ARENA_BILLING_MODEL_DOC,
  ARENA_BILLING_VERSIONS,
  DEFAULT_ARENA_BILLING_MODEL,
  NOTE_MAX,
  arenaBillingModelChanges,
  arenaBillingModelErrors,
  arenaBillingModelFromDoc,
  normalizeArenaBillingModel,
  summarizeArenaMonth,
  type ArenaBillingModel,
  type ArenaMonthActivity,
} from "./arena-billing-model";

const BACKOFFICE_CALLABLE = {region: CLIENT_FACING_REGIONS, invoker: "public" as const};

type Raw = Record<string, unknown>;

export interface Actor {
  uid: string;
  name: string;
}

export interface ArenaBillingPreviewRow {
  id: string;
  name: string;
  city: string | null;
  /** Mês de entrada da arena (criação do doc), para os meses grátis da arena nova. */
  startMonth: string | null;
  planTier: string | null;
  planStatus: string | null;
  activity: ArenaMonthActivity;
}

export interface ArenaBillingOverview {
  model: ArenaBillingModel;
  version: number;
  /** `false` = ninguém salvou ainda: o modelo é o exemplo. */
  saved: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  month: string;
  arenas: ArenaBillingPreviewRow[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function currentVersion(data: Raw | undefined): number {
  const v = data?.["version"];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 1;
}

function modelRef(db: Firestore) {
  return db.collection(ARENA_BILLING_CONFIG).doc(ARENA_BILLING_MODEL_DOC);
}

// ── leitura ─────────────────────────────────────────────────────────────────

/**
 * Modelo + atividade do mês das arenas cadastradas (sem `unclaimed`: pré-cadastro não tem
 * reserva paga). Reservas do mês e extrato lidos por arena — são poucas arenas com conta.
 */
export async function loadArenaBillingOverview(db: Firestore, month: string): Promise<ArenaBillingOverview> {
  const nextMonth = shiftMonth(month, 1);
  const [configSnap, arenasSnap] = await Promise.all([
    modelRef(db).get(),
    db.collection("arenas").get(),
  ]);
  const config = configSnap.exists ? configSnap.data() : undefined;
  const by = config?.["updatedBy"] as {name?: unknown} | undefined;

  const registered = arenasSnap.docs.filter((d) => d.data()["unclaimed"] !== true);
  const arenas = await Promise.all(registered.map(async (d): Promise<ArenaBillingPreviewRow> => {
    const data = d.data();
    // Reservas do mês pelo dia do jogo (índice arenaId+date já existe). O extrato vem inteiro:
    // a taxa de hoje de uma reserva do mês pode ter sido creditada antes ou depois dele.
    const [bookings, ledger] = await Promise.all([
      db.collection("arenaBookings")
        .where("arenaId", "==", d.id)
        .where("date", ">=", `${month}-01`)
        .where("date", "<", `${nextMonth}-01`)
        .get(),
      db.collection("arenaWallets").doc(d.id).collection("ledger").get(),
    ]);
    const created = dateOf(data["createdAt"]);
    const city = str(data["city"]);
    const state = str(data["state"]);
    return {
      id: d.id,
      name: str(data["name"]) ?? `Arena ${d.id}`,
      city: city && state ? `${city} · ${state}` : (city ?? state),
      startMonth: created ? monthKeyOf(created) : null,
      planTier: str(data["planTier"]),
      planStatus: str(data["planStatus"]),
      activity: summarizeArenaMonth(
        bookings.docs.map((b) => ({...b.data(), id: b.id})),
        ledger.docs.map((l) => l.data()),
        month,
      ),
    };
  }));
  arenas.sort((a, b) => b.activity.paidBookings - a.activity.paidBookings || a.name.localeCompare(b.name, "pt-BR"));

  const updatedAt = dateOf(config?.["updatedAt"]);
  return {
    model: arenaBillingModelFromDoc(config),
    version: currentVersion(config),
    saved: !!config,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    updatedBy: typeof by?.name === "string" ? by.name : null,
    month,
    arenas,
  };
}

// ── gravação ────────────────────────────────────────────────────────────────

export interface SaveArenaBillingModelInput {
  model: ArenaBillingModel;
  /** A `version` lida pela tela (doc ausente = 1). Outra pessoa salvou = recusa. */
  version: number;
  note?: string | null;
  /** Restaurar = salvar o conteúdo de uma versão antiga como a próxima. */
  restoredFrom?: number | null;
}

function invalidFields(fields: string[]): HttpsError {
  return new HttpsError("invalid-argument", "Dados inválidos.", {fields});
}

function positiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

export async function saveArenaBillingModelCore(
  db: Firestore,
  input: SaveArenaBillingModelInput,
  actor: Actor,
  now: Date,
): Promise<{version: number; model: ArenaBillingModel; changes: string[]}> {
  if (!input || typeof input !== "object") throw invalidFields(["model"]);
  const errors = arenaBillingModelErrors(input.model);
  if (!positiveInt(input.version)) errors.push("version");
  const note = input.note ?? null;
  if (note !== null && (typeof note !== "string" || note.length > NOTE_MAX)) errors.push("note");
  const restoredFrom = input.restoredFrom ?? null;
  if (restoredFrom !== null && !positiveInt(restoredFrom)) errors.push("restoredFrom");
  if (errors.length > 0) throw invalidFields(errors);

  const model = normalizeArenaBillingModel(input.model);
  const ref = modelRef(db);
  const versions = ref.collection(ARENA_BILLING_VERSIONS);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() : undefined;
    const version = currentVersion(current);
    if (version !== input.version) {
      throw new HttpsError(
        "failed-precondition",
        "O modelo foi alterado por outra pessoa. Recarregue antes de salvar.",
        {version},
      );
    }
    if (restoredFrom !== null && restoredFrom >= version) throw invalidFields(["restoredFrom"]);
    const prev = arenaBillingModelFromDoc(current);
    const changes = current ? arenaBillingModelChanges(prev, model) : ["Primeira definição do modelo"];
    if (current && changes.length === 0) {
      throw new HttpsError("invalid-argument", "Nenhuma alteração para salvar.", {fields: []});
    }

    const next = version + 1;
    if (!current) {
      // O exemplo vira a v1 do histórico, para "Restaurar" alcançá-lo.
      tx.set(versions.doc("1"), {
        version: 1,
        model: DEFAULT_ARENA_BILLING_MODEL,
        createdAt: now,
        createdBy: null,
        note: "Valores de exemplo",
        changes: [],
        restoredFrom: null,
      });
    }
    tx.set(versions.doc(String(next)), {
      version: next,
      model,
      createdAt: now,
      createdBy: actor,
      note: note?.trim() || null,
      changes,
      restoredFrom,
    });
    tx.set(ref, {model, version: next, updatedAt: now, updatedBy: actor});
    return {version: next, model, changes};
  });
}

// ── callables ───────────────────────────────────────────────────────────────

async function assertAdmin(uid: string | undefined): Promise<Actor> {
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
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
      "Apenas administradores da plataforma podem acessar o modelo comercial das arenas.",
    );
  }
  return {uid, name: caller.displayName ?? caller.email ?? uid};
}

export const getArenaBillingOverview = onCall(BACKOFFICE_CALLABLE, async (request) => {
  await assertAdmin(request.auth?.uid);
  const requested = (request.data as {month?: unknown} | undefined)?.month;
  const month = isMonthKey(requested) ? requested : monthKeyOf(new Date());
  return loadArenaBillingOverview(getFirestore(), month);
});

export const saveArenaBillingModel = onCall(BACKOFFICE_CALLABLE, async (request) => {
  const actor = await assertAdmin(request.auth?.uid);
  return saveArenaBillingModelCore(
    getFirestore(),
    (request.data ?? {}) as SaveArenaBillingModelInput,
    actor,
    new Date(),
  );
});
