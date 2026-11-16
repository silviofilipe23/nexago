import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog.component';
import { IconComponent } from '../../ui/icon.component';
import { PanelCardComponent } from '../../ui/panel-card.component';
import { clubCallableErrorMessage } from '../data/club-errors';
import { ClubRepository } from '../data/club.repository';
import type { PartnerPrivate } from '../data/partner';
import { NOTIFY_LABELS, notifyBlocker, recipientsLabel, type NotifyContext, type NotifyKind } from '../data/partner-premium';

interface Pending {
  kind: NotifyKind;
  recipients: number;
}

const KINDS: readonly NotifyKind[] = ['new', 'ending'];

const KIND_TEXT: Record<NotifyKind, string> = {
  new: 'Push "parceiro novo no clube" com o benefício.',
  ending: 'Push "a oferta está acabando" com a data de fim.',
};

/**
 * "Avisar atletas" (`notifyBenefitPartner`): primeiro conta quem recebe (`dryRun`), mostra o número
 * num confirm e só então envia. Cada tipo vai uma vez por parceiro (o servidor garante e grava em
 * `partnerPrivate`); o botão mostra quando já foi.
 */
@Component({
  selector: 'bo-partner-notify',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, IconComponent, ConfirmDialogComponent],
  template: `
    <bo-panel-card title="Avisar atletas">
      <div class="rows">
        @for (k of kinds; track k) {
          <div class="row">
            <div class="text">
              <div class="title">{{ labels[k] }}</div>
              <div class="sub">
                @if (sentAt(k); as at) {
                  Enviado em {{ at }}. Cada aviso vai uma vez por parceiro.
                } @else if (blocker(k); as why) {
                  {{ why }}
                } @else {
                  {{ kindText[k] }} Vai para quem é da cidade do parceiro e cumpre o requisito (só quem testa, se ele for de teste).
                }
              </div>
            </div>
            <button
              type="button"
              class="bo-mini-btn"
              [disabled]="!!sentAt(k) || !!blocker(k) || counting() !== null || sending()"
              (click)="count(k)"
            >
              @if (counting() === k) {
                <span class="bo-spinner small" aria-hidden="true"></span>
              } @else {
                <bo-icon [name]="sentAt(k) ? 'check' : 'bell'" [size]="13" />
              }
              {{ sentAt(k) ? 'Enviado' : 'Avisar' }}
            </button>
          </div>
        }
      </div>
      @if (result(); as r) {
        <div class="bo-feedback" role="status" aria-live="polite"><bo-icon name="check" [size]="15" /><span>{{ r }}</span></div>
      }
      @if (error(); as e) {
        <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ e }}</span></div>
      }
      @if (privateError()) {
        <p class="note">Não deu para ler se os avisos já foram enviados; o servidor não envia de novo de qualquer forma.</p>
      }
    </bo-panel-card>

    <bo-confirm-dialog
      [open]="pending() !== null"
      [title]="'Avisar: ' + (pending() ? labels[pending()!.kind] : '') + '?'"
      [description]="confirmText()"
      confirmLabel="Enviar push"
      [confirmDisabled]="!pending()?.recipients"
      [busy]="sending()"
      [error]="confirmError()"
      (confirmed)="send()"
      (dismissed)="pending.set(null)"
    />
  `,
  styles: `
    :host { display: block; }
    .rows { display: flex; flex-direction: column; gap: 14px; }
    .row { display: flex; align-items: center; gap: 14px; }
    .text { flex: 1; min-width: 0; }
    .title { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .sub { margin-top: 2px; font-size: 12px; line-height: 1.45; color: var(--nx-text-mute); }
    .note { margin: 10px 0 0; font-size: 11.5px; color: var(--nx-text-dim); }
    .bo-feedback, .bo-alert { margin: 12px 0 0; }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
  `,
})
export class PartnerNotifyComponent {
  private readonly repository = inject(ClubRepository);

  readonly partnerId = input<string | null>(null);
  readonly context = input.required<NotifyContext>();
  readonly privateInfo = input<PartnerPrivate | null>(null);
  readonly privateError = input(false);
  /** Depois de enviar: o editor relê `partnerPrivate` (o servidor gravou a data do aviso). */
  readonly notified = output<NotifyKind>();

  protected readonly kinds = KINDS;
  protected readonly labels = NOTIFY_LABELS;
  protected readonly kindText = KIND_TEXT;
  protected readonly counting = signal<NotifyKind | null>(null);
  protected readonly sending = signal(false);
  protected readonly pending = signal<Pending | null>(null);
  protected readonly error = signal('');
  protected readonly confirmError = signal<string | null>(null);
  protected readonly result = signal('');
  /** Enviado nesta sessão, antes de a releitura do privado chegar. */
  private readonly sentNow = signal<Partial<Record<NotifyKind, Date>>>({});

  protected readonly confirmText = computed(() => {
    const p = this.pending();
    if (!p) return '';
    if (p.recipients === 0) return 'Ninguém recebe este aviso agora (cidade, requisito ou público de teste). Nada foi enviado.';
    return `${recipientsLabel(p.recipients)}. Cada aviso vai uma vez por parceiro: não dá para reenviar.`;
  });

  protected blocker(kind: NotifyKind): string | null {
    return this.partnerId() ? notifyBlocker(kind, this.context(), new Date()) : 'Salve o parceiro antes de avisar.';
  }

  protected sentAt(kind: NotifyKind): string | null {
    const info = this.privateInfo();
    const at = this.sentNow()[kind] ?? (kind === 'new' ? info?.notifiedNewAt : info?.notifiedEndingAt) ?? null;
    return at ? at.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  }

  protected async count(kind: NotifyKind): Promise<void> {
    const id = this.partnerId();
    if (!id) return;
    this.counting.set(kind);
    this.error.set('');
    this.result.set('');
    this.confirmError.set(null);
    try {
      const { recipients } = await this.repository.notifyPartner(id, kind, true);
      this.pending.set({ kind, recipients });
    } catch (error) {
      this.error.set(clubCallableErrorMessage(error));
    } finally {
      this.counting.set(null);
    }
  }

  protected async send(): Promise<void> {
    const id = this.partnerId();
    const p = this.pending();
    if (!id || !p || p.recipients === 0) return;
    this.sending.set(true);
    this.confirmError.set(null);
    try {
      const { recipients, sent } = await this.repository.notifyPartner(id, p.kind, false);
      this.sentNow.update((s) => ({ ...s, [p.kind]: new Date() }));
      this.pending.set(null);
      this.result.set(`${NOTIFY_LABELS[p.kind]}: push enviado para ${sent.toLocaleString('pt-BR')} de ${recipients.toLocaleString('pt-BR')} pessoas.`);
      this.notified.emit(p.kind);
    } catch (error) {
      this.confirmError.set(clubCallableErrorMessage(error));
    } finally {
      this.sending.set(false);
    }
  }
}
