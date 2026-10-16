import { Injectable } from '@angular/core';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../../data/firebase';
import { DEFAULT_RETURNS_CONFIG, returnFromDoc, type ReturnRequest, type ReturnsConfig } from './returns';

type Raw = Record<string, any>;

/** Leitura direto do Firestore; status e estoque só mudam pelas callables de trocas. */
@Injectable({ providedIn: 'root' })
export class ReturnsRepository {
  async list(): Promise<ReturnRequest[]> {
    const snap = await getDocs(query(collection(backofficeDb(), 'storeReturns'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => returnFromDoc(d.id, d.data() as Raw));
  }

  /** `storeConfig/returns`, completado pelo padrão (o doc pode não existir). */
  async config(): Promise<ReturnsConfig> {
    try {
      const snap = await getDoc(doc(backofficeDb(), 'storeConfig', 'returns'));
      const saved = (snap.data() ?? {}) as Partial<ReturnsConfig>;
      return { ...DEFAULT_RETURNS_CONFIG, ...saved, storePaysReasons: saved.storePaysReasons ?? DEFAULT_RETURNS_CONFIG.storePaysReasons };
    } catch {
      return DEFAULT_RETURNS_CONFIG;
    }
  }

  async create(input: Raw): Promise<{ returnId: string; code: string }> {
    const r = await httpsCallable<unknown, { returnId: string; code: string }>(backofficeFunctions(), 'createStoreReturn')(input);
    return r.data;
  }

  async act(input: Raw): Promise<{ version: number; status: string }> {
    const r = await httpsCallable<unknown, { version: number; status: string }>(backofficeFunctions(), 'storeReturnAction')(input);
    return r.data;
  }

  async uploadPhoto(returnId: string, file: File): Promise<{ url: string; path: string }> {
    const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-60);
    const path = `store/returns/${returnId}/${Date.now()}-${safe}`;
    const r = storageRef(backofficeStorage(), path);
    await uploadBytes(r, file, { contentType: file.type });
    return { url: await getDownloadURL(r), path };
  }
}
