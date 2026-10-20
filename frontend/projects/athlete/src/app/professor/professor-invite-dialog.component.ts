import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NxInlineMessageComponent, NxToastService } from '../shared/feedback';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import {
  PROFESSOR_REASON_MAX,
  PROFESSOR_TYPE_COPY,
  acceptInviteLabel,
  inviteNote,
  inviteSentLine,
  isExpiredInviteError,
  isOpenInvite,
  professorErrorMessage,
  type ProfessorLink,
} from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';
import {
  PfArenaMarkComponent,
  PfNoteComponent,
  PfPermListComponent,
  PfTypeTagComponent,
  focusFirst,
  trapDialogTab,
} from './ui/professor-ui.components';

/**
 * P2 — responder convite (`VcResponderConviteScreen`): a arena, a mensagem dela, o que ela libera
 * e o aviso de que equipe não é vínculo empregatício. "Recusar" pede um motivo opcional no
 * próprio diálogo, sem abrir outro por cima.
 */
@Component({
  selector: 'app-professor-invite-dialog',
  imports: [
    NxInlineMessageComponent,
    NxSpinnerComponent,
    PfArenaMarkComponent,
    PfNoteComponent,
    PfPermListComponent,
    PfTypeTagComponent,
  ],
  templateUrl: './professor-invite-dialog.component.html',
  styleUrl: './professor-invite-dialog.component.scss',
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTab($event, false)',
    '(keydown.shift.tab)': 'onTab($event, true)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorInviteDialogComponent {
  private readonly service = inject(ProfessorLinksService);
  private readonly toasts = inject(NxToastService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  readonly link = input.required<ProfessorLink>();
  /** Começa já no passo de recusa (botão "Recusar" do banner/card). */
  readonly startDeclining = input(false);
  readonly closed = output<void>();

  protected readonly reasonMax = PROFESSOR_REASON_MAX;
  private readonly declineChosen = signal<boolean | null>(null);
  protected readonly declining = computed(() => this.declineChosen() ?? this.startDeclining());
  protected readonly reason = signal('');
  protected readonly busy = signal<'accept' | 'decline' | null>(null);
  protected readonly error = signal<string | null>(null);
  /** O servidor marcou o convite como vencido ao responder: só resta fechar. */
  protected readonly expired = signal(false);

  /** Durante a resposta o snapshot do vínculo pode chegar antes da callable voltar — o diálogo
   *  não troca para "não está mais aberto" no meio do próprio aceite. */
  protected readonly open = computed(
    () => !this.expired() && (this.busy() !== null || isOpenInvite(this.link(), Date.now())),
  );
  protected readonly typeCopy = computed(() => PROFESSOR_TYPE_COPY[this.link().relationshipType]);
  protected readonly sentLine = computed(() => inviteSentLine(this.link(), Date.now()));
  protected readonly note = computed(() => inviteNote(this.link(), this.service.links()));
  protected readonly acceptLabel = computed(() => acceptInviteLabel(this.link().relationshipType));

  constructor() {
    afterNextRender(() => {
      focusFirst(this.host.nativeElement, ['textarea', '.pf-dialog-foot .pf-btn--primary', '.pf-dialog-close']);
    });
    inject(DestroyRef).onDestroy(() => this.trigger?.focus());
  }

  protected onTab(event: Event, backward: boolean): void {
    trapDialogTab(event, this.host.nativeElement, backward);
  }

  protected dismiss(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  protected startDecline(): void {
    this.error.set(null);
    this.declineChosen.set(true);
  }

  protected backToInvite(): void {
    this.error.set(null);
    this.declineChosen.set(false);
  }

  protected accept(): Promise<void> {
    return this.respond(true);
  }

  protected confirmDecline(): Promise<void> {
    return this.respond(false);
  }

  private async respond(accept: boolean): Promise<void> {
    if (this.busy()) return;
    const link = this.link();
    this.busy.set(accept ? 'accept' : 'decline');
    this.error.set(null);
    try {
      await this.service.respondToInvite(link.id, accept, accept ? null : this.reason());
      if (accept) {
        this.toasts.success(
          'Convite aceito',
          link.relationshipType === 'ARENA_STAFF'
            ? `Agora você é da equipe da ${link.arenaName}.`
            : `Agora você é professor independente na ${link.arenaName}.`,
        );
      } else {
        this.toasts.info('Convite recusado', `A ${link.arenaName} recebe um aviso.`);
      }
      this.busy.set(null);
      this.closed.emit();
    } catch (err) {
      if (isExpiredInviteError(err)) this.expired.set(true);
      this.error.set(professorErrorMessage(err, 'Não foi possível responder o convite agora. Tente de novo.'));
      this.busy.set(null);
    }
  }
}
