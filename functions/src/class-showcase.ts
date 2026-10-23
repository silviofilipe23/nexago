/**
 * Vitrine de aulas no app do atleta (Hub › Aulas e treinos): capa, descrição e aula experimental.
 *
 * Arena: `arenas/{arenaId}/classSettings/showcase`, gravado por `saveArenaClassShowcase` (mesma
 * permissão das regras de aula). CT: campo `showcase` no doc do centro, gravado pelo portal do
 * centro (rules: só gestor). Mesmo formato nos dois; `class-directory.ts` lê e publica.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {CLASS_SETTINGS} from "./arena-class-constants";
import {requireClassManager, requireUid, str} from "./arena-class";
import {CLIENT_FACING_REGIONS} from "./function-regions";

export const CLASS_SHOWCASE_DOC = "showcase";
export const SHOWCASE_DESCRIPTION_MAX = 400;
export const SHOWCASE_TRIAL_NOTE_MAX = 120;
export const SHOWCASE_TRIAL_PRICE_MAX = 2000;
const URL_MAX = 1000;

export interface ClassTrial {
  enabled: boolean;
  /** 0 = grátis. */
  priceReais: number;
  /** Ex.: "1 aula · abatida na 1ª mensalidade". */
  note: string;
}

export interface ClassShowcase {
  coverUrl: string | null;
  description: string;
  trial: ClassTrial;
}

export const EMPTY_SHOWCASE: ClassShowcase = {
  coverUrl: null,
  description: "",
  trial: {enabled: false, priceReais: 0, note: ""},
};

function httpsUrl(v: unknown): string | null {
  const s = str(v);
  return s.startsWith("https://") && s.length <= URL_MAX ? s : null;
}

function price(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= SHOWCASE_TRIAL_PRICE_MAX ?
    Math.round(v * 100) / 100 :
    null;
}

/** Leitura tolerante (doc antigo, campo faltando ou fora da faixa vira o padrão). */
export function parseShowcase(raw: unknown): ClassShowcase {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (d["trial"] && typeof d["trial"] === "object" ? d["trial"] : {}) as Record<string, unknown>;
  return {
    coverUrl: httpsUrl(d["coverUrl"]),
    description: str(d["description"]).slice(0, SHOWCASE_DESCRIPTION_MAX),
    trial: {
      enabled: t["enabled"] === true,
      priceReais: price(t["priceReais"]) ?? 0,
      note: str(t["note"]).slice(0, SHOWCASE_TRIAL_NOTE_MAX),
    },
  };
}

/** Validação da gravação: fora da faixa é erro, não silêncio. */
export function validateShowcaseInput(raw: Record<string, unknown>): ClassShowcase {
  const cover = raw["coverUrl"];
  const coverUrl = cover == null || cover === "" ? null : httpsUrl(cover);
  if (cover != null && cover !== "" && coverUrl == null) {
    throw new HttpsError("invalid-argument", "Capa inválida.");
  }
  const description = str(raw["description"]);
  if (description.length > SHOWCASE_DESCRIPTION_MAX) {
    throw new HttpsError("invalid-argument", `A descrição passa de ${SHOWCASE_DESCRIPTION_MAX} caracteres.`);
  }
  const t = (raw["trial"] && typeof raw["trial"] === "object" ? raw["trial"] : {}) as Record<string, unknown>;
  const p = t["priceReais"] == null ? 0 : price(t["priceReais"]);
  if (p == null) {
    throw new HttpsError("invalid-argument", `Valor da aula experimental entre R$ 0 e R$ ${SHOWCASE_TRIAL_PRICE_MAX}.`);
  }
  const note = str(t["note"]);
  if (note.length > SHOWCASE_TRIAL_NOTE_MAX) {
    throw new HttpsError("invalid-argument", `A observação da experimental passa de ${SHOWCASE_TRIAL_NOTE_MAX} caracteres.`);
  }
  return {coverUrl, description, trial: {enabled: t["enabled"] === true, priceReais: p, note}};
}

export function arenaShowcaseRef(db: Firestore, arenaId: string) {
  return db.doc(`arenas/${arenaId}/${CLASS_SETTINGS}/${CLASS_SHOWCASE_DOC}`);
}

export async function saveArenaClassShowcaseCore(
  db: Firestore,
  uid: string,
  input: Record<string, unknown>,
): Promise<ClassShowcase> {
  const arenaId = str(input["arenaId"]);
  if (!arenaId || arenaId.includes("/")) throw new HttpsError("invalid-argument", "Arena é obrigatória.");
  await requireClassManager(db, arenaId, uid);
  const showcase = validateShowcaseInput(input);
  await arenaShowcaseRef(db, arenaId).set({...showcase, updatedAt: FieldValue.serverTimestamp(), updatedByUid: uid});
  return showcase;
}

export const saveArenaClassShowcase = onCall({region: CLIENT_FACING_REGIONS}, async (request) =>
  saveArenaClassShowcaseCore(getFirestore(), requireUid(request.auth), (request.data ?? {}) as Record<string, unknown>));
