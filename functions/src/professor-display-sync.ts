import type {DocumentReference, Firestore} from "firebase-admin/firestore";

/**
 * Cópias do nome/foto do professor dentro das arenas. São gravadas no vínculo
 * (`arena-professor-links.ts`) e no cadastro do professor de aulas (`arena-class.ts`),
 * e daqui em diante acompanham a troca em `users/{uid}`. Sem isto, a foto antiga
 * (cujo token o Storage invalida) ficava quebrada no portal da arena para sempre.
 *
 * - `arenas/{arenaId}/classTeachers/{id}` → `userId`, `name` (60), `photoUrl`
 * - `arenas/{arenaId}/publicProfessors/{uid}` → `professorUserId`, `name` (80), `photoUrl`
 * - `arenaProfessors/{linkId}` → `professorUserId`, `professorName` (80), `professorPhotoUrl`
 *
 * Nomes que são registro histórico (turma, sessão, repasse) não entram: lá o nome é
 * de quando o fato aconteceu.
 */
export type ProfessorCopyKind = "classTeacher" | "publicProfessor" | "professorLink";

interface CopySpec {
  collectionGroup: string;
  /** Coleção raiz: consulta comum, sem índice de `collectionGroup`. */
  topLevel?: true;
  /** Campo com o uid do professor (consulta por `collectionGroup`). */
  userField: string;
  nameField: string;
  photoField: string;
  nameMax: number;
}

export const PROFESSOR_COPY_SPECS: Record<ProfessorCopyKind, CopySpec> = {
  classTeacher: {
    collectionGroup: "classTeachers",
    userField: "userId",
    nameField: "name",
    photoField: "photoUrl",
    nameMax: 60,
  },
  publicProfessor: {
    collectionGroup: "publicProfessors",
    userField: "professorUserId",
    nameField: "name",
    photoField: "photoUrl",
    nameMax: 80,
  },
  professorLink: {
    collectionGroup: "arenaProfessors",
    topLevel: true,
    userField: "professorUserId",
    nameField: "professorName",
    photoField: "professorPhotoUrl",
    nameMax: 80,
  },
};

export const PROFESSOR_COPY_KINDS = Object.keys(PROFESSOR_COPY_SPECS) as ProfessorCopyKind[];

export interface ProfessorDisplay {
  /** Vazio = o perfil não tem nome; a cópia mantém o que tem. */
  name: string;
  photoUrl: string | null;
}

/** Mesma precedência de `resolveAthleteDisplay` / `professorDisplayFromUser`. */
export function professorDisplayOf(user: Record<string, unknown> | undefined): ProfessorDisplay | null {
  if (!user) return null;
  const name = String(user["fullName"] ?? user["name"] ?? user["nickname"] ?? "").trim();
  const rawPhoto = user["profilePhotoUrl"] ?? user["avatarUrl"] ?? user["photoURL"];
  const photoUrl = typeof rawPhoto === "string" && rawPhoto.trim() ? rawPhoto.trim() : null;
  return {name, photoUrl};
}

/**
 * O que propagar depois de uma escrita em `users/{uid}`: o display novo, ou `null`
 * quando nome e foto não mudaram (a maioria das escritas) — aí nem se consulta nada.
 * Doc criado não tem cópias ainda; doc apagado não tem o que propagar.
 */
export function professorDisplayChange(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): ProfessorDisplay | null {
  const prev = professorDisplayOf(before);
  const next = professorDisplayOf(after);
  if (!prev || !next) return null;
  if (prev.name === next.name && prev.photoUrl === next.photoUrl) return null;
  return next;
}

/** Campos a gravar numa cópia para alinhá-la ao perfil, ou `null` se já está igual. */
export function professorCopyPatch(
  kind: ProfessorCopyKind,
  copy: Record<string, unknown>,
  display: ProfessorDisplay,
): Record<string, unknown> | null {
  const spec = PROFESSOR_COPY_SPECS[kind];
  const patch: Record<string, unknown> = {};
  const name = display.name.slice(0, spec.nameMax);
  if (name && copy[spec.nameField] !== name) patch[spec.nameField] = name;
  const current = typeof copy[spec.photoField] === "string" ? copy[spec.photoField] : null;
  if (current !== display.photoUrl) patch[spec.photoField] = display.photoUrl;
  return Object.keys(patch).length ? patch : null;
}

const BATCH_LIMIT = 400;

/** Alinha todas as cópias do professor `uid` ao display dado. Devolve quantas mudaram. */
export async function syncProfessorCopies(
  db: Firestore,
  uid: string,
  display: ProfessorDisplay,
): Promise<number> {
  const snaps = await Promise.all(
    PROFESSOR_COPY_KINDS.map((kind) => {
      const spec = PROFESSOR_COPY_SPECS[kind];
      const source = spec.topLevel ? db.collection(spec.collectionGroup) : db.collectionGroup(spec.collectionGroup);
      return source.where(spec.userField, "==", uid).get()
        .then((snap) => ({kind, docs: snap.docs}));
    }),
  );
  const writes: Array<{ref: DocumentReference; patch: Record<string, unknown>}> = [];
  for (const {kind, docs} of snaps) {
    for (const doc of docs) {
      const patch = professorCopyPatch(kind, doc.data(), display);
      if (patch) writes.push({ref: doc.ref, patch});
    }
  }
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_LIMIT)) batch.update(w.ref, w.patch);
    await batch.commit();
  }
  return writes.length;
}
