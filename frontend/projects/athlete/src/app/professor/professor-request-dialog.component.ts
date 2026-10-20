import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { NxInlineMessageComponent } from '../shared/feedback';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import {
  PROFESSOR_MESSAGE_MAX,
  PROFESSOR_TYPES,
  PROFESSOR_TYPE_COPY,
  duplicateCopy,
  duplicateFromError,
  duplicateFromLink,
  filterArenaOptions,
  formatDayMonth,
  openLinkForArena,
  professorErrorMessage,
  type ProfessorArenaOption,
  type ProfessorDuplicate,
  type ProfessorLinkType,
} from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';
import {
  PfArenaMarkComponent,
  PfNoteComponent,
  PfStatusComponent,
  PfTypeTagComponent,
  focusFirst,
  trapDialogTab,
} from './ui/professor-ui.components';

interface RequestSent {
  linkId: string;
  arena: ProfessorArenaOption;
  type: ProfessorLinkType;
  at: Date;
}

/**
 * P3 — solicitar vínculo (`VcSolicitarScreen`), com os dois desfechos do app: M4 "Solicitação
 * enviada" e M5 "Você já tem um pedido aqui". O duplicado é checado antes na lista local (o
 * listener do serviço já tem todos os vínculos) e, se escapar, pelo `details` do erro do servidor.
 */
@Component({
  selector: 'app-professor-request-dialog',
  imports: [
    NxInlineMessageComponent,
    NxSpinnerComponent,
    PfArenaMarkComponent,
    PfNoteComponent,
    PfStatusComponent,
    PfTypeTagComponent,
  ],
  templateUrl: './professor-request-dialog.component.html',
  styleUrl: './professor-request-dialog.component.scss',
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTab($event, false)',
    '(keydown.shift.tab)': 'onTab($event, true)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorRequestDialogComponent implements OnInit {
  private readonly service = inject(ProfessorLinksService);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  /** Arena já escolhida (página da arena, "Solicitar novo vínculo"). */
  readonly presetArena = input<ProfessorArenaOption | null>(null);
  /** Tipo da rodada anterior, quando é um pedido de novo. */
  readonly presetType = input<ProfessorLinkType | null>(null);
  /** Na página da arena não há "Trocar": o pedido é para aquela arena. */
  readonly lockArena = input(false);
  readonly closed = output<void>();

  protected readonly types = PROFESSOR_TYPES;
  protected readonly typeCopy = PROFESSOR_TYPE_COPY;
  protected readonly messageMax = PROFESSOR_MESSAGE_MAX;

  protected readonly arena = linkedSignal<ProfessorArenaOption | null>(() => this.presetArena());
  protected readonly type = linkedSignal<ProfessorLinkType>(() => this.presetType() ?? 'INDEPENDENT');
  protected readonly message = signal('');

  protected readonly term = signal('');
  protected readonly options = signal<readonly ProfessorArenaOption[]>([]);
  protected readonly loadingOptions = signal(false);
  protected readonly optionsError = signal(false);
  protected readonly results = computed(() => filterArenaOptions(this.options(), this.term()));

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal<RequestSent | null>(null);
  private readonly serverDuplicate = signal<ProfessorDuplicate | null>(null);

  /** Vínculo em aberto com a arena escolhida, pela lista ao vivo — evita a ida ao servidor. */
  protected readonly duplicate = computed<ProfessorDuplicate | null>(() => {
    if (this.sent()) return null;
    const fromServer = this.serverDuplicate();
    if (fromServer) return fromServer;
    const arena = this.arena();
    if (!arena) return null;
    const open = openLinkForArena(this.service.links(), arena.id, Date.now());
    return open ? duplicateFromLink(open) : null;
  });
  protected readonly duplicateText = computed(() => {
    const dup = this.duplicate();
    return dup ? duplicateCopy(dup.status) : null;
  });
  /** Linha do card do duplicado: "Independente · pedido em 17 out". */
  protected readonly duplicateLine = computed(() => {
    const dup = this.duplicate();
    const link = dup ? this.service.links().find((l) => l.id === dup.linkId) : null;
    if (!link) return null;
    const at = link.requestedAt ?? link.invitedAt ?? link.approvedAt;
    const verb = link.status === 'PENDING' ? 'pedido em' : link.status === 'INVITED' ? 'convite em' : 'desde';
    const date = at ? `${verb} ${formatDayMonth(at, new Date())}` : null;
    return [PROFESSOR_TYPE_COPY[link.relationshipType].label, date].filter(Boolean).join(' · ');
  });

  protected readonly title = computed(() => {
    if (this.sent()) return 'Solicitação enviada';
    return this.duplicateText()?.heading ?? 'Solicitar vínculo';
  });
  protected readonly canSubmit = computed(() => !!this.arena() && !this.busy() && !this.duplicate());
  protected readonly sentDate = computed(() => {
    const sent = this.sent();
    return sent ? formatDayMonth(sent.at, new Date()) : '';
  });

  constructor() {
    afterNextRender(() => {
      focusFirst(this.host.nativeElement, ['.pf-req-search input', '.pf-req-type[aria-checked="true"]', '.pf-dialog-close']);
    });
    inject(DestroyRef).onDestroy(() => this.trigger?.focus());
  }

  ngOnInit(): void {
    if (!this.arena()) void this.loadOptions();
  }

  protected onTab(event: Event, backward: boolean): void {
    trapDialogTab(event, this.host.nativeElement, backward);
  }

  protected dismiss(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  protected async loadOptions(): Promise<void> {
    if (this.loadingOptions() || this.options().length > 0) return;
    this.loadingOptions.set(true);
    this.optionsError.set(false);
    try {
      this.options.set(await this.service.listArenas());
    } catch {
      this.optionsError.set(true);
    } finally {
      this.loadingOptions.set(false);
    }
  }

  protected pick(option: ProfessorArenaOption): void {
    this.arena.set(option);
    this.serverDuplicate.set(null);
    this.error.set(null);
  }

  protected changeArena(): void {
    this.arena.set(null);
    this.serverDuplicate.set(null);
    this.error.set(null);
    void this.loadOptions();
    afterNextRenderFocus(this.host.nativeElement, '.pf-req-search input');
  }

  protected chooseType(type: ProfessorLinkType): void {
    if (this.busy()) return;
    this.type.set(type);
  }

  /** Setas no radiogroup dos tipos, como manda o padrão ARIA. */
  protected onTypeKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next: ProfessorLinkType = this.type() === 'ARENA_STAFF' ? 'INDEPENDENT' : 'ARENA_STAFF';
    this.chooseType(next);
    this.host.nativeElement.querySelector<HTMLElement>(`.pf-req-type[data-type="${next}"]`)?.focus();
  }

  protected async submit(): Promise<void> {
    const arena = this.arena();
    if (!arena || this.busy() || this.duplicate()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.service.requestLink({
        arenaId: arena.id,
        relationshipType: this.type(),
        message: this.message(),
      });
      this.sent.set({ linkId: result.linkId, arena, type: this.type(), at: new Date() });
    } catch (err) {
      const dup = duplicateFromError(err);
      if (dup) {
        this.serverDuplicate.set(dup);
      } else {
        this.error.set(professorErrorMessage(err, 'Não foi possível enviar a solicitação agora. Tente de novo.'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected goToList(): void {
    this.closed.emit();
    void this.router.navigateByUrl('/professor/arenas');
  }

  protected goToLink(linkId: string): void {
    this.closed.emit();
    void this.router.navigate(['/professor/arenas', linkId]);
  }
}

/** Foco depois do Angular trocar o bloco (o input da busca só existe no próximo render). */
function afterNextRenderFocus(root: HTMLElement, selector: string): void {
  setTimeout(() => root.querySelector<HTMLElement>(selector)?.focus());
}
