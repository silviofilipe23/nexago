import { Injectable } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { campaignsFromDoc, type CampaignBanner } from './campaign';

export interface CampaignsState {
  banners: CampaignBanner[];
  version: number;
}

/**
 * Leitura direto do Firestore; escrita só pela callable `saveStoreCampaigns`
 * (`functions/src/store-campaigns.ts`) — as rules negam escrita de cliente. O gatilho
 * `onStoreConfigWrittenSyncShowcase` publica os banners ativos na vitrine.
 */
@Injectable({ providedIn: 'root' })
export class CampaignsRepository {
  async load(): Promise<CampaignsState> {
    const snap = await getDoc(doc(backofficeDb(), 'storeConfig', 'campaigns'));
    return campaignsFromDoc(snap.exists() ? snap.data() : undefined);
  }

  /** Grava a lista inteira, na ordem da vitrine. `version` é a lida; devolve a nova. */
  async save(banners: CampaignBanner[], version: number): Promise<CampaignsState> {
    const r = await httpsCallable<{ banners: CampaignBanner[]; version: number }, CampaignsState>(
      backofficeFunctions(),
      'saveStoreCampaigns',
    )({ banners, version });
    return campaignsFromDoc(r.data as unknown as Record<string, unknown>);
  }

  /**
   * Sobe a foto ao Storage (`store/campaigns/`, leitura pública como as fotos do catálogo);
   * `onProgress` recebe 0–100. O arquivo antigo não é apagado: pode ainda estar no espelho
   * público até o gatilho rodar, e foto órfã custa centavos.
   */
  async uploadImage(file: File, onProgress: (percent: number) => void): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `store/campaigns/${crypto.randomUUID()}.${ext}`;
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
