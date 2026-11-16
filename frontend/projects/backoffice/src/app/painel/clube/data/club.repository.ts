import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { AuthService } from '../../../auth/auth.service';
import { backofficeDb, backofficeStorage } from '../../data/firebase';
import { benefitEventFromDoc, type BenefitEvent } from './benefit-metrics';
import { clubConfigFromDoc, configPayload, userDisplayName, type ClubConfig } from './club-config';
import { ACTOR_NAME_MAX, logoStoragePath, partnerFromDoc, type Partner, type PartnerPayload } from './partner';
import { leadFromDoc, type PartnerLead } from './partner-lead';

const PARTNERS = 'partners';
const EVENTS = 'benefitEvents';
const LEADS = 'partnerLeads';
const CONFIG_PATH = ['appConfig', 'benefitsClub'] as const;

/** O id já existe: a tela escolhe outro nome (a rule também recusaria, sem explicar). */
export class PartnerExistsError extends Error {
  constructor(readonly partnerId: string) {
    super(`Já existe um parceiro com o id "${partnerId}". Mude o nome.`);
    this.name = 'PartnerExistsError';
  }
}

/**
 * Clube de Vantagens Nexa, direto do Firestore (rules em `firestore.rules`, bloco "Clube de
 * Vantagens"): `partners` e `appConfig/benefitsClub` a equipe grava com allowlist de campos;
 * `benefitEvents` e `partnerLeads` só o servidor grava, a equipe só lê.
 */
@Injectable({ providedIn: 'root' })
export class ClubRepository {
  private readonly auth = inject(AuthService);

  async partners(): Promise<Partner[]> {
    const snap = await getDocs(collection(backofficeDb(), PARTNERS));
    return snap.docs.map((d) => partnerFromDoc(d.id, d.data()));
  }

  async partner(id: string): Promise<Partner | null> {
    const snap = await getDoc(doc(backofficeDb(), PARTNERS, id));
    return snap.exists() ? partnerFromDoc(snap.id, snap.data()) : null;
  }

  /** Cria só se o id estiver livre: `createdAt` nasce aqui e a rule o congela depois. */
  async createPartner(id: string, payload: PartnerPayload): Promise<void> {
    const db = backofficeDb();
    const ref = doc(db, PARTNERS, id);
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) throw new PartnerExistsError(id);
      tx.set(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        createdByName: this.actorName(),
        ...this.touched(),
      });
    });
  }

  /**
   * Regrava o doc inteiro (todos os campos da allowlist). `updateDoc` mantém `createdAt` e
   * `createdByName` como estão, que é o que a rule exige.
   */
  updatePartner(id: string, payload: PartnerPayload): Promise<void> {
    return updateDoc(doc(backofficeDb(), PARTNERS, id), { ...payload, ...this.touched() });
  }

  deletePartner(id: string): Promise<void> {
    return deleteDoc(doc(backofficeDb(), PARTNERS, id));
  }

  /**
   * Sobe a logo para `app/partners/<id>-<timestamp>.<ext>` (leitura pública); `onProgress` recebe
   * 0–100. A antiga não é apagada: o app pode ainda tê-la em cache.
   */
  async uploadLogo(partnerId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
    const path = logoStoragePath(partnerId, file.type, new Date());
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

  async config(): Promise<ClubConfig> {
    const snap = await getDoc(doc(backofficeDb(), ...CONFIG_PATH));
    return clubConfigFromDoc(snap.exists() ? snap.data() : undefined);
  }

  /** Grava o doc inteiro (sem merge): a rule aceita só os cinco campos. */
  saveConfig(enabled: boolean, testerUids: readonly string[]): Promise<void> {
    return setDoc(doc(backofficeDb(), ...CONFIG_PATH), { ...configPayload(enabled, testerUids), ...this.touched() });
  }

  /**
   * Nome de cada uid em `users/{uid}`. Sem doc = `null` (uid que não existe neste projeto); leitura
   * negada ou falha de rede = `undefined` (não sabemos).
   */
  async userNames(uids: readonly string[]): Promise<Map<string, string | null | undefined>> {
    const unique = [...new Set(uids)];
    const entries = await Promise.all(
      unique.map(async (uid): Promise<[string, string | null | undefined]> => {
        try {
          const snap = await getDoc(doc(backofficeDb(), 'users', uid));
          return [uid, snap.exists() ? (userDisplayName(snap.data()) ?? uid) : null];
        } catch {
          return [uid, undefined];
        }
      }),
    );
    return new Map(entries);
  }

  /** Eventos desde `start` (`null` = todos). */
  async events(start: Date | null): Promise<BenefitEvent[]> {
    const col = collection(backofficeDb(), EVENTS);
    const snap = await getDocs(start ? query(col, where('createdAt', '>=', start)) : col);
    return snap.docs.map((d) => benefitEventFromDoc(d.data())).filter((e): e is BenefitEvent => e !== null);
  }

  async leads(): Promise<PartnerLead[]> {
    const snap = await getDocs(query(collection(backofficeDb(), LEADS), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => leadFromDoc(d.id, d.data()));
  }

  private touched(): Record<string, unknown> {
    return { updatedAt: serverTimestamp(), updatedBy: this.uid(), updatedByName: this.actorName() };
  }

  private uid(): string {
    return this.auth.user()?.uid ?? '';
  }

  private actorName(): string {
    const user = this.auth.user();
    const name = (this.auth.displayName() ?? user?.email ?? '').trim() || 'Equipe';
    return name.slice(0, ACTOR_NAME_MAX);
  }
}
