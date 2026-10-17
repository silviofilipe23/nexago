import { InjectionToken } from '@angular/core';
import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';
import { athleteFunctions } from './functions';
import { athleteStorage } from './storage';
import type { ImageTransform, NameProblem } from './store-customize-model';

/** Onde o atleta sobe a arte — o `CUSTOM_UPLOAD_PREFIX` do servidor e a rule do Storage. */
export const CUSTOM_UPLOAD_PREFIX = 'store/custom-uploads';

export interface AddCustomItemInput {
  productId: string;
  skuId: string;
  qty: number;
  name?: { text: string; fontId: string; color: string };
  image?: { path: string; areaId: string; transform: ImageTransform };
}

export interface AddCustomItemResult {
  lineId: string;
  extraPriceCents: number;
  unitPriceCents: number;
  quality: 'good' | 'warn' | null;
}

export interface CustomUpload {
  /** Resolve com o caminho no Storage. */
  done: Promise<string>;
  cancel(): void;
}

/**
 * Personalização no servidor: conferência do nome (lista de bloqueio), upload da arte e a linha
 * personalizada do carrinho. Interface para a tela ser testada sem Firebase.
 */
export interface StoreCustomizeApi {
  checkName(productId: string, text: string): Promise<NameProblem | null>;
  uploadImage(uid: string, file: Blob, format: string, contentType: string, onProgress: (pct: number) => void): CustomUpload;
  addToCart(input: AddCustomItemInput): Promise<AddCustomItemResult>;
}

/** `{uuid}.{png|jpg|svg}` — o nome do arquivo não carrega nada do atleta. */
export function customUploadPath(uid: string, format: string, id: string = crypto.randomUUID()): string {
  return `${CUSTOM_UPLOAD_PREFIX}/${uid}/${id}.${format}`;
}

export function firebaseStoreCustomizeApi(functions: Functions, storage: FirebaseStorage): StoreCustomizeApi {
  const check = httpsCallable<{ productId: string; text: string }, { ok: boolean; problem?: NameProblem }>(
    functions,
    'checkStoreCustomName',
  );
  const add = httpsCallable<AddCustomItemInput, AddCustomItemResult>(functions, 'addStoreCustomItemToCart');
  return {
    checkName: async (productId, text) => {
      const { data } = await check({ productId, text });
      return data.ok ? null : (data.problem ?? 'blocked');
    },
    uploadImage: (uid, file, format, contentType, onProgress) => {
      const path = customUploadPath(uid, format);
      const task = uploadBytesResumable(ref(storage, path), file, { contentType });
      const done = new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => onProgress(snap.totalBytes > 0 ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0),
          reject,
          () => resolve(path),
        );
      });
      return { done, cancel: () => void task.cancel() };
    },
    addToCart: async (input) => (await add(input)).data,
  };
}

/** `null` sem chave de Firebase (specs): a tela mostra o erro ao tentar. */
export const STORE_CUSTOMIZE_API = new InjectionToken<StoreCustomizeApi | null>('STORE_CUSTOMIZE_API', {
  providedIn: 'root',
  factory: () => (environment.firebase.apiKey ? firebaseStoreCustomizeApi(athleteFunctions(), athleteStorage()) : null),
});

/** Mensagem do `HttpsError` (o servidor manda pronta em português) ou a genérica. */
export function customizeErrorMessage(e: unknown, fallback: string): string {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code.replace(/^functions\//, '') : '';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const detail = raw.replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?\s*$/i, '').trim();
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre de novo para continuar.';
    // Callable ainda não deployada: o SDK devolve "not-found" cru, que não diz nada ao atleta.
    case 'not-found':
      return 'A personalização ainda não está disponível. Tente de novo em instantes.';
    case 'invalid-argument':
    case 'failed-precondition':
    case 'permission-denied':
    case 'resource-exhausted':
      return detail || fallback;
    default:
      return fallback;
  }
}
