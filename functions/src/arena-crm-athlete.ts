/**
 * "Meu contrato" (app do atleta): callable que devolve os contratos de mensalista do
 * próprio atleta e o espelho `arenaCrmMembers/{uid}` que diz ao app se vale chamá-la.
 *
 * O contrato fica fechado nas rules (`arenaCrmContracts` tem a anotação interna da
 * arena): o atleta lê só por aqui, e só os dele (`athleteId == uid`).
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {dayKeyFromEventDate} from "./event-timezone";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {CRM_CONTRACTS, CRM_PAYMENTS, contractView, whatsappDigits} from "./arena-crm-model";
import {contractFromDoc} from "./arena-crm";
import {
  CRM_MEMBERS,
  athleteSeesContract,
  athleteWeekHours,
  buildAthleteContract,
  sortAthleteContracts,
  weekHoursFrom,
  type AthleteArenaInfo,
  type AthleteBookingRecord,
  type AthleteContract,
  type AthletePayment,
} from "./arena-crm-athlete-model";

type Data = Record<string, unknown>;

const ARENA_BOOKINGS = "arenaBookings";

const METHOD_LABEL: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card_machine: "Cartão na maquininha",
  transfer: "Transferência",
  online: "Pix ou cartão online",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function firstStr(d: Data, keys: string[]): string {
  for (const k of keys) {
    const v = str(d[k]);
    if (v) return v;
  }
  return "";
}

function arenaInfo(d: Data | undefined): AthleteArenaInfo {
  const data = d ?? {};
  const logo = firstStr(data, ["logoUrl", "logo", "logoImageUrl", "photoUrl"]);
  const phone = firstStr(data, ["whatsapp", "whatsApp", "whatsappNumber", "phone", "phoneNumber", "telefone"]);
  return {
    name: str(data["name"]) || "Arena",
    logoUrl: /^https?:\/\//.test(logo) ? logo : null,
    whatsapp: whatsappDigits(phone),
  };
}

function paymentFrom(d: Data): AthletePayment {
  const method = str(d["method"]);
  // Online: o nome registrado já diz se foi Pix ou cartão ("Pix online" / "Cartão online").
  const online = method === "online" ? str(d["createdByName"]) : "";
  return {
    paidOn: str(d["paidOn"]),
    amountReais: num(d["amountReais"]),
    installments: Math.max(1, Math.floor(num(d["installments"], 1))),
    method: online || METHOD_LABEL[method] || "Na arena",
  };
}

export interface MyArenaContractsResult {
  today: string;
  contracts: AthleteContract[];
}

export async function getMyArenaContractsCore(db: Firestore, uid: string, now: Date): Promise<MyArenaContractsResult> {
  const today = dayKeyFromEventDate(now);
  const snap = await db.collection(CRM_CONTRACTS).where("athleteId", "==", uid).get();
  const visible = snap.docs
    .map((d) => contractFromDoc(d.id, d.data() as Data))
    .map((record) => ({record, view: contractView(record, today)}))
    .filter(({record, view}) => athleteSeesContract(record, view));
  if (visible.length === 0) return {today, contracts: []};

  const arenaIds = [...new Set(visible.map(({record}) => record.arenaId))];
  const [arenaSnaps, paymentSnaps, bookingSnaps] = await Promise.all([
    db.getAll(...arenaIds.map((id) => db.collection("arenas").doc(id))),
    Promise.all(visible.map(({record}) => db.collection(CRM_CONTRACTS).doc(record.id).collection(CRM_PAYMENTS).get())),
    Promise.all(arenaIds.map((arenaId) => db.collection(ARENA_BOOKINGS)
      .where("arenaId", "==", arenaId)
      .where("athleteId", "==", uid)
      .where("date", ">=", weekHoursFrom(today))
      .get())),
  ]);
  const arenas = new Map(arenaSnaps.map((s) => [s.id, arenaInfo(s.data() as Data | undefined)]));
  const weekHoursByArena = new Map(arenaIds.map((id, i) => [
    id,
    athleteWeekHours(bookingSnaps[i]!.docs.map((d) => d.data() as AthleteBookingRecord), today),
  ]));

  const contracts = visible.map(({record, view}, i) => buildAthleteContract(
    record,
    view,
    arenas.get(record.arenaId) ?? arenaInfo(undefined),
    paymentSnaps[i]!.docs.map((p) => paymentFrom(p.data() as Data)),
    weekHoursByArena.get(record.arenaId) ?? [],
    today,
  ));
  return {today, contracts: sortAthleteContracts(contracts)};
}

/**
 * Recalcula o espelho do atleta. `contractIds` = contratos não cancelados (a callable
 * decide o que mostrar); sem nenhum, o doc some e o app nem chama a callable.
 */
export async function syncArenaCrmMember(db: Firestore, athleteId: string): Promise<void> {
  const snap = await db.collection(CRM_CONTRACTS).where("athleteId", "==", athleteId).get();
  const ids = snap.docs
    .filter((d) => (d.data() as Data)["status"] !== "canceled")
    .map((d) => d.id)
    .sort();
  const ref = db.collection(CRM_MEMBERS).doc(athleteId);
  if (ids.length === 0) {
    await ref.delete();
    return;
  }
  await ref.set({contractIds: ids, updatedAt: FieldValue.serverTimestamp()});
}

export const getMyArenaContracts = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return getMyArenaContractsCore(getFirestore(), uid, new Date());
});

export const onArenaCrmContractWrittenSyncMember = onDocumentWritten(`${CRM_CONTRACTS}/{contractId}`, async (event) => {
  const before = str((event.data?.before?.data() as Data | undefined)?.["athleteId"]);
  const after = str((event.data?.after?.data() as Data | undefined)?.["athleteId"]);
  const athletes = [...new Set([before, after].filter(Boolean))];
  for (const athleteId of athletes) {
    try {
      await syncArenaCrmMember(getFirestore(), athleteId);
    } catch (err) {
      logger.error("arena-crm-athlete: espelho falhou", {contractId: event.params.contractId, athleteId, error: err});
      throw err;
    }
  }
});
