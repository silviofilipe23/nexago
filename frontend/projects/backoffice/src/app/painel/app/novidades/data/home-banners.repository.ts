import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { homeBannersFromDoc, statsFromDoc, type HomeBanner, type HomeBannerStats } from './home-banner';

export interface HomeBannersState {
  banners: HomeBanner[];
  version: number;
}

/**
 * Leitura direto do Firestore; escrita só pela callable `saveHomeBanners`
 * (`functions/src/home-banners.ts`), que grava a fonte e o espelho do app na mesma transação —
 * as rules negam escrita de cliente. Os contadores vêm do gatilho `onHomeBannerStateWritten`.
 */
@Injectable({ providedIn: 'root' })
export class HomeBannersRepository {
  async load(): Promise<HomeBannersState> {
    const snap = await getDoc(doc(backofficeDb(), 'appAdminConfig', 'homeBanners'));
    return homeBannersFromDoc(snap.exists() ? snap.data() : undefined);
  }

  /** Atletas que viram, tocaram e dispensaram, por id de banner. Sem doc = ninguém ainda. */
  async loadStats(): Promise<Map<string, HomeBannerStats>> {
    const snap = await getDocs(collection(backofficeDb(), 'homeBannerStats'));
    return new Map(snap.docs.map((d) => [d.id, statsFromDoc(d.data())]));
  }

  /** Grava a lista inteira, na ordem do carrossel. `version` é a lida; devolve a nova. */
  async save(banners: HomeBanner[], version: number): Promise<HomeBannersState> {
    const r = await httpsCallable<{ banners: HomeBanner[]; version: number }, HomeBannersState>(
      backofficeFunctions(),
      'saveHomeBanners',
    )({ banners, version });
    return homeBannersFromDoc(r.data as unknown as Record<string, unknown>);
  }

  /**
   * Sobe a imagem ao Storage (`app/home-banners/`, leitura pública); `onProgress` recebe 0–100.
   * O arquivo antigo não é apagado: o app pode ainda tê-lo em cache, e imagem órfã custa centavos.
   */
  async uploadImage(file: File, onProgress: (percent: number) => void): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `app/home-banners/${crypto.randomUUID()}.${ext}`;
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
