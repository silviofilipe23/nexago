import { Injectable, inject } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { AuthService } from '../../../auth/auth.service';
import { backofficeDb, backofficeFunctions, backofficeStorage } from '../../data/firebase';
import { benefitEventFromDoc, type BenefitEvent } from './benefit-metrics';
import {
  callableRow,
  importResultOf,
  redemptionFromDoc,
  sortRedemptions,
  type BenefitRedemption,
  type ImportResult,
  type RedemptionRow,
  type RedemptionStatus,
} from './benefit-redemption';
import { clubConfigFromDoc, configPayload, userDisplayName, type ClubConfig } from './club-config';
import {
  ACTOR_NAME_MAX,
  logoStoragePath,
  partnerFromDoc,
  partnerPrivateFromDoc,
  type Partner,
  type PartnerPayload,
  type PartnerPrivate,
} from './partner';
import { coverStoragePath, notifyResultOf, type NotifyKind } from './partner-premium';
import { leadFromDoc, type PartnerLead } from './partner-lead';

const PARTNERS = 'partners';
const PARTNER_PRIVATE = 'partnerPrivate';
const REDEMPTIONS = 'benefitRedemptions';
/** A tabela de resgates mostra no máximo isto por consulta (filtre por parceiro para ver o resto). */
export const REDEMPTIONS_LIMIT = 500;

/**
 * O que gravar em `partnerPrivate/{id}` junto do parceiro: o cupom de parceiro com requisito, ou
 * `null` para limpar o que havia. `undefined` = não mexe no doc privado.
 */
export type PrivateCouponWrite = { couponCode: string | null } | undefined;
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

  /**
   * Cria só se o id estiver livre: `createdAt` nasce aqui e a rule o congela depois. O cupom privado
   * (parceiro com requisito) vai na mesma transação: nunca existe parceiro bloqueado sem código.
   */
  async createPartner(id: string, payload: PartnerPayload, privateCoupon: PrivateCouponWrite = undefined): Promise<void> {
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
      if (privateCoupon) tx.set(doc(db, PARTNER_PRIVATE, id), this.privatePayload(privateCoupon), { merge: true });
    });
  }

  /**
   * Regrava o doc inteiro (todos os campos da allowlist). O `update` do lote mantém `createdAt` e
   * `createdByName` como estão, que é o que a rule exige. Com `privateCoupon`, o doc privado vai no
   * mesmo lote (merge: os avisos já enviados ficam).
   */
  async updatePartner(id: string, payload: PartnerPayload, privateCoupon: PrivateCouponWrite = undefined): Promise<void> {
    const db = backofficeDb();
    const batch = writeBatch(db);
    batch.update(doc(db, PARTNERS, id), { ...payload, ...this.touched() });
    if (privateCoupon) batch.set(doc(db, PARTNER_PRIVATE, id), this.privatePayload(privateCoupon), { merge: true });
    await batch.commit();
  }

  /** `partnerPrivate/{id}`: cupom de parceiro com requisito e avisos já enviados. Sem doc = vazio. */
  async partnerPrivate(id: string): Promise<PartnerPrivate> {
    const snap = await getDoc(doc(backofficeDb(), PARTNER_PRIVATE, id));
    return partnerPrivateFromDoc(snap.exists() ? snap.data() : undefined);
  }

  private privatePayload(write: { couponCode: string | null }): Record<string, unknown> {
    return { couponCode: write.couponCode, updatedAt: serverTimestamp(), updatedBy: this.uid() };
  }

  deletePartner(id: string): Promise<void> {
    return deleteDoc(doc(backofficeDb(), PARTNERS, id));
  }

  /**
   * Sobe a logo para `app/partners/<id>-<timestamp>.<ext>` (leitura pública); `onProgress` recebe
   * 0–100. A antiga não é apagada: o app pode ainda tê-la em cache.
   */
  uploadLogo(partnerId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
    return this.upload(logoStoragePath(partnerId, file.type, new Date()), file, onProgress);
  }

  /** Capa 16:9 em `app/partners/<id>-cover-<timestamp>.<ext>` (mesma regra do Storage da logo). */
  uploadCover(partnerId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
    return this.upload(coverStoragePath(partnerId, file.type, new Date()), file, onProgress);
  }

  private async upload(path: string, file: File, onProgress: (percent: number) => void): Promise<string> {
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

  /** Grava o doc inteiro (sem merge): a rule aceita só os campos da config e a autoria. */
  saveConfig(enabled: boolean, testerUids: readonly string[], hubSponsorPartnerId: string | null): Promise<void> {
    return setDoc(doc(backofficeDb(), ...CONFIG_PATH), {
      ...configPayload(enabled, testerUids, hubSponsorPartnerId),
      ...this.touched(),
    });
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

  /**
   * `notifyBenefitPartner` (admin): `dryRun` só conta quem receberia; sem ele, envia (uma vez por
   * parceiro e tipo, o servidor confere).
   */
  async notifyPartner(partnerId: string, kind: NotifyKind, dryRun: boolean): Promise<{ recipients: number; sent: number }> {
    const call = httpsCallable<{ partnerId: string; kind: NotifyKind; dryRun: boolean }, unknown>(
      backofficeFunctions(),
      'notifyBenefitPartner',
    );
    return notifyResultOf((await call({ partnerId, kind, dryRun })).data);
  }

  /** Um lote de `importBenefitRedemptions` (o servidor é idempotente por `externalId`). */
  async importRedemptions(partnerId: string, rows: readonly RedemptionRow[]): Promise<ImportResult> {
    const call = httpsCallable<{ partnerId: string; rows: ReturnType<typeof callableRow>[] }, unknown>(
      backofficeFunctions(),
      'importBenefitRedemptions',
    );
    return importResultOf((await call({ partnerId, rows: rows.map(callableRow) })).data);
  }

  /**
   * Resgates gravados. Filtros só de igualdade (sem índice composto); a ordem é no cliente, pela
   * data do pedido. Até `REDEMPTIONS_LIMIT` docs.
   */
  async redemptions(filter: { partnerId?: string | null; status?: RedemptionStatus | null } = {}): Promise<BenefitRedemption[]> {
    const constraints: QueryConstraint[] = [];
    if (filter.partnerId) constraints.push(where('partnerId', '==', filter.partnerId));
    if (filter.status) constraints.push(where('status', '==', filter.status));
    const snap = await getDocs(query(collection(backofficeDb(), REDEMPTIONS), ...constraints, limit(REDEMPTIONS_LIMIT)));
    return sortRedemptions(snap.docs.map((d) => redemptionFromDoc(d.id, d.data())));
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
