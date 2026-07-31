import { Injectable, computed, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { fetchReviewedBookingIds } from './arena-reviews-repository';
import { fetchMyBookings, type MyBooking } from './my-bookings-repository';
import { bookingIsReviewable, pickPendingReview } from './pending-arena-review';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Estado da avaliação pendente, compartilhado pelas três telas que oferecem avaliar
 *  (Agenda, detalhe da reserva e histórico). Um store só porque "já avaliei" precisa sumir
 *  das três na hora, sem reload e sem cada tela buscar por conta própria. */
@Injectable({ providedIn: 'root' })
export class PendingArenaReviewService {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  private readonly bookings = signal<readonly MyBooking[]>([]);
  private readonly reviewed = signal<ReadonlySet<string>>(new Set<string>());
  /** Dispensadas nesta sessão — equivale a `_promptedReviewBookingIds` (Dart). Não persiste:
   *  recarregar a página reabre o convite, igual a reabrir o app. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set<string>());

  /** Candidata ao convite automático, já descontando o que foi dispensado nesta sessão. */
  readonly pending = computed<MyBooking | null>(() => {
    const candidate = pickPendingReview(this.bookings(), this.reviewed(), new Date());
    if (candidate == null) return null;
    return this.dismissed().has(candidate.id) ? null : candidate;
  });

  async refresh(): Promise<void> {
    const uid = this.auth.user()?.uid ?? null;
    const db = this.firestore;
    if (!uid || !db) {
      this.bookings.set([]);
      this.reviewed.set(new Set<string>());
      return;
    }

    try {
      const bookings = await fetchMyBookings(db, uid);
      const now = new Date();
      // Só as concluídas interessam: evita levar todo o histórico de reservas ao `in` de 10.
      const candidates = bookings.filter((b) => bookingIsReviewable(b, now));
      const reviewed =
        candidates.length > 0
          ? await fetchReviewedBookingIds(db, uid, candidates.map((b) => b.id))
          : new Set<string>();
      this.bookings.set(bookings);
      this.reviewed.set(reviewed);
    } catch {
      // Avaliação é enriquecimento: falhar aqui não pode derrubar a tela que chamou. Preservar
      // o último estado bom evita descartar o convite válido se uma retry posterior falhar
      // por instabilidade de rede; na primeira chamada os signals já nascem vazios.
    }
  }

  isReviewed(bookingId: string): boolean {
    return this.reviewed().has(bookingId);
  }

  markReviewed(bookingId: string): void {
    this.reviewed.update((current) => new Set(current).add(bookingId));
  }

  dismiss(bookingId: string): void {
    this.dismissed.update((current) => new Set(current).add(bookingId));
  }
}
