/**
 * Hub › Aulas e treinos (app do atleta, canvas "Atleta - Hub Aulas" H2/H4/H5).
 *
 * Diretório público de quem oferece aulas: arenas com turma ativa e centros de treinamento ativos.
 * Professores independentes NÃO passam por aqui — o app já usa `searchProfessors` (vitrine
 * `publicProfessors`, só quem escolheu aparecer) e mistura as duas listas.
 *
 * As coleções de turmas, planos e CTs são da equipe (rules `arenaCanRead`/`ctIsMember`); estas
 * callables devolvem só o que uma vitrine mostra: horário, nível, professor (nome), ocupação
 * (vagas, nunca quem são os alunos), planos e preço, endereço e contato comercial. Nada de aluno,
 * cobrança, regras internas ou dados do provedor.
 */
import * as logger from "firebase-functions/logger";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {ARENA_CLASSES, CLASS_PLANS} from "./arena-class-constants";
import {requireUid, str} from "./arena-class";
import {arenaPoint, distanceMeters} from "./arena-class-athlete-actions";
import {PUBLIC_PROFESSORS} from "./arena-professor-links";
import {TRAINING_CENTERS} from "./training-center-billing-model";
import {CLIENT_FACING_REGIONS} from "./function-regions";

type Data = Record<string, unknown>;

/** Teto de turmas ativas lidas na busca (todas as arenas) — agrupadas em memória. */
const MAX_ACTIVE_CLASSES = 3000;
const MAX_CENTERS = 200;
const MAX_DETAIL_CLASSES = 200;
const MAX_DETAIL_PLANS = 30;
const MAX_DETAIL_PROFESSORS = 30;

// ── formas de saída ──────────────────────────────────────────────────────

export interface DirectorySlot {
  className: string;
  level: string;
  /** ISO 1 = segunda … 7 = domingo. */
  weekdays: number[];
  startTime: string;
  openSpots: number;
}

export interface DirectoryProfessor {
  name: string;
  photoUrl: string | null;
}

export interface DirectoryItem {
  /** `arena` ou `center`. */
  kind: string;
  id: string;
  name: string;
  logoUrl: string | null;
  city: string;
  state: string;
  sports: string[];
  /** Níveis das turmas/programas (códigos da arena, texto livre no CT). */
  levels: string[];
  classCount: number;
  openSpots: number;
  /** Só arena: a do CT não tem coordenada. */
  distanceKm: number | null;
  /** Menor mensalidade/plano ativo, em reais. */
  priceFromReais: number | null;
  professorCount: number;
  professors: DirectoryProfessor[];
  /** Turma com vaga mais adequada (do nível pedido, se houver). */
  highlight: DirectorySlot | null;
  /** Grade compacta (todas as turmas da vitrine) — o app filtra nível/período/vaga. */
  schedule: DirectorySlot[];
}

export interface DirectoryClass {
  classId: string;
  name: string;
  level: string;
  sport: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  professorName: string;
  professorUid: string | null;
  place: string;
  capacity: number;
  taken: number;
  /** Só CT: programa da turma. */
  programId: string | null;
}

export interface DirectoryPlan {
  name: string;
  /** Arena: `monthly | package | single`. CT: `monthly | class_pack`. */
  kind: string;
  priceReais: number;
  classesPerWeek: number | null;
  credits: number | null;
  description: string;
  featured: boolean;
  programIds: string[];
}

export interface DirectoryPlace {
  name: string;
  address: string;
  notes: string;
  distanceKm: number | null;
}

export interface DirectoryProgram {
  programId: string;
  name: string;
  color: string;
  levels: string[];
}

export interface DirectoryDetail {
  kind: string;
  id: string;
  name: string;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  city: string;
  state: string;
  sports: string[];
  /** Telefone/WhatsApp comercial (o mesmo do perfil público). */
  contactPhone: string | null;
  classes: DirectoryClass[];
  plans: DirectoryPlan[];
  programs: DirectoryProgram[];
  places: DirectoryPlace[];
  professors: Array<DirectoryProfessor & {professorUid: string | null; role: string}>;
  /** Arena: aviso de falta que vira crédito (horas). `null` = sem regra pública. */
  makeupNoticeHours: number | null;
}

// ── auxiliares puros ─────────────────────────────────────────────────────

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function weekdayList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((d): d is number => typeof d === "number" && d >= 1 && d <= 7))].sort((a, b) => a - b);
}

function urlOrNull(data: Data, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(data[k]);
    if (v.startsWith("http")) return v;
  }
  return null;
}

function firstStr(data: Data, keys: string[]): string {
  for (const k of keys) {
    const v = str(data[k]);
    if (v) return v;
  }
  return "";
}

function roundKm(meters: number): number {
  return Math.round(meters / 100) / 10;
}

function cleanId(v: unknown, label: string): string {
  const id = str(v);
  if (!id || id.includes("/") || id.length > 128) throw new HttpsError("invalid-argument", `${label} inválido.`);
  return id;
}

function origin(data: Data): {lat: number; lng: number} | null {
  const lat = num(data["lat"]);
  const lng = num(data["lng"]);
  return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat, lng} : null;
}

function addMinutes(hhmm: string, minutes: number): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return "";
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Turma recorrente que aparece na vitrine (avulsas — particular, experimental — não). */
export function isListedArenaClass(c: Data, todayKey: string): boolean {
  if (str(c["status"]) !== "active") return false;
  if (str(c["type"]) !== "turma") return false;
  if (weekdayList(c["weekdays"]).length === 0) return false;
  const end = str(c["endDate"]);
  return !end || end >= todayKey;
}

export function isListedCenterClass(c: Data, todayKey: string): boolean {
  if (str(c["status"]) !== "active") return false;
  if (weekdayList(c["weekdays"]).length === 0) return false;
  const end = str(c["endDate"]);
  return !end || end >= todayKey;
}

export function arenaClassView(id: string, c: Data): DirectoryClass {
  const capacity = Math.max(0, num(c["capacity"]) ?? 0);
  return {
    classId: id,
    name: str(c["name"]) || "Turma",
    level: str(c["level"]),
    sport: str(c["sport"]),
    weekdays: weekdayList(c["weekdays"]),
    startTime: str(c["startTime"]),
    endTime: str(c["endTime"]),
    professorName: str(c["teacherName"]),
    professorUid: str(c["teacherUserId"]) || null,
    place: str(c["courtName"]),
    capacity,
    taken: Math.min(capacity, Math.max(0, num(c["studentCount"]) ?? 0)),
    programId: null,
  };
}

export function centerClassView(id: string, c: Data): DirectoryClass {
  const capacity = Math.max(0, num(c["capacity"]) ?? 0);
  const start = str(c["startTime"]);
  const duration = num(c["durationMin"]) ?? 60;
  return {
    classId: id,
    name: str(c["name"]) || "Turma",
    level: str(c["level"]),
    sport: "",
    weekdays: weekdayList(c["weekdays"]),
    startTime: start,
    endTime: addMinutes(start, duration),
    professorName: str(c["coachName"]),
    professorUid: null,
    place: str(c["locationName"]),
    capacity,
    taken: Math.min(capacity, Math.max(0, num(c["seatsTaken"]) ?? 0)),
    programId: str(c["programId"]) || null,
  };
}

const openSpots = (c: DirectoryClass) => Math.max(0, c.capacity - c.taken);

export function slotOf(c: DirectoryClass): DirectorySlot {
  return {className: c.name, level: c.level, weekdays: c.weekdays, startTime: c.startTime, openSpots: openSpots(c)};
}

/**
 * Turma de destaque do card: com vaga, do nível pedido quando houver; depois a mais cedo na
 * semana a partir de hoje ([todayWeekday] ISO).
 */
export function pickHighlight(classes: DirectoryClass[], level: string, todayWeekday: number): DirectorySlot | null {
  const nextGap = (c: DirectoryClass) => Math.min(...c.weekdays.map((d) => (d - todayWeekday + 7) % 7));
  const ranked = classes
    .filter((c) => openSpots(c) > 0)
    .sort((a, b) =>
      Number(level !== "" && b.level === level) - Number(level !== "" && a.level === level) ||
      nextGap(a) - nextGap(b) ||
      a.startTime.localeCompare(b.startTime));
  const c = ranked[0];
  return c ? slotOf(c) : null;
}

export function arenaPlanView(p: Data): DirectoryPlan | null {
  const price = num(p["priceReais"]);
  if (price == null || price <= 0) return null;
  if (p["active"] === false || str(p["status"]) === "archived") return null;
  return {
    name: str(p["name"]) || "Plano",
    kind: str(p["kind"]) || "monthly",
    priceReais: price,
    classesPerWeek: num(p["classesPerWeek"]),
    credits: num(p["credits"]),
    description: str(p["description"]),
    featured: false,
    programIds: [],
  };
}

export function centerPlanView(p: Data): DirectoryPlan | null {
  if (str(p["status"]) !== "active") return null;
  const cents = num(p["priceCents"]);
  if (cents == null || cents <= 0) return null;
  return {
    name: str(p["name"]) || "Plano",
    kind: str(p["type"]) || "monthly",
    priceReais: cents / 100,
    classesPerWeek: num(p["classesPerWeek"]),
    credits: num(p["credits"]),
    description: "",
    featured: p["featured"] === true,
    programIds: strList(p["programIds"]),
  };
}

/** Plano mais barato que a vitrine mostra como "a partir de" (mensal primeiro). */
export function priceFrom(plans: DirectoryPlan[]): number | null {
  const monthly = plans.filter((p) => p.kind === "monthly");
  const pool = monthly.length ? monthly : plans;
  return pool.length ? Math.min(...pool.map((p) => p.priceReais)) : null;
}

function professorsOf(classes: DirectoryClass[], mirror: Data[]): DirectoryProfessor[] {
  const out = new Map<string, DirectoryProfessor>();
  for (const m of mirror) {
    const name = str(m["name"]);
    if (name) out.set(name.toLowerCase(), {name, photoUrl: urlOrNull(m, ["photoUrl"])});
  }
  for (const c of classes) {
    const key = c.professorName.toLowerCase();
    if (c.professorName && !out.has(key)) out.set(key, {name: c.professorName, photoUrl: null});
  }
  return [...out.values()];
}

function todayParts(now: Date): {key: string; weekday: number} {
  // Calendário de São Paulo (UTC−3, sem horário de verão).
  const local = new Date(now.getTime() - 3 * 3_600_000);
  const key = local.toISOString().slice(0, 10);
  const weekday = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
  return {key, weekday};
}

// ── busca (H2) ───────────────────────────────────────────────────────────

export interface DirectoryQuery {
  lat?: number;
  lng?: number;
  /** Nível de turma da arena (`iniciante`…) para escolher o destaque. */
  level?: string;
}

export async function searchClassDirectoryCore(db: Firestore, q: Data, now = new Date()): Promise<DirectoryItem[]> {
  const from = origin(q);
  const level = str(q["level"]);
  const {key: todayKey, weekday} = todayParts(now);

  const [classSnap, centerSnap] = await Promise.all([
    db.collection(ARENA_CLASSES).where("status", "==", "active").limit(MAX_ACTIVE_CLASSES).get(),
    db.collection(TRAINING_CENTERS).where("status", "==", "active").limit(MAX_CENTERS).get(),
  ]);

  const byArena = new Map<string, DirectoryClass[]>();
  for (const d of classSnap.docs) {
    const c = d.data() as Data;
    const arenaId = str(c["arenaId"]);
    if (!arenaId || !isListedArenaClass(c, todayKey)) continue;
    const list = byArena.get(arenaId) ?? [];
    list.push(arenaClassView(d.id, c));
    byArena.set(arenaId, list);
  }

  const arenaItems = await Promise.all([...byArena.entries()].map(async ([arenaId, classes]) => {
    const arenaRef = db.doc(`arenas/${arenaId}`);
    const [arenaSnap, planSnap, profSnap] = await Promise.all([
      arenaRef.get(),
      arenaRef.collection(CLASS_PLANS).limit(MAX_DETAIL_PLANS).get(),
      arenaRef.collection(PUBLIC_PROFESSORS).limit(MAX_DETAIL_PROFESSORS).get(),
    ]);
    if (!arenaSnap.exists) return null;
    const arena = arenaSnap.data() as Data;
    if (arena["isUnclaimed"] === true) return null;
    const point = arenaPoint(arena);
    const plans = planSnap.docs.map((p) => arenaPlanView(p.data() as Data)).filter((p): p is DirectoryPlan => p != null);
    const professors = professorsOf(classes, profSnap.docs.map((p) => p.data() as Data));
    const item: DirectoryItem = {
      kind: "arena",
      id: arenaId,
      name: str(arena["name"]) || "Arena",
      logoUrl: urlOrNull(arena, ["logoUrl", "logo", "logoImageUrl"]),
      city: str(arena["city"]),
      state: str(arena["state"]),
      sports: [...new Set(classes.map((c) => c.sport).filter(Boolean))],
      levels: [...new Set(classes.map((c) => c.level).filter(Boolean))],
      classCount: classes.length,
      openSpots: classes.reduce((s, c) => s + openSpots(c), 0),
      distanceKm: from && point ? roundKm(distanceMeters(from, point)) : null,
      priceFromReais: priceFrom(plans),
      professorCount: professors.length,
      professors: professors.slice(0, 4),
      highlight: pickHighlight(classes, level, weekday),
      schedule: classes.map(slotOf),
    };
    return item;
  }));

  const centerItems = await Promise.all(centerSnap.docs.map(async (d) => {
    const center = d.data() as Data;
    const [classes, plans, programs] = await Promise.all([
      d.ref.collection("classes").where("status", "==", "active").limit(MAX_DETAIL_CLASSES).get(),
      d.ref.collection("plans").where("status", "==", "active").limit(MAX_DETAIL_PLANS).get(),
      d.ref.collection("programs").limit(MAX_DETAIL_PLANS).get(),
    ]);
    const list = classes.docs
      .filter((c) => isListedCenterClass(c.data() as Data, todayKey))
      .map((c) => centerClassView(c.id, c.data() as Data));
    if (!list.length) return null;
    const planList = plans.docs.map((p) => centerPlanView(p.data() as Data)).filter((p): p is DirectoryPlan => p != null);
    const professors = professorsOf(list, []);
    const programLevels = programs.docs.flatMap((p) => strList((p.data() as Data)["levels"]));
    const item: DirectoryItem = {
      kind: "center",
      id: d.id,
      name: str(center["name"]) || "Centro de treinamento",
      logoUrl: urlOrNull(center, ["logoUrl", "logo"]),
      city: str(center["city"]),
      state: str(center["state"]),
      sports: strList(center["sports"]),
      levels: [...new Set([...programLevels, ...list.map((c) => c.level).filter(Boolean)])],
      classCount: list.length,
      openSpots: list.reduce((s, c) => s + openSpots(c), 0),
      distanceKm: null,
      priceFromReais: priceFrom(planList),
      professorCount: professors.length,
      professors: professors.slice(0, 4),
      highlight: pickHighlight(list, "", weekday),
      schedule: list.map(slotOf),
    };
    return item;
  }));

  return [...arenaItems, ...centerItems].filter((i): i is DirectoryItem => i != null);
}

// ── detalhe da arena (H4) ────────────────────────────────────────────────

export async function getArenaClassDirectoryCore(db: Firestore, arenaId: string, from: {lat: number; lng: number} | null, now = new Date()): Promise<DirectoryDetail> {
  const {key: todayKey} = todayParts(now);
  const arenaRef = db.doc(`arenas/${arenaId}`);
  const [arenaSnap, classSnap, planSnap, profSnap, rulesSnap] = await Promise.all([
    arenaRef.get(),
    db.collection(ARENA_CLASSES).where("arenaId", "==", arenaId).limit(MAX_DETAIL_CLASSES).get(),
    arenaRef.collection(CLASS_PLANS).limit(MAX_DETAIL_PLANS).get(),
    arenaRef.collection(PUBLIC_PROFESSORS).limit(MAX_DETAIL_PROFESSORS).get(),
    arenaRef.collection("classSettings").doc("rules").get(),
  ]);
  if (!arenaSnap.exists) throw new HttpsError("not-found", "Arena não encontrada.");
  const arena = arenaSnap.data() as Data;
  if (arena["isUnclaimed"] === true) throw new HttpsError("not-found", "Arena não encontrada.");

  const classes = classSnap.docs
    .filter((d) => isListedArenaClass(d.data() as Data, todayKey))
    .map((d) => arenaClassView(d.id, d.data() as Data))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const mirror = profSnap.docs.map((p) => p.data() as Data);
  const point = arenaPoint(arena);
  const address = firstStr(arena, ["address", "streetAddress", "street", "fullAddress"]);
  const rules = rulesSnap.exists ? (rulesSnap.data() as Data) : {};

  const professors = new Map<string, DirectoryDetail["professors"][number]>();
  for (const m of mirror) {
    const name = str(m["name"]);
    if (!name) continue;
    professors.set(name.toLowerCase(), {
      name,
      photoUrl: urlOrNull(m, ["photoUrl"]),
      professorUid: str(m["professorUserId"]) || null,
      role: str(m["relationshipType"]) === "INDEPENDENT" ? "Independente" : "",
    });
  }
  for (const c of classes) {
    const key = c.professorName.toLowerCase();
    if (c.professorName && !professors.has(key)) {
      professors.set(key, {name: c.professorName, photoUrl: null, professorUid: null, role: ""});
    }
  }

  return {
    kind: "arena",
    id: arenaId,
    name: str(arena["name"]) || "Arena",
    description: firstStr(arena, ["description", "about", "bio"]),
    logoUrl: urlOrNull(arena, ["logoUrl", "logo", "logoImageUrl"]),
    coverUrl: urlOrNull(arena, ["coverUrl", "coverImageUrl", "imageUrl"]),
    city: str(arena["city"]),
    state: str(arena["state"]),
    sports: [...new Set(classes.map((c) => c.sport).filter(Boolean))],
    contactPhone: firstStr(arena, ["whatsapp", "whatsApp", "whatsappNumber", "phone", "phoneNumber", "telefone"]) || null,
    classes,
    plans: planSnap.docs.map((p) => arenaPlanView(p.data() as Data)).filter((p): p is DirectoryPlan => p != null)
      .sort((a, b) => a.priceReais - b.priceReais),
    programs: [],
    places: [{
      name: str(arena["name"]) || "Arena",
      address,
      notes: "",
      distanceKm: from && point ? roundKm(distanceMeters(from, point)) : null,
    }],
    professors: [...professors.values()],
    makeupNoticeHours: num(rules["makeupNoticeHours"]),
  };
}

// ── detalhe do CT (H5) ───────────────────────────────────────────────────

export async function getCenterClassDirectoryCore(db: Firestore, centerId: string, now = new Date()): Promise<DirectoryDetail> {
  const {key: todayKey} = todayParts(now);
  const ref = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const [snap, classSnap, planSnap, programSnap, locationSnap] = await Promise.all([
    ref.get(),
    ref.collection("classes").where("status", "==", "active").limit(MAX_DETAIL_CLASSES).get(),
    ref.collection("plans").where("status", "==", "active").limit(MAX_DETAIL_PLANS).get(),
    ref.collection("programs").limit(MAX_DETAIL_PLANS).get(),
    ref.collection("locations").limit(MAX_DETAIL_PLANS).get(),
  ]);
  if (!snap.exists || str((snap.data() as Data)["status"]) !== "active") {
    throw new HttpsError("not-found", "Centro de treinamento não encontrado.");
  }
  const center = snap.data() as Data;
  const classes = classSnap.docs
    .filter((d) => isListedCenterClass(d.data() as Data, todayKey))
    .map((d) => centerClassView(d.id, d.data() as Data))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const programs = programSnap.docs
    .map((d) => ({d: d.data() as Data, id: d.id}))
    .sort((a, b) => (num(a.d["order"]) ?? 0) - (num(b.d["order"]) ?? 0))
    .map(({d, id}) => ({programId: id, name: str(d["name"]) || "Programa", color: str(d["color"]), levels: strList(d["levels"])}))
    .filter((p) => classes.some((c) => c.programId === p.programId));
  const places = locationSnap.docs
    .map((d) => d.data() as Data)
    .filter((l) => str(l["status"]) !== "archived" && str(l["type"]) !== "adhoc")
    .sort((a, b) => Number(b["isPrimary"] === true) - Number(a["isPrimary"] === true))
    .map((l) => ({name: str(l["name"]) || "Local", address: str(l["address"]), notes: str(l["notes"]), distanceKm: null}));

  return {
    kind: "center",
    id: centerId,
    name: str(center["name"]) || "Centro de treinamento",
    description: firstStr(center, ["description", "about"]),
    logoUrl: urlOrNull(center, ["logoUrl", "logo"]),
    coverUrl: urlOrNull(center, ["coverUrl"]),
    city: str(center["city"]),
    state: str(center["state"]),
    sports: strList(center["sports"]),
    contactPhone: str(center["contactPhone"]) || null,
    classes,
    plans: planSnap.docs.map((p) => centerPlanView(p.data() as Data)).filter((p): p is DirectoryPlan => p != null)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.priceReais - b.priceReais),
    programs,
    places: places.length ? places : (str(center["address"]) ? [{name: str(center["name"]), address: str(center["address"]), notes: "", distanceKm: null}] : []),
    professors: professorsOf(classes, []).map((p) => ({...p, professorUid: null, role: ""})),
    makeupNoticeHours: null,
  };
}

// ── callables ────────────────────────────────────────────────────────────

export const searchClassDirectory = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  try {
    return {items: await searchClassDirectoryCore(getFirestore(), data)};
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("searchClassDirectory falhou", err);
    throw new HttpsError("internal", "Não foi possível carregar as aulas.");
  }
});

export const getClassDirectoryDetail = onCall({region: CLIENT_FACING_REGIONS}, async (request) => {
  requireUid(request.auth);
  const data = (request.data ?? {}) as Data;
  const kind = str(data["kind"]);
  const id = cleanId(data["id"], kind === "center" ? "Centro" : "Arena");
  try {
    if (kind === "center") return await getCenterClassDirectoryCore(getFirestore(), id);
    if (kind === "arena") return await getArenaClassDirectoryCore(getFirestore(), id, origin(data));
    throw new HttpsError("invalid-argument", "Tipo inválido.");
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("getClassDirectoryDetail falhou", {kind, id, err});
    throw new HttpsError("internal", "Não foi possível carregar as aulas.");
  }
});
