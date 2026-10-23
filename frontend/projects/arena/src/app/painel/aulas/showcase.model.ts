import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { validateArenaImageFile } from '../profile/arena-profile-repository';

/** Vitrine das aulas no app do atleta (Hub › Aulas e treinos). Espelha `class-showcase.ts`:
 *  `arenas/{arenaId}/classSettings/showcase`, gravado só por `saveArenaClassShowcase`. */
export interface ClassTrial {
  enabled: boolean;
  /** 0 = grátis. */
  priceReais: number;
  note: string;
}

export interface ClassShowcase {
  coverUrl: string | null;
  description: string;
  trial: ClassTrial;
}

export const SHOWCASE_DESCRIPTION_MAX = 400;
export const SHOWCASE_TRIAL_NOTE_MAX = 120;
export const SHOWCASE_TRIAL_PRICE_MAX = 2000;

export const EMPTY_SHOWCASE: ClassShowcase = {
  coverUrl: null,
  description: '',
  trial: { enabled: false, priceReais: 0, note: '' },
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function showcaseFromDoc(data: Record<string, unknown> | undefined): ClassShowcase {
  const d = data ?? {};
  const t = (d['trial'] && typeof d['trial'] === 'object' ? d['trial'] : {}) as Record<string, unknown>;
  const cover = str(d['coverUrl']);
  const price = t['priceReais'];
  return {
    coverUrl: cover.startsWith('https://') ? cover : null,
    description: str(d['description']),
    trial: {
      enabled: t['enabled'] === true,
      priceReais: typeof price === 'number' && price >= 0 ? price : 0,
      note: str(t['note']),
    },
  };
}

/** Erro de formulário em português, ou `null` quando dá para salvar. */
export function showcaseError(s: ClassShowcase): string | null {
  if (s.description.trim().length > SHOWCASE_DESCRIPTION_MAX) {
    return `A descrição passa de ${SHOWCASE_DESCRIPTION_MAX} caracteres.`;
  }
  const p = s.trial.priceReais;
  if (!Number.isFinite(p) || p < 0 || p > SHOWCASE_TRIAL_PRICE_MAX) {
    return `Valor da aula experimental entre R$ 0 e R$ ${SHOWCASE_TRIAL_PRICE_MAX}.`;
  }
  if (s.trial.note.trim().length > SHOWCASE_TRIAL_NOTE_MAX) {
    return `A observação da experimental passa de ${SHOWCASE_TRIAL_NOTE_MAX} caracteres.`;
  }
  return null;
}

/** "Experimental grátis" / "Experimental R$ 50" — o mesmo texto do app. */
export function trialLabel(t: ClassTrial): string {
  if (!t.enabled) return 'Sem aula experimental';
  return t.priceReais > 0
    ? `Experimental R$ ${t.priceReais.toFixed(2).replace('.', ',').replace(',00', '')}`
    : 'Experimental grátis';
}

export async function fetchShowcase(db: Firestore, arenaId: string): Promise<ClassShowcase> {
  const snap = await getDoc(doc(db, 'arenas', arenaId, 'classSettings', 'showcase'));
  return showcaseFromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined);
}

export async function saveShowcase(functions: Functions, arenaId: string, s: ClassShowcase): Promise<ClassShowcase> {
  try {
    const res = await httpsCallable<unknown, Record<string, unknown>>(functions, 'saveArenaClassShowcase')({
      arenaId,
      coverUrl: s.coverUrl ?? '',
      description: s.description.trim(),
      trial: { enabled: s.trial.enabled, priceReais: s.trial.priceReais, note: s.trial.note.trim() },
    });
    return showcaseFromDoc(res.data);
  } catch (err) {
    const message = (err as { message?: string })?.message;
    throw new Error(message && !/^[A-Z_-]+$/.test(message) ? message : 'Não foi possível salvar a vitrine.');
  }
}

/** Capa da vitrine em `arenas/{arenaId}/classes-cover` (nome fixo: o novo upload substitui). */
export async function uploadShowcaseCover(storage: FirebaseStorage, arenaId: string, file: File): Promise<string> {
  const error = validateArenaImageFile(file);
  if (error) throw new Error(error);
  const fileRef = ref(storage, `arenas/${arenaId}/classes-cover`);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
}
