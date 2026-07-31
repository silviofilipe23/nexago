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
  /** Marcadas nesta sessão via `markReviewed` (submit bem-sucedido ou "já avaliada" vinda do
   *  backend) — separado de `reviewed` de propósito: um `refresh()` que começou antes de um
   *  submit pode resolver depois com um snapshot do servidor que ainda não viu aquele write,
   *  e `reviewed.set(...)` substituiria o Set inteiro, apagando a marca local e trazendo de
   *  volta o CTA "Avaliar" pra reserva que acabou de ser avaliada. Nunca é tocado por
   *  `refresh()` — só cresce, some junto com a sessão (reload = igual a reabrir o app). */
  private readonly locallyReviewed = signal<ReadonlySet<string>>(new Set<string>());
  /** Dispensadas nesta sessão — equivale a `_promptedReviewBookingIds` (Dart). Não persiste:
   *  recarregar a página reabre o convite, igual a reabrir o app. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set<string>());

  /** União do que o servidor confirmou com o que foi marcado nesta sessão — é o que "já
   *  avaliada" deve significar pras três telas. */
  private readonly effectiveReviewed = computed<ReadonlySet<string>>(() => {
    const local = this.locallyReviewed();
    if (local.size === 0) return this.reviewed();
    return new Set([...this.reviewed(), ...local]);
  });

  /** Candidata ao convite automático. Avaliadas E dispensadas entram na mesma exclusão de
   *  `pickPendingReview` — dispensar uma reserva não pode empurrar as outras candidatas pra
   *  fora da fila também, só a que foi dispensada. */
  readonly pending = computed<MyBooking | null>(() => {
    const excluded = new Set([...this.effectiveReviewed(), ...this.dismissed()]);
    return pickPendingReview(this.bookings(), excluded, new Date());
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
    return this.effectiveReviewed().has(bookingId);
  }

  markReviewed(bookingId: string): void {
    this.locallyReviewed.update((current) => new Set(current).add(bookingId));
  }

  dismiss(bookingId: string): void {
    this.dismissed.update((current) => new Set(current).add(bookingId));
  }
}
