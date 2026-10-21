/**
 * T11 · Perfil do professor e T13 · Encontrar professor (app do atleta).
 *
 * Régua de visibilidade: professor só aparece para quem NÃO é aluno dele se a própria escolha dele
 * o colocou na vitrine — o espelho `arenas/{arenaId}/publicProfessors/{uid}` (vínculo ACTIVE com
 * "Aparecer no perfil da arena"). Preço de particular só sai com a disponibilidade publicada e
 * "Mostrar no perfil público" ligado. Aluno vê o perfil do próprio professor sempre.
 *
 * Quem não é aluno não manda mensagem nem agenda (servidor barra): o caminho é "Pedir contato",
 * que avisa o professor com o perfil do atleta (1 pedido por par a cada [CONTACT_REQUEST_COOLDOWN_DAYS]
 * dias); o professor decide se convida para a carteira.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, Timestamp, type Firestore} from "firebase-admin/firestore";
import {PUBLIC_PROFESSORS} from "./arena-professor-links";
import {arenaPoint, distanceMeters} from "./arena-class-athlete-actions";
import {PROFESSOR_AVAILABILITY, storedAvailability} from "./professor-availability";
import {LESSON_PLAN_VIEWS} from "./professor-lesson-plans";
import {isStudentOfProfessor} from "./professor-messages";
import {PROFESSORS, PROFESSOR_PLANS} from "./professor-wallet-model";
import {CLIENT_FACING_REGIONS} from "./function-regions";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";

export const PROFESSOR_CONTACT_REQUESTS = "professorContactRequests";
export const PROFESSOR_CONTACT_PUSH_TYPE = "professor_contact_request";
export const CONTACT_REQUEST_COOLDOWN_DAYS = 7;
/** Vitrine inteira (todas as arenas) — a busca filtra em memória. */
const MAX_LISTINGS = 500;
const MAX_RESULTS = 30;
const MAX_RATED_VIEWS = 1000;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toDate(v: unknown): Date | null {
  return v != null && typeof (v as {toDate?: unknown}).toDate === "function" ? (v as {toDate(): Date}).toDate() : null;
}

function cleanUid(v: unknown): string {
  const id = str(v);
  if (!id || id.includes("/") || id.length > 128) throw new HttpsError("invalid-argument", "Professor inválido.");
  return id;
}

/** Normaliza para busca: minúsculas e sem acento. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface PublicProfessorArena {
  arenaId: string;
  arenaName: string;
  city: string;
  logoUrl: string | null;
  /** `ARENA_STAFF` (turmas cobradas pela arena) ou `INDEPENDENT` (cobra direto). */
  relationshipType: string;
  /** Distância até o atleta, com a localização enviada. */
  distanceKm: number | null;
}

export interface PublicProfessorCard {
  professorUid: string;
  name: string;
  photoUrl: string | null;
  modalities: string[];
  arenas: PublicProfessorArena[];
  /** Média das estrelas dos feedbacks; `null` sem avaliação. */
  rating: number | null;
  ratingCount: number;
  /** Menor preço de plano ativo (só com particular publicada no perfil). */
  priceFromReais: number | null;
  /** Abriu horários de particular e quer aparecer no perfil. */
  acceptsPrivate: boolean;
  nearestKm: number | null;
}

export interface PublicProfessorPlan {
  name: string;
  kind: string;
  priceReais: number;
  classes: number | null;
}

export interface ProfessorPublicProfile extends PublicProfessorCard {
  /** Vínculo mais antigo na vitrine, `YYYY-MM-DD`. */
  since: string | null;
  plans: PublicProfessorPlan[];
  /** O atleta já é aluno (pode mandar mensagem e agendar). */
  isMyProfessor: boolean;
  /** Já pediu contato nos últimos dias. */
  contactRequested: boolean;
}

interface Listing {
  arenaId: string;
  professorUid: string;
  name: string;
  photoUrl: string | null;
  modalities: string[];
  relationshipType: string;
  since: Date | null;
}

function listingOf(data: Record<string, unknown>, arenaIdFromPath: string): Listing | null {
  const professorUid = str(data["professorUserId"]);
  if (!professorUid) return null;
  return {
    arenaId: str(data["arenaId"]) || arenaIdFromPath,
    professorUid,
    name: str(data["name"]) || "Professor",
    photoUrl: str(data["photoUrl"]) || null,
    modalities: Array.isArray(data["modalities"]) ? (data["modalities"] as unknown[]).map(str).filter(Boolean) : [],
    relationshipType: str(data["relationshipType"]) || "ARENA_STAFF",
    since: toDate(data["since"]),
  };
}

async function loadListings(db: Firestore, professorUid?: string): Promise<Listing[]> {
  let q: FirebaseFirestore.Query = db.collectionGroup(PUBLIC_PROFESSORS);
  if (professorUid) q = q.where("professorUserId", "==", professorUid);
  const snap = await q.limit(MAX_LISTINGS).get();
  return snap.docs
    .filter((d) => d.ref.path.split("/")[0] === "arenas")
    .map((d) => listingOf(d.data() as Record<string, unknown>, d.ref.path.split("/")[1]))
    .filter((l): l is Listing => l != null);
}

async function loadArenas(db: Firestore, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const snaps = await db.getAll(...unique.map((id) => db.collection("arenas").doc(id)));
  return new Map(snaps.map((s) => [s.id, (s.data() ?? {}) as Record<string, unknown>]));
}

/** Estrelas dos feedbacks de aula (`lessonPlanViews.rating.stars`). */
export async function loadProfessorRating(db: Firestore, professorUid: string): Promise<{rating: number | null; count: number}> {
  const snap = await db.collection(LESSON_PLAN_VIEWS).where("professorUid", "==", professorUid).limit(MAX_RATED_VIEWS).get();
  const stars = snap.docs
    .map((d) => Number(((d.data()["rating"] ?? {}) as Record<string, unknown>)["stars"]))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  if (stars.length === 0) return {rating: null, count: 0};
  return {rating: Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10, count: stars.length};
}

/** Particular na vitrine: disponibilidade publicada e "Mostrar no perfil público". */
async function loadPrivateOffer(db: Firestore, professorUid: string): Promise<{acceptsPrivate: boolean; plans: PublicProfessorPlan[]}> {
  const availability = storedAvailability((await db.collection(PROFESSOR_AVAILABILITY).doc(professorUid).get()).data());
  if (!availability || !availability.published || !availability.showOnProfile) return {acceptsPrivate: false, plans: []};
  const snap = await db.collection(PROFESSORS).doc(professorUid).collection(PROFESSOR_PLANS).where("active", "==", true).get();
  const plans = snap.docs.map((d) => {
    const p = d.data() as Record<string, unknown>;
    return {
      name: str(p["name"]) || "Plano",
      kind: str(p["kind"]) || "single",
      priceReais: Number(p["priceReais"] ?? 0),
      classes: typeof p["classes"] === "number" ? p["classes"] as number : null,
    };
  }).filter((p) => p.priceReais > 0).sort((a, b) => a.priceReais - b.priceReais);
  return {acceptsPrivate: true, plans};
}

function cardFrom(
  professorUid: string,
  listings: Listing[],
  arenas: Map<string, Record<string, unknown>>,
  origin: {lat: number; lng: number} | null,
): PublicProfessorCard {
  const first = listings[0];
  const modalities: string[] = [];
  for (const l of listings) for (const m of l.modalities) if (!modalities.includes(m)) modalities.push(m);
  const arenaList = listings.map((l) => {
    const a = arenas.get(l.arenaId) ?? {};
    const point = arenaPoint(a);
    return {
      arenaId: l.arenaId,
      arenaName: str(a["name"]) || "Arena",
      city: str(a["city"]),
      logoUrl: str(a["logoUrl"]) || str(a["logo"]) || null,
      relationshipType: l.relationshipType,
      distanceKm: origin && point ? Math.round(distanceMeters(origin, point) / 100) / 10 : null,
    };
  }).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9) || a.arenaName.localeCompare(b.arenaName, "pt-BR"));
  const distances = arenaList.map((a) => a.distanceKm).filter((d): d is number => d != null);
  return {
    professorUid,
    name: first?.name ?? "Professor",
    photoUrl: listings.find((l) => l.photoUrl)?.photoUrl ?? null,
    modalities,
    arenas: arenaList,
    rating: null,
    ratingCount: 0,
    priceFromReais: null,
    acceptsPrivate: false,
    nearestKm: distances.length ? Math.min(...distances) : null,
  };
}

function originOf(raw: Record<string, unknown>): {lat: number; lng: number} | null {
  const lat = Number(raw["lat"]);
  const lng = Number(raw["lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (raw["lat"] == null || raw["lng"] == null) return null;
  return {lat, lng};
}

/** T13 · professores da vitrine, filtrados por modalidade e texto, do mais perto ao mais longe. */
export async function searchProfessorsCore(db: Firestore, uid: string, raw: Record<string, unknown>): Promise<{items: PublicProfessorCard[]; modalities: string[]}> {
  const sport = foldText(str(raw["sport"]));
  const query = foldText(str(raw["query"]));
  const origin = originOf(raw);
  const listings = (await loadListings(db)).filter((l) => l.professorUid !== uid);
  const byProfessor = new Map<string, Listing[]>();
  for (const l of listings) byProfessor.set(l.professorUid, [...(byProfessor.get(l.professorUid) ?? []), l]);
  const arenas = await loadArenas(db, listings.map((l) => l.arenaId));

  const allModalities: string[] = [];
  for (const l of listings) for (const m of l.modalities) if (!allModalities.includes(m)) allModalities.push(m);

  const cards = [...byProfessor.entries()]
    .map(([id, ls]) => cardFrom(id, ls, arenas, origin))
    .filter((c) => !sport || c.modalities.some((m) => foldText(m) === sport))
    .filter((c) => !query ||
      foldText(c.name).includes(query) ||
      c.arenas.some((a) => foldText(a.arenaName).includes(query) || foldText(a.city).includes(query)) ||
      c.modalities.some((m) => foldText(m).includes(query)))
    .sort((a, b) => (a.nearestKm ?? 1e9) - (b.nearestKm ?? 1e9) || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, MAX_RESULTS);

  await Promise.all(cards.map(async (c) => {
    const [rating, offer] = await Promise.all([
      loadProfessorRating(db, c.professorUid).catch(() => ({rating: null, count: 0})),
      loadPrivateOffer(db, c.professorUid).catch(() => ({acceptsPrivate: false, plans: []})),
    ]);
    c.rating = rating.rating;
    c.ratingCount = rating.count;
    c.acceptsPrivate = offer.acceptsPrivate;
    c.priceFromReais = offer.plans[0]?.priceReais ?? null;
  }));
  return {items: cards, modalities: allModalities.sort((a, b) => a.localeCompare(b, "pt-BR"))};
}

function contactRequestRef(db: Firestore, professorUid: string, athleteUid: string) {
  return db.collection(PROFESSOR_CONTACT_REQUESTS).doc(`${professorUid}_${athleteUid}`);
}

function recentRequest(data: Record<string, unknown> | undefined, now: Date): boolean {
  const at = toDate(data?.["createdAt"]);
  return at != null && now.getTime() - at.getTime() < CONTACT_REQUEST_COOLDOWN_DAYS * 86_400_000;
}

/** T11 · perfil do professor visto pelo atleta. */
export async function getProfessorPublicProfileCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, now: Date,
): Promise<ProfessorPublicProfile> {
  const professorUid = cleanUid(raw["professorUid"]);
  const [listings, isMyProfessor] = await Promise.all([
    loadListings(db, professorUid),
    isStudentOfProfessor(db, professorUid, uid, now),
  ]);
  if (listings.length === 0 && !isMyProfessor) throw new HttpsError("not-found", "Professor não encontrado.");

  const arenas = await loadArenas(db, listings.map((l) => l.arenaId));
  const card = cardFrom(professorUid, listings, arenas, originOf(raw));
  if (listings.length === 0) {
    // Aluno de professor fora da vitrine: nome e foto do cadastro.
    const user = (await db.collection("users").doc(professorUid).get()).data() ?? {};
    card.name = str(user["fullName"]) || str(user["nickname"]) || "Professor";
    card.photoUrl = str(user["photoUrl"]) || str(user["avatarUrl"]) || null;
  }
  const [rating, offer, request] = await Promise.all([
    loadProfessorRating(db, professorUid).catch(() => ({rating: null, count: 0})),
    loadPrivateOffer(db, professorUid).catch(() => ({acceptsPrivate: false, plans: [] as PublicProfessorPlan[]})),
    contactRequestRef(db, professorUid, uid).get(),
  ]);
  const sinceDates = listings.map((l) => l.since).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime());
  return {
    ...card,
    rating: rating.rating,
    ratingCount: rating.count,
    acceptsPrivate: offer.acceptsPrivate,
    priceFromReais: offer.plans[0]?.priceReais ?? null,
    plans: offer.plans,
    since: sinceDates.length ? sinceDates[0].toISOString().slice(0, 10) : null,
    isMyProfessor,
    contactRequested: recentRequest(request.data(), now),
  };
}

export interface ContactDeps {
  now: () => Date;
  notify: (input: Parameters<typeof deliverNotificationToUser>[0]) => Promise<unknown>;
}

const defaultContactDeps: ContactDeps = {now: () => new Date(), notify: deliverNotificationToUser};

/** "Pedir contato": avisa o professor da vitrine (1 por par a cada 7 dias). */
export async function requestProfessorContactCore(
  db: Firestore, uid: string, raw: Record<string, unknown>, deps: ContactDeps = defaultContactDeps,
): Promise<{ok: true}> {
  const professorUid = cleanUid(raw["professorUid"]);
  if (professorUid === uid) throw new HttpsError("invalid-argument", "Você não pode pedir contato a você mesmo.");
  const message = str(raw["message"]).slice(0, 300);
  const now = deps.now();
  const listings = await loadListings(db, professorUid);
  if (listings.length === 0) throw new HttpsError("not-found", "Professor não encontrado.");
  if (await isStudentOfProfessor(db, professorUid, uid, now)) {
    throw new HttpsError("failed-precondition", "Você já é aluno deste professor: mande uma mensagem.");
  }
  const user = (await db.collection("users").doc(uid).get()).data() ?? {};
  const athleteName = str(user["fullName"]) || str(user["nickname"]) || "Um atleta";
  const ref = contactRequestRef(db, professorUid, uid);
  await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data();
    if (recentRequest(current, now)) {
      throw new HttpsError("already-exists", "Você já pediu contato. O professor recebeu seu perfil.");
    }
    tx.set(ref, {
      professorUid,
      athleteId: uid,
      athleteName,
      message: message || null,
      createdAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  try {
    await deps.notify({
      userId: professorUid,
      title: `${athleteName} quer treinar com você`,
      body: message || "Toque para ver o perfil e convidar para a sua carteira.",
      type: PROFESSOR_CONTACT_PUSH_TYPE,
      data: {athleteId: uid, url: `/athlete/profile?userId=${encodeURIComponent(uid)}`},
    });
  } catch (e) {
    logger.warn(`requestProfessorContact ${professorUid}/${uid}: push falhou`, e);
  }
  return {ok: true};
}

function requireUid(auth: {uid?: string} | undefined): string {
  const uid = auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  return uid;
}

const dataOf = (r: {data?: unknown}) => (r.data ?? {}) as Record<string, unknown>;

export const searchProfessors = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  searchProfessorsCore(getFirestore(), requireUid(r.auth), dataOf(r)));

export const getProfessorPublicProfile = onCall({region: CLIENT_FACING_REGIONS}, async (r) =>
  getProfessorPublicProfileCore(getFirestore(), requireUid(r.auth), dataOf(r), new Date()));

export const requestProfessorContact = onCall({
  region: CLIENT_FACING_REGIONS, secrets: [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT],
}, async (r) => requestProfessorContactCore(getFirestore(), requireUid(r.auth), dataOf(r)));
