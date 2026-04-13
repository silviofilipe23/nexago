import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { MOCK_DISCOVERY_LEAGUES } from '../tournament-discovery.mock';
import type { DiscoveryTournament } from '../tournament-discovery.models';
import { leagueContextLabel, resolveLeagueContext } from '../tournament-league.helpers';
import type { TournamentCategoryOffer } from '../tournament-detail.mock';
import { MOCK_PARTNER_SUGGESTIONS, suggestionToPartner } from './registration-partners.mock';
import type {
  PaymentInstallmentChoice,
  RegistrationCategory,
  RegistrationPartner,
  RegistrationPaymentStatus,
  RegistrationStep,
  RegistrationTournament,
  PersistedRegistrationPayload,
} from './registration.models';
import { parsePriceLabelToReais } from './registration.models';

const STORAGE_PREFIX = 'nexago_reg_v1_';

@Injectable()
export class TournamentRegistrationService {
  readonly tournament$ = new BehaviorSubject<RegistrationTournament | null>(null);
  readonly categories$ = new BehaviorSubject<RegistrationCategory[]>([]);
  readonly currentStep$ = new BehaviorSubject<RegistrationStep>('category');
  readonly selectedCategory$ = new BehaviorSubject<RegistrationCategory | null>(null);
  readonly selectedPartner$ = new BehaviorSubject<RegistrationPartner | null>(null);
  readonly paymentOption$ = new BehaviorSubject<PaymentInstallmentChoice | null>(null);
  /** Estado do gateway (Mercado Pago simulado). */
  readonly registrationStatus$ = new BehaviorSubject<RegistrationPaymentStatus>('idle');
  readonly paymentLoading$ = new BehaviorSubject(false);
  /** Contador social (+N inscritos) com leve variação. */
  readonly displayEnrolled$ = new BehaviorSubject(0);
  /** Vagas exibidas na categoria selecionada (simulação). */
  readonly categorySpotsDisplay$ = new BehaviorSubject<number | null>(null);

  private tournamentId = '';
  private socialTimer: ReturnType<typeof setInterval> | null = null;
  private spotsTimer: ReturnType<typeof setInterval> | null = null;

  init(
    tournamentId: string,
    listing: DiscoveryTournament,
    offers: TournamentCategoryOffer[],
    options?: { preselectCategoryId?: string | null },
  ): void {
    const isNewTournament = this.tournamentId !== tournamentId;
    if (isNewTournament) {
      this.clearTimers();
      this.resetSubjectsForNewTournament();
      this.tournamentId = tournamentId;
    }

    const leagueCtx = resolveLeagueContext(MOCK_DISCOVERY_LEAGUES, listing.id);

    const regTournament: RegistrationTournament = {
      id: listing.id,
      name: listing.name,
      city: listing.city,
      location: listing.location,
      dateLabel: listing.dateLabel,
      enrolledCount: listing.enrolledCount,
      spotsLeft: listing.spotsLeft,
      spotsTotal: listing.spotsTotal,
      statusLabel: this.statusCopy(listing),
      leagueContextLabel: leagueCtx ? leagueContextLabel(leagueCtx) : undefined,
    };

    const categories: RegistrationCategory[] = offers.map((o) => ({
      id: o.id,
      name: o.name,
      level: o.level,
      spotsLeft: o.spotsLeft,
      spotsTotal: o.spotsTotal,
      priceLabel: o.priceLabel,
      priceReais: parsePriceLabelToReais(o.priceLabel),
    }));

    this.tournament$.next(regTournament);
    this.categories$.next(categories);
    this.displayEnrolled$.next(listing.enrolledCount);

    if (isNewTournament) {
      this.hydrateFromStorage(tournamentId, categories);
      this.startSocialProofTicker(listing.enrolledCount);
      this.startSpotsSimulation();
    }

    const pre = options?.preselectCategoryId;
    if (pre) {
      const cat = categories.find((c) => c.id === pre) ?? null;
      if (cat) {
        this.selectedCategory$.next(cat);
        this.categorySpotsDisplay$.next(cat.spotsLeft);
        if (this.currentStep$.value === 'category') {
          this.currentStep$.next('partner');
        }
      }
    }

    this.persist();
  }

  selectCategory(c: RegistrationCategory): void {
    this.selectedCategory$.next(c);
    this.categorySpotsDisplay$.next(c.spotsLeft);
    this.currentStep$.next('partner');
    this.persist();
  }

  setPartner(p: RegistrationPartner | null): void {
    this.selectedPartner$.next(p);
    this.persist();
  }

  invitePartner(target: string): void {
    const t = target.trim();
    if (!t) return;
    const partner: RegistrationPartner = {
      id: `invite-${Date.now()}`,
      displayName: t.includes('@') ? t : t.split('@')[0] ?? t,
      handle: t.includes('@') ? t : undefined,
      status: 'pending',
      source: 'invite',
      inviteTarget: t,
    };
    this.selectedPartner$.next(partner);
    this.persist();
  }

  pickExistingSuggestion(id: string): void {
    const s = MOCK_PARTNER_SUGGESTIONS.find((x) => x.id === id);
    if (!s) return;
    this.selectedPartner$.next(suggestionToPartner(s, 'existing'));
    this.persist();
  }

  findMatchmakingPartner(): void {
    const pool = MOCK_PARTNER_SUGGESTIONS;
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    this.selectedPartner$.next({
      ...suggestionToPartner(pick, 'matchmaking'),
      status: 'pending',
      id: `match-${Date.now()}`,
    });
    this.persist();
  }

  setPaymentOption(o: PaymentInstallmentChoice): void {
    this.paymentOption$.next(o);
    this.persist();
  }

  goToStep(step: RegistrationStep): void {
    this.currentStep$.next(step);
    this.persist();
  }

  advanceFromPartner(): void {
    if (!this.selectedPartner$.value) return;
    this.currentStep$.next('confirmation');
    this.persist();
  }

  confirmAndGoToPayment(): void {
    if (!this.paymentOption$.value) return;
    this.currentStep$.next('payment');
    this.persist();
  }

  /** Simula checkout Mercado Pago. */
  runPaymentSimulation(): void {
    if (this.paymentLoading$.value) return;
    this.paymentLoading$.next(true);
    this.registrationStatus$.next('pending');
    this.persist();

    const delayMs = 1600 + Math.floor(Math.random() * 900);
    globalThis.setTimeout(() => {
      const ok = Math.random() > 0.1;
      this.paymentLoading$.next(false);
      if (ok) {
        this.registrationStatus$.next('approved');
        this.currentStep$.next('success');
      } else {
        this.registrationStatus$.next('rejected');
      }
      this.persist();
      if (ok) {
        this.clearPersisted(this.tournamentId);
      }
    }, delayMs);
  }

  retryPayment(): void {
    this.registrationStatus$.next('idle');
    this.persist();
  }

  backStep(): void {
    const s = this.currentStep$.value;
    const map: Partial<Record<RegistrationStep, RegistrationStep>> = {
      partner: 'category',
      confirmation: 'partner',
      payment: 'confirmation',
    };
    const prev = map[s];
    if (prev) {
      this.currentStep$.next(prev);
      this.persist();
    }
  }

  resetFlow(): void {
    this.clearTimers();
    this.resetSubjectsForNewTournament();
    const t = this.tournament$.value;
    if (t) {
      this.displayEnrolled$.next(t.enrolledCount);
      this.startSocialProofTicker(t.enrolledCount);
      this.startSpotsSimulation();
    }
    if (this.tournamentId) {
      this.clearPersisted(this.tournamentId);
    }
    this.persist();
  }

  destroy(): void {
    this.clearTimers();
  }

  private statusCopy(listing: DiscoveryTournament): string {
    switch (listing.status) {
      case 'open':
        return 'Inscrições abertas';
      case 'almost_full':
        return 'Últimas vagas';
      case 'live':
        return 'Ao vivo';
      case 'ended':
        return 'Encerrado';
      default:
        return '';
    }
  }

  private hydrateFromStorage(tournamentId: string, categories: RegistrationCategory[]): void {
    const raw = this.safeGetStorage(`${STORAGE_PREFIX}${tournamentId}`);
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as PersistedRegistrationPayload;
      if (p.v !== 1 || p.tournamentId !== tournamentId) return;

      if (p.categoryId) {
        const cat = categories.find((c) => c.id === p.categoryId) ?? null;
        this.selectedCategory$.next(cat);
        if (cat) {
          this.categorySpotsDisplay$.next(cat.spotsLeft);
        }
      }
      if (p.partner) {
        this.selectedPartner$.next(p.partner);
      }
      if (p.paymentOption) {
        this.paymentOption$.next(p.paymentOption);
      }
      if (p.paymentStatus) {
        this.registrationStatus$.next(p.paymentStatus);
      }
      if (p.step && p.step !== 'category') {
        this.currentStep$.next(p.step);
      }
    } catch {
      /* ignore */
    }
  }

  private persist(): void {
    if (!this.tournamentId) return;
    const payload: PersistedRegistrationPayload = {
      v: 1,
      tournamentId: this.tournamentId,
      step: this.currentStep$.value,
      categoryId: this.selectedCategory$.value?.id ?? null,
      partner: this.selectedPartner$.value,
      paymentOption: this.paymentOption$.value,
      paymentStatus: this.registrationStatus$.value,
    };
    this.safeSetStorage(`${STORAGE_PREFIX}${this.tournamentId}`, JSON.stringify(payload));
  }

  private clearPersisted(tournamentId: string): void {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${tournamentId}`);
    } catch {
      /* ignore */
    }
  }

  private resetSubjectsForNewTournament(): void {
    this.currentStep$.next('category');
    this.selectedCategory$.next(null);
    this.selectedPartner$.next(null);
    this.paymentOption$.next(null);
    this.registrationStatus$.next('idle');
    this.paymentLoading$.next(false);
    this.categorySpotsDisplay$.next(null);
  }

  private startSocialProofTicker(base: number): void {
    this.clearSocialTimer();
    this.socialTimer = globalThis.setInterval(() => {
      const bump = Math.random() > 0.65 ? 1 : 0;
      if (bump) {
        this.displayEnrolled$.next(this.displayEnrolled$.value + 1);
      }
    }, 11000);
  }

  private startSpotsSimulation(): void {
    this.clearSpotsTimer();
    this.spotsTimer = globalThis.setInterval(() => {
      const cat = this.selectedCategory$.value;
      if (!cat) return;
      const cur = this.categorySpotsDisplay$.value ?? cat.spotsLeft;
      if (cur <= 1) return;
      if (Math.random() > 0.72) {
        this.categorySpotsDisplay$.next(Math.max(1, cur - 1));
      }
    }, 14000);
  }

  private clearTimers(): void {
    this.clearSocialTimer();
    this.clearSpotsTimer();
  }

  private clearSocialTimer(): void {
    if (this.socialTimer) {
      globalThis.clearInterval(this.socialTimer);
      this.socialTimer = null;
    }
  }

  private clearSpotsTimer(): void {
    if (this.spotsTimer) {
      globalThis.clearInterval(this.spotsTimer);
      this.spotsTimer = null;
    }
  }

  private safeGetStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private safeSetStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}
