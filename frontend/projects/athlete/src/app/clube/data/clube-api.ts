import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  clubConfigFromDoc,
  formatWhatsapp,
  partnerFromDoc,
  sandRankCodeOf,
  type BenefitsClubConfig,
  type ClubSource,
  type Partner,
  type ValidLead,
} from '../clube.logic';
import type { SandRankCode } from '../../profile/sand-rank';

/** Eventos que o portal manda (`lead_submit` só o servidor grava, dentro do `submitPartnerLead`). */
export type ClubEventType = 'club_view' | 'partner_view' | 'cta_click' | 'code_copy';

export interface ClubEvent {
  type: ClubEventType;
  partnerId: string | null;
  source: ClubSource;
}

/**
 * O que o clube usa do perfil (`users/{uid}`): o filtro de cidade, o pré-preenchimento do lead e o
 * elo do SandRanking (desconto por elo).
 */
export interface ClubAthleteProfile {
  name: string;
  /** Já formatado para o campo: `(62) 98240-6456`. */
  whatsapp: string;
  city: string | null;
  /** Do espelho `sandRank`; sem espelho, Iniciante (mesma leitura do servidor). */
  sandRank: SandRankCode;
}

export interface LeadSubmitResult {
  successMessage: string | null;
}

/**
 * As portas do clube no portal. A vitrine e a config são leitura direta (rules: logado); o funil e o
 * lead só pelas callables, porque são os números da reunião e dados pessoais com consentimento.
 *
 * Interface para as telas serem testadas sem Firebase (o token devolve `null` sem chave).
 */
export interface ClubApi {
  fetchConfig(): Promise<BenefitsClubConfig>;
  /** Só os ativos; o filtro de público e cidade é do cliente (`visiblePartners`). */
  fetchPartners(): Promise<Partner[]>;
  fetchProfile(uid: string): Promise<ClubAthleteProfile | null>;
  track(event: ClubEvent): Promise<void>;
  submitLead(lead: ValidLead, source: ClubSource): Promise<LeadSubmitResult>;
  /** Cupom que o servidor libera para esta pessoa (privado do requisito ou da faixa do elo). */
  claimBenefit(partnerId: string, source: ClubSource): Promise<string | null>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Implementação Firebase. O SDK do Firestore e o do Functions entram por `import()`: o card do
 * Competir e o item do menu usam esta porta, e nada alcançável do bundle inicial pode trazer o SDK.
 */
export function firebaseClubApi(): ClubApi {
  const firestore = async () => {
    const [sdk, { athleteFirestore }] = await Promise.all([
      import('firebase/firestore'),
      import('../../data/firestore'),
    ]);
    const db = athleteFirestore();
    if (!db) throw new Error('Firebase não configurado.');
    return { sdk, db };
  };

  const callable = async (name: string, data: unknown): Promise<unknown> => {
    const [{ httpsCallable }, { athleteFunctions }] = await Promise.all([
      import('firebase/functions'),
      import('../../data/functions'),
    ]);
    return (await httpsCallable(athleteFunctions(), name)(data)).data;
  };

  return {
    async fetchConfig() {
      const { sdk, db } = await firestore();
      const snap = await sdk.getDoc(sdk.doc(db, 'appConfig', 'benefitsClub'));
      return clubConfigFromDoc(snap.exists() ? snap.data() : undefined);
    },

    async fetchPartners() {
      const { sdk, db } = await firestore();
      const snap = await sdk.getDocs(sdk.query(sdk.collection(db, 'partners'), sdk.where('active', '==', true)));
      return snap.docs
        .map((d) => partnerFromDoc(d.id, d.data()))
        .filter((p): p is Partner => p !== null);
    },

    async fetchProfile(uid) {
      const { sdk, db } = await firestore();
      const snap = await sdk.getDoc(sdk.doc(db, 'users', uid));
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      return {
        name: text(data['fullName']) || text(data['name']),
        whatsapp: formatWhatsapp(text(data['phoneNumber'])),
        city: text(data['city']) || null,
        sandRank: sandRankCodeOf(data),
      };
    },

    async track(event) {
      await callable('trackBenefitEvent', {
        type: event.type,
        partnerId: event.partnerId,
        source: event.source,
        surface: 'web',
        platform: 'web',
      });
    },

    async submitLead(lead, source) {
      const data = await callable('submitPartnerLead', {
        ...lead,
        consent: true,
        source,
        surface: 'web',
        platform: 'web',
      });
      return { successMessage: text((data as { successMessage?: unknown } | null)?.successMessage) || null };
    },

    async claimBenefit(partnerId, source) {
      const data = await callable('claimBenefit', { partnerId, source, surface: 'web', platform: 'web' });
      return text((data as { coupon?: unknown } | null)?.coupon) || null;
    },
  };
}

export const CLUB_API = new InjectionToken<ClubApi | null>('CLUB_API', {
  providedIn: 'root',
  factory: () => (environment.firebase.apiKey ? firebaseClubApi() : null),
});
