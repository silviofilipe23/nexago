import { Injectable } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { appNewsFromDoc, appNewsFromMirror, type AppNewsRelease } from './app-news';

export interface AppNewsState {
  releases: AppNewsRelease[];
  version: number;
  /** Sem fonte ainda: as versões vieram do espelho do app (seed) e viram fonte no primeiro save. */
  imported: boolean;
}

/**
 * Leitura direto do Firestore; escrita só pela callable `saveAppNews` (`functions/src/app-news.ts`),
 * que grava a fonte e o espelho do app na mesma transação — as rules negam escrita de cliente.
 */
@Injectable({ providedIn: 'root' })
export class AppNewsRepository {
  async load(): Promise<AppNewsState> {
    const db = backofficeDb();
    const source = await getDoc(doc(db, 'appAdminConfig', 'appNews'));
    if (source.exists()) {
      return { ...appNewsFromDoc(source.data()), imported: false };
    }
    const mirror = await getDoc(doc(db, 'appConfig', 'appNews'));
    const releases = appNewsFromMirror(mirror.exists() ? mirror.data() : undefined);
    return { releases, version: 0, imported: releases.length > 0 };
  }

  /** Grava a lista inteira. `version` é a lida; devolve a nova, como a callable guardou. */
  async save(releases: AppNewsRelease[], version: number): Promise<AppNewsState> {
    const r = await httpsCallable<{ releases: AppNewsRelease[]; version: number }, unknown>(
      backofficeFunctions(),
      'saveAppNews',
    )({ releases, version });
    return { ...appNewsFromDoc(r.data as Record<string, unknown>), imported: false };
  }

  /**
   * Sobe a imagem ao Storage (`app/news/`, leitura pública); `onProgress` recebe 0–100.
   * O arquivo antigo não é apagado: o app pode ainda tê-lo em cache, e imagem órfã custa centavos.
   */
  async uploadImage(file: File, onProgress: (percent: number) => void): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `app/news/${crypto.randomUUID()}.${ext}`;
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
