import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PartnerInvitesService, type PendingPartnerInvite } from '../../data/partner-invites.service';
import { TournamentRegistrationError } from '../../data/tournament-registrations-repository';
import { NxFeedbackIconComponent, NxToastService } from '../feedback';
import { LgpdConsentDialogComponent } from '../lgpd/lgpd-consent-dialog.component';
import {
  inviteAnnouncementHeadline,
  nextInviteToAnnounce,
  readAnnouncedInviteIds,
  rememberAnnouncedInvite,
} from './invite-announcement';
import { PartnerInviteResponder } from './partner-invite-responder';

const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

let nextId = 0;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TournamentRegistrationError ? err.message : fallback;
}

/**
 * Anúncio do convite de dupla ao entrar no portal.
 *
 * Convite nasce de um gesto do OUTRO atleta: badge e card resolvem para quem já está olhando,
 * mas quem acabou de entrar não tem por que caçar a novidade. Este componente abre o convite
 * na cara, uma vez por sessão, com as três saídas honestas (aceitar, recusar, decidir depois).
 *
 * Mora no shell logado (`at-panel-shell`), então cobre qualquer tela do portal e, de graça,
 * fica fora de login/cadastro/onboarding — telas que não usam o shell.
 *
 * Fila de um: com vários convites pendentes, responder ou adiar traz o próximo. Modal com
 * lista rolável transforma cada decisão num item de formulário; uma por vez é mais honesto.
 */
@Component({
  selector: 'app-at-invite-announcer',
  imports: [LgpdConsentDialogComponent, NxFeedbackIconComponent],
  template: `
    @if (current(); as item) {
      @if (askingLgpd()) {
        <app-lgpd-consent-dialog (confirmed)="confirmLgpdAndAccept()" (cancelled)="askingLgpd.set(false)" />
      } @else {
        <div class="invite-scrim">
          <div
            #dialog
            class="invite-dialog"
            role="dialog"
            aria-modal="true"
            [attr.aria-labelledby]="titleId"
            [attr.aria-describedby]="bodyId"
            (keydown)="onKeydown($event)"
          >
            <span class="chip">
              <app-nx-feedback-icon tone="info" [size]="26" />
            </span>

            <h2 class="title" [id]="titleId">{{ heading() }}</h2>
            <p class="body" [id]="bodyId">{{ headline() }}</p>

            @if (waitingLabel(); as label) {
              <p class="more">{{ label }}</p>
            }

            <div class="actions">
              <button type="button" class="btn btn--primary" data-act="accept" [disabled]="busy()" (click)="accept()">
                Aceitar convite
              </button>
              <button type="button" class="btn btn--ghost" data-act="decline" [disabled]="busy()" (click)="decline()">
                {{ busy() ? 'Recusando…' : 'Recusar' }}
              </button>
              <button type="button" class="btn btn--quiet" data-act="later" [disabled]="busy()" (click)="later()">
                Decidir depois
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: `
    /* O host não pode ocupar espaço no shell — quem cobre a tela é o scrim. */
    :host {
      display: contents;
    }

    .invite-scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: safe center;
      justify-content: center;
      box-sizing: border-box;
      padding: max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px))
        max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px));
      overflow-x: hidden;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      background: rgba(5, 5, 5, 0.72);
      backdrop-filter: blur(3px);
      animation: scrim-in var(--nx-d-fast) var(--nx-ease-out) both;
    }

    /* width com min() e não max-width em porcentagem: o host é flex e definido, então a
       porcentagem cai na caixa certa — mesmo motivo do nx-blocking-dialog. */
    .invite-dialog {
      box-sizing: border-box;
      width: min(460px, 100%);
      max-height: min(100%, calc(100dvh - 32px));
      margin: auto;
      padding: 30px 30px 26px;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-4);
      box-shadow: var(--nx-elev-3);
      animation: dialog-in var(--nx-d-base) var(--nx-ease-out) both;
    }

    .chip {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 52px;
      height: 52px;
      border-radius: var(--nx-r-3);
      background: var(--tone-fill);
      color: var(--tone);
    }

    .title {
      margin: 22px 0 0;
      font-family: var(--nx-font-display);
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.2px;
      line-height: 1.25;
      color: var(--nx-text);
      overflow-wrap: anywhere;
    }

    .body {
      margin: 12px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      line-height: 20.9px;
      color: var(--nx-text-mute);
      overflow-wrap: anywhere;
    }

    /* Sem caixa: com fundo e borda a linha lia como campo de formulário desabilitado,
       e ela é só um lembrete de que a fila não acabou. */
    .more {
      margin: 10px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 18px;
      color: var(--nx-text-dim);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }

    .btn {
      box-sizing: border-box;
      flex: 1 1 140px;
      min-width: 0;
      min-height: 46px;
      padding: 10px 12px;
      border-radius: var(--nx-r-3);
      font-family: var(--nx-font-display);
      font-size: 14px;
      line-height: 1.25;
      white-space: normal;
      text-align: center;
      cursor: pointer;
      transition:
        background var(--nx-d-fast) var(--nx-ease-out),
        border-color var(--nx-d-fast) var(--nx-ease-out);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn--primary {
      background: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-weight: 700;
    }

    .btn--primary:hover:not(:disabled) {
      background: var(--nx-orange-400);
      border-color: var(--nx-orange-400);
    }

    .btn--ghost {
      background: none;
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-weight: 600;
    }

    .btn--ghost:hover:not(:disabled) {
      background: var(--nx-surface-1);
    }

    /* "Decidir depois" não é recusa — fica visualmente abaixo das outras duas pra
       não competir com elas, mas continua alcançável no teclado. */
    .btn--quiet {
      flex: 1 1 100%;
      min-height: 40px;
      background: none;
      border: 1px solid transparent;
      color: var(--nx-text-dim);
      font-weight: 600;
    }

    .btn--quiet:hover:not(:disabled) {
      color: var(--nx-text);
    }

    @keyframes scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes dialog-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
    }

    @media (max-width: 520px) {
      .invite-dialog {
        padding: 24px 16px 20px;
        border-radius: var(--nx-r-3);
      }

      .title {
        font-size: 18px;
      }

      .actions {
        flex-direction: column;
      }

      .btn {
        flex: 1 1 auto;
        width: 100%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .invite-scrim,
      .invite-dialog {
        animation: none;
      }
    }
  `,
  host: {
    '[class.nx-tone-info]': 'true',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtInviteAnnouncerComponent {
  private readonly invites = inject(PartnerInvitesService);
  private readonly auth = inject(AuthService);
  private readonly responder = inject(PartnerInviteResponder);
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);

  /** Marco de "entrei agora": convite criado depois disso espera a próxima entrada. */
  private readonly sessionStartedAt = Date.now();

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private previouslyFocused: HTMLElement | null = null;

  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  private readonly announced = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly busy = signal(false);
  protected readonly askingLgpd = signal(false);

  protected readonly titleId = `at-invite-title-${nextId++}`;
  protected readonly bodyId = `at-invite-body-${nextId++}`;

  protected readonly current = computed(() =>
    nextInviteToAnnounce(this.invites.pending(), this.announced(), this.sessionStartedAt),
  );

  protected readonly heading = computed(() =>
    this.current()?.invite.isTeamInvite ? 'Convite de equipe' : 'Convite de dupla',
  );

  protected readonly headline = computed(() => {
    const item = this.current();
    return item ? inviteAnnouncementHeadline(item) : '';
  });

  /** Quantos convites continuam esperando além do que está na tela. */
  protected readonly waitingLabel = computed(() => {
    const rest = this.invites.pending().length - 1;
    if (this.current() == null || rest < 1) return null;
    return rest === 1
      ? 'Você tem mais 1 convite esperando resposta.'
      : `Você tem mais ${rest} convites esperando resposta.`;
  });

  constructor() {
    // Conta nova na mesma aba é sessão nova pra quem entrou — a memória de anúncio é por uid.
    effect(() => {
      const uid = this.uid();
      this.announced.set(uid ? readAnnouncedInviteIds(uid) : new Set<string>());
    });

    // Depois do render, e não durante: o diálogo do termo LGPD devolve a rolagem ao ser
    // destruído, então a última palavra sobre a trava tem de ser daqui.
    afterRenderEffect(() => {
      const open = this.current() != null;
      this.askingLgpd();
      document.body.style.overflow = open ? 'hidden' : '';

      const el = this.dialog()?.nativeElement;
      if (el) {
        this.previouslyFocused ??= document.activeElement as HTMLElement | null;
        if (!el.contains(document.activeElement)) {
          el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }
      } else if (!open && this.previouslyFocused) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    });

    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
    });
  }

  protected accept(): void {
    if (this.busy()) return;
    this.askingLgpd.set(true);
  }

  protected confirmLgpdAndAccept(): void {
    this.askingLgpd.set(false);
    const item = this.current();
    if (item) void this.submitAccept(item);
  }

  protected decline(): void {
    const item = this.current();
    if (item) void this.submitDecline(item);
  }

  protected later(): void {
    const item = this.current();
    if (item) this.stopAnnouncing(item.invite.id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!this.busy()) this.later();
      return;
    }
    if (event.key !== 'Tab') return;

    // Prende o Tab no diálogo: a tela de fundo está inerte aos olhos, mas continua
    // alcançável pelo teclado.
    const el = this.dialog()?.nativeElement;
    const items = el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Tira o convite do anúncio (nesta aba) sem responder por ele — ele segue no badge do
   *  shell e no card do painel. */
  private stopAnnouncing(inviteId: string): void {
    const uid = this.uid();
    if (uid) rememberAnnouncedInvite(uid, inviteId);
    this.announced.update((current) => new Set(current).add(inviteId));
  }

  /** Aceite sem uniforme — o backend coleta na inscrição, pra onde o atleta vai em seguida. */
  private async submitAccept(item: PendingPartnerInvite): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.responder.accept(item.invite.id);
      this.invites.markAnswered(item.invite.id);
      this.stopAnnouncing(item.invite.id);
      void this.router.navigate(['/torneios', item.invite.tournamentId, 'inscricao'], {
        queryParams: { categoria: item.invite.categoryId },
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível aceitar o convite',
        errorMessage(err, 'O serviço não respondeu — tente de novo.'),
        // Termo já aceito no diálogo — a retentativa vai direto pro envio.
        { label: 'Tentar novamente', run: () => void this.submitAccept(item) },
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async submitDecline(item: PendingPartnerInvite): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.responder.decline(item.invite.id);
      this.invites.markAnswered(item.invite.id);
      this.stopAnnouncing(item.invite.id);
    } catch (err) {
      this.toasts.error(
        'Não foi possível recusar o convite',
        errorMessage(err, 'O convite continua na sua lista — tente de novo.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
