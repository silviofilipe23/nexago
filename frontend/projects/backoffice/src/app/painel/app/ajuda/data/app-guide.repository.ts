import { Injectable } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { appGuideFromDoc, appGuideFromMirror, type AppGuideCategory } from './app-guide';

export interface AppGuideState {
  categories: AppGuideCategory[];
  version: number;
  /** Sem fonte ainda: os guias vieram do espelho do app (seed) e viram fonte no primeiro save. */
  imported: boolean;
}

/**
 * Leitura direto do Firestore; escrita só pela callable `saveAppGuide` (`functions/src/app-guide.ts`),
 * que grava a fonte e o espelho do app na mesma transação — as rules negam escrita de cliente.
 */
@Injectable({ providedIn: 'root' })
export class AppGuideRepository {
  async load(): Promise<AppGuideState> {
    const db = backofficeDb();
    const source = await getDoc(doc(db, 'appAdminConfig', 'appGuide'));
    if (source.exists()) {
      return { ...appGuideFromDoc(source.data()), imported: false };
    }
    const mirror = await getDoc(doc(db, 'appConfig', 'appGuide'));
    const categories = appGuideFromMirror(mirror.exists() ? mirror.data() : undefined);
    return { categories, version: 0, imported: categories.length > 0 };
  }

  /** Grava a Central inteira. `version` é a lida; devolve a nova, como a callable guardou. */
  async save(categories: AppGuideCategory[], version: number): Promise<AppGuideState> {
    const r = await httpsCallable<{ categories: AppGuideCategory[]; version: number }, unknown>(
      backofficeFunctions(),
      'saveAppGuide',
    )({ categories, version });
    return { ...appGuideFromDoc(r.data as Record<string, unknown>), imported: false };
  }

  /**
   * Sobe a imagem ao Storage (`app/guide/`, leitura pública); `onProgress` recebe 0–100.
   * O arquivo antigo não é apagado: o app pode ainda tê-lo em cache, e imagem órfã custa centavos.
   */
  async uploadImage(file: File, onProgress: (percent: number) => void): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `app/guide/${crypto.randomUUID()}.${ext}`;
    const task = uploadBytesResumable(storageRef(backofficeStorage(), path), file, { contentType: file.type });
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        () => resolve(),
      );
    });
    return getDownloadURL(task.snapshot.ref);
  }
}
