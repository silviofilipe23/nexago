import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  buildPartnerInviteMessage,
  buildPartnerInviteUrl,
  whatsAppShareUrl,
} from '../../shared/partner-invite/partner-invite';

/** Dialog "Convidar parceiro pro nexaGO" — parceiro ainda sem conta na plataforma.
 *
 *  O link leva pro /cadastro com o contexto do convite (indicação + torneio +
 *  categoria); o convite REAL de dupla continua sendo enviado por quem convida,
 *  depois que o parceiro cria a conta — o passo a passo do dialog deixa isso claro. */
@Component({
  selector: 'app-invite-partner-dialog',
  templateUrl: './invite-partner-dialog.component.html',
  styleUrl: './invite-partner-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'close()',
  },
})
export class InvitePartnerDialogComponent {
  readonly tournamentId = input.required<string>();
  readonly categoryId = input.required<string>();
  readonly tournamentName = input.required<string>();
  readonly categoryName = input.required<string>();
  readonly inviterName = input.required<string>();
  /** Código de indicação (UID) — pode faltar em modo dev sem auth real. */
  readonly referralCode = input<string>('');
  readonly initialPartnerName = input<string>('');
  /** Nome da equipe (categoria trio/quarteto/quinteto) — muda o texto do convite. */
  readonly teamName = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitido quando o convite saiu (WhatsApp aberto ou link copiado). */
  readonly shared = output<string | null>();

  protected readonly partnerName = signal<string | null>(null);
  protected readonly copyFeedback = signal<string | null>(null);
  private copyFeedbackTimeout: ReturnType<typeof setTimeout> | undefined;

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameField');

  constructor() {
    afterNextRender(() => this.nameInput()?.nativeElement.focus());
  }

  protected readonly partnerNameValue = computed(() => this.partnerName() ?? this.initialPartnerName());

  protected readonly inviteUrl = computed(() =>
    buildPartnerInviteUrl(typeof location !== 'undefined' ? location.origin : '', {
      referralCode: this.referralCode(),
      tournamentId: this.tournamentId(),
      categoryId: this.categoryId(),
      inviterName: this.inviterName(),
    }),
  );

  protected readonly whatsAppHref = computed(() =>
    whatsAppShareUrl(
      buildPartnerInviteMessage({
        partnerName: this.partnerNameValue().trim() || null,
        tournamentName: this.tournamentName(),
        categoryName: this.categoryName(),
        url: this.inviteUrl(),
        teamName: this.teamName(),
      }),
    ),
  );

  protected onNameInput(value: string): void {
    this.partnerName.set(value);
  }

  protected close(): void {
    clearTimeout(this.copyFeedbackTimeout);
    this.closed.emit();
  }

  protected onWhatsAppClick(): void {
    // O href já abre o wa.me em nova aba; aqui só registramos que o convite saiu.
    this.shared.emit(this.partnerNameValue().trim() || null);
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.inviteUrl());
      this.setCopyFeedback('Link copiado!');
      this.shared.emit(this.partnerNameValue().trim() || null);
    } catch {
      this.setCopyFeedback('Não deu pra copiar — selecione o link manualmente.');
    }
  }

  private setCopyFeedback(message: string): void {
    this.copyFeedback.set(message);
    clearTimeout(this.copyFeedbackTimeout);
    this.copyFeedbackTimeout = setTimeout(() => this.copyFeedback.set(null), 3500);
  }
}
