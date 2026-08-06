import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { athleteFunctions } from '../../data/functions';
import {
  cancelMyRegistration,
  fetchTournamentOrganizerContact,
  registrationCancellable,
  requestRegistrationCancellation,
  TournamentRegistrationError,
  type AthleteTournamentRegistration,
  type RegistrationUniformSlot,
} from '../../data/tournament-registrations-repository';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import { NxBlockingDialogComponent, NxToastService } from '../../shared/feedback';
import { TournamentLiveStore } from '../tournament-live.store';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export type RegistrationPaymentState = 'paid' | 'share-paid' | 'pending' | 'waitlist';

export interface RegistrationCard {
  id: string;
  categoryName: string;
  categoryId: string;
  entryFee: string;
  teamName: string;
  partnerPending: boolean;
  paymentState: RegistrationPaymentState;
  paymentLabel: string;
  paymentHint: string;
  uniform: RegistrationUniformSlot | null;
  uniformRequired: boolean;
  /** Cancelamento direto pelo atleta: só sem NENHUM pagamento na inscrição. */
  canCancel: boolean;
  /** Com pagamento o caminho é pedir ao organizador — estes três estados. */
  cancellationState: 'none' | 'pending' | 'declined';
  cancellationResponseNote: string;
}

/** Texto que aparece em TODO ponto do fluxo: a plataforma não devolve dinheiro. */
export const REFUND_OUTSIDE_PLATFORM_NOTICE =
  'A nexaGO não processa o reembolso. Ao aprovar, o organizador libera sua vaga — ' +
  'a devolução do valor pago é combinada diretamente com ele, fora da plataforma.';

export const REFUND_PENDING_NOTICE =
  'Aguardando o organizador. Combine a devolução do valor diretamente com ele.';

/** Aba "Minha inscrição": o que o atleta já contratou neste torneio. Só aparece pra quem tem
 *  inscrição, então não precisa de estado vazio de "você não está inscrito". */
@Component({
  selector: 'app-registration-tab',
  imports: [RouterLink, NxBlockingDialogComponent],
  templateUrl: './registration-tab.component.html',
  styleUrl: './registration-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationTabComponent {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(NxToastService);
  protected readonly store = inject(TournamentLiveStore);

  protected readonly cancelTarget = signal<RegistrationCard | null>(null);
  protected readonly cancelling = signal(false);

  protected readonly cards = computed<RegistrationCard[]>(() => {
    const t = this.store.tournament();
    if (!t) return [];
    return this.store.myRegistrations().map((r) => this.cardOf(r, t.categories.find((c) => c.id === r.categoryId) ?? null));
  });

  private cardOf(r: AthleteTournamentRegistration, category: TournamentCategoryOffer | null): RegistrationCard {
    const uid = this.auth.user()?.uid ?? null;
    const isPlayer1 = uid != null && (r.player1Id === uid || r.participantUids[0] === uid);
    const paymentState = this.paymentStateOf(r, uid);
    return {
      id: r.id,
      categoryId: r.categoryId,
      categoryName: category?.categoryName ?? r.categoryId,
      entryFee: category ? formatBRL(category.entryFee) : '—',
      teamName: r.teamId ? this.store.duoNameOf(r.teamId) : 'Dupla a definir',
      partnerPending: r.partnerPending,
      paymentState,
      paymentLabel: PAYMENT_LABEL[paymentState],
      paymentHint: PAYMENT_HINT[paymentState],
      uniform: isPlayer1 ? r.uniformPlayer1 : r.uniformPlayer2,
      uniformRequired: category?.uniformType != null && category.uniformType !== 'none',
      canCancel: registrationCancellable(r),
      cancellationState: r.cancellationRequest?.status ?? 'none',
      cancellationResponseNote: r.cancellationRequest?.responseNote ?? '',
    };
  }

  // ——— Pedido de cancelamento (inscrição paga) ———

  protected readonly requestFormFor = signal<string | null>(null);
  protected readonly requestReason = signal('');
  protected readonly requestSending = signal(false);
  protected readonly organizerContactBusy = signal(false);

  protected readonly refundNotice = REFUND_OUTSIDE_PLATFORM_NOTICE;
  protected readonly refundPendingNotice = REFUND_PENDING_NOTICE;

  protected openRequestForm(card: RegistrationCard): void {
    this.requestReason.set('');
    this.requestFormFor.set(card.id);
  }

  protected closeRequestForm(): void {
    if (!this.requestSending()) this.requestFormFor.set(null);
  }

  protected onReasonInput(event: Event): void {
    this.requestReason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async submitRequest(card: RegistrationCard): Promise<void> {
    const reason = this.requestReason().trim();
    if (!reason || this.requestSending()) return;
    this.requestSending.set(true);
    try {
      await requestRegistrationCancellation(athleteFunctions(), card.id, reason);
      // Atualiza a lista local: o doc muda no servidor, mas a aba só recarrega
      // o torneio inteiro numa navegação nova.
      this.store.myRegistrations.update((list) =>
        list.map((r) =>
          r.id === card.id
            ? { ...r, cancellationRequest: { status: 'pending' as const, reason, responseNote: '' } }
            : r,
        ),
      );
      this.requestFormFor.set(null);
      this.toasts.success('Pedido enviado', 'O organizador foi avisado e vai responder.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível enviar o pedido',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.requestSending.set(false);
    }
  }

  /** Abre o WhatsApp do organizador — é por ali que o reembolso é acertado. */
  protected async contactOrganizer(card: RegistrationCard): Promise<void> {
    if (this.organizerContactBusy()) return;
    this.organizerContactBusy.set(true);
    try {
      const contact = await fetchTournamentOrganizerContact(athleteFunctions(), this.store.tournamentId());
      if (!contact.whatsappPhone) {
        this.toasts.warning(
          'Organizador sem WhatsApp cadastrado',
          contact.email ? `Fale por e-mail: ${contact.email}` : 'Tente pelos canais do torneio.',
        );
        return;
      }
      const text = encodeURIComponent(
        `Olá! Sou atleta inscrito em ${this.store.tournament()?.name ?? 'seu torneio'} ` +
          `(${card.categoryName}) e pedi o cancelamento da inscrição.`,
      );
      window.open(`https://wa.me/${contact.whatsappPhone}?text=${text}`, '_blank', 'noopener');
    } catch (err) {
      this.toasts.error(
        'Não foi possível abrir o contato',
        err instanceof TournamentRegistrationError ? err.message : 'Tente de novo em instantes.',
      );
    } finally {
      this.organizerContactBusy.set(false);
    }
  }

  protected askCancel(card: RegistrationCard): void {
    this.cancelTarget.set(card);
  }

  protected closeCancel(): void {
    if (!this.cancelling()) this.cancelTarget.set(null);
  }

  protected async confirmCancel(): Promise<void> {
    const target = this.cancelTarget();
    if (!target || this.cancelling()) return;
    this.cancelling.set(true);
    try {
      await cancelMyRegistration(athleteFunctions(), target.id);
      // O backend deletou o doc; tira da lista local em vez de recarregar o torneio inteiro.
      this.store.myRegistrations.update((list) => list.filter((r) => r.id !== target.id));
      this.cancelTarget.set(null);
      this.toasts.success('Inscrição cancelada', 'Sua vaga foi liberada para outro atleta.');
    } catch (err) {
      this.toasts.error(
        'Não foi possível cancelar',
        err instanceof TournamentRegistrationError ? err.message : 'O serviço não respondeu — tente de novo.',
      );
    } finally {
      this.cancelling.set(false);
    }
  }

  /** `isPaid` cobre a inscrição inteira; `sharePaidUids` é o pagamento dividido, em que cada
   *  atleta quita a própria metade. */
  private paymentStateOf(r: AthleteTournamentRegistration, uid: string | null): RegistrationPaymentState {
    if (r.waitlist) return 'waitlist';
    if (r.isPaid) return 'paid';
    if (uid != null && r.sharePaidUids.includes(uid)) return 'share-paid';
    return 'pending';
  }

  protected uniformSummary(slot: RegistrationUniformSlot | null): string | null {
    if (!slot) return null;
    const parts: string[] = [];
    if (slot.sizeTop) parts.push(`Camisa ${slot.sizeTop}`);
    if (slot.sizeShorts) parts.push(`Shorts ${slot.sizeShorts}`);
    if (slot.jerseyNumber != null) parts.push(`Nº ${slot.jerseyNumber}`);
    if (slot.jerseyName) parts.push(slot.jerseyName);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
}

const PAYMENT_LABEL: Record<RegistrationPaymentState, string> = {
  paid: 'Pagamento confirmado',
  'share-paid': 'Sua parte está paga',
  pending: 'Pagamento pendente',
  waitlist: 'Na lista de espera',
};

const PAYMENT_HINT: Record<RegistrationPaymentState, string> = {
  paid: 'Sua vaga está garantida.',
  'share-paid': 'Falta o seu parceiro quitar a parte dele para a vaga ser confirmada.',
  pending: 'A vaga só é confirmada depois do pagamento.',
  waitlist: 'Você entra assim que uma vaga for liberada — avisamos por notificação.',
};
