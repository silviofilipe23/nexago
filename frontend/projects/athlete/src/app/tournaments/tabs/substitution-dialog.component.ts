import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import {
  SUBSTITUTION_REASONS,
  SUBSTITUTION_REASON_LABELS,
  SUBSTITUTION_REASON_NOTE_MAX,
  firstNameOf,
  initialsOf,
  type SubstitutionReason,
} from './substitution-view';

export interface SubstitutionSlot {
  uid: string;
  name: string;
  photo: string | null;
  /** "Sua vaga", "Parceiro · confirmado", "Integrante" — ver `substitutionSlotRole`. */
  role: string;
}

export interface SubstitutionCandidate {
  uid: string;
  name: string;
  photo: string | null;
  /** Linha de apoio do resultado (cidade, ou "Atleta"). */
  subtitle: string;
}

export interface SubstitutionSendRequest {
  replacedUid: string;
  replacedName: string;
  inviteeUid: string;
  inviteeName: string;
  reason: SubstitutionReason | null;
  reasonNote: string | null;
}

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_MIN_CHARS = 3;
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let nextId = 0;

/** Diálogo "Substituir atleta" em dois passos — espelha o wizard do app:
 *
 *  1. **Quem não vai poder jogar?** — a vaga (rádio com avatar e papel), o motivo
 *     (chips + detalhe opcional, vai pro organizador) e as regras do torneio.
 *  2. **Quem entra no lugar?** — busca no diretório com debounce, aviso do acerto
 *     do valor quando há pagamento, CTA nominal.
 *
 *  A busca vem por `searchFn` (injetada pelo tab) para o componente ficar puro e
 *  testável. No celular vira folha ancorada embaixo; no desktop, modal centrado.
 *  Esc fecha (salvo enviando), Tab fica preso no diálogo e o foco volta pra quem
 *  abriu ao fechar — mesmo contrato do `NxBlockingDialog`. */
@Component({
  selector: 'app-substitution-dialog',
  imports: [NxSpinnerComponent],
  templateUrl: './substitution-dialog.component.html',
  styleUrl: './substitution-dialog.component.scss',
  host: {
    '(keydown)': 'onKeydown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubstitutionDialogComponent implements OnDestroy {
  readonly slots = input.required<SubstitutionSlot[]>();
  /** "dupla" ou "equipe" — só muda a copy. */
  readonly unitLabel = input<'dupla' | 'equipe'>('dupla');
  readonly categoryName = input('');
  /** Regra "inscrição já paga é mantida"; `null` = ninguém pagou, a linha some. */
  readonly paymentRule = input<string | null>(null);
  readonly busy = input(false);
  readonly searchFn = input.required<(term: string) => Promise<SubstitutionCandidate[]>>();

  readonly closed = output<void>();
  readonly send = output<SubstitutionSendRequest>();

  protected readonly step = signal<1 | 2>(1);
  protected readonly replaced = signal<SubstitutionSlot | null>(null);
  protected readonly reason = signal<SubstitutionReason | null>(null);
  protected readonly reasonNote = signal('');

  protected readonly term = signal('');
  protected readonly results = signal<SubstitutionCandidate[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal(false);
  /** Último termo efetivamente buscado — evita "ninguém encontrado" antes do debounce. */
  protected readonly lastSearchedTerm = signal('');
  protected readonly selected = signal<SubstitutionCandidate | null>(null);

  protected readonly reasons = SUBSTITUTION_REASONS.map((id) => ({ id, label: SUBSTITUTION_REASON_LABELS[id] }));
  protected readonly noteMax = SUBSTITUTION_REASON_NOTE_MAX;
  protected readonly titleId = `sub-dialog-title-${nextId++}`;
  protected readonly initials = initialsOf;

  protected readonly reasonLabel = computed(() => {
    const reason = this.reason();
    return reason ? SUBSTITUTION_REASON_LABELS[reason] : null;
  });
  protected readonly ctaLabel = computed(() => {
    const invitee = this.selected();
    return invitee ? `Pedir substituição por ${firstNameOf(invitee.name)}` : 'Pedir substituição';
  });
  protected readonly searchCameUpEmpty = computed(
    () => !this.searching() && !this.searchError() && this.lastSearchedTerm().length > 0 && this.results().length === 0,
  );

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly previouslyFocused = document.activeElement as HTMLElement | null;
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');
  private searchHandle: ReturnType<typeof setTimeout> | undefined;
  /** Só a busca mais recente escreve nos sinais — a anterior pode chegar depois. */
  private searchToken = 0;

  constructor() {
    document.body.style.overflow = 'hidden';
    afterNextRender(() => {
      const firstRadio = this.el.nativeElement.querySelector<HTMLElement>('input[type="radio"]');
      (firstRadio ?? this.focusable()[0])?.focus();
    });
    // O campo de busca só existe no passo 2; o `viewChild` muda quando ele nasce.
    effect(() => {
      if (this.step() === 2) this.searchField()?.nativeElement.focus();
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchHandle);
    document.body.style.overflow = '';
    this.previouslyFocused?.focus();
  }

  // ——— passo 1 ———

  protected choose(slot: SubstitutionSlot): void {
    this.replaced.set(slot);
  }

  protected toggleReason(id: SubstitutionReason): void {
    this.reason.update((current) => (current === id ? null : id));
  }

  protected onNoteInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.reasonNote.set(value.slice(0, this.noteMax));
  }

  protected next(): void {
    if (!this.replaced()) return;
    this.step.set(2);
  }

  // ——— passo 2 ———

  protected back(): void {
    if (this.busy()) return;
    this.step.set(1);
  }

  protected onTermInput(value: string): void {
    this.term.set(value);
    clearTimeout(this.searchHandle);
    if (value.trim().length < SEARCH_MIN_CHARS) {
      // Abaixo do mínimo não há busca nem "não achei": volta ao estado de dica.
      this.searchToken++;
      this.searching.set(false);
      this.searchError.set(false);
      this.results.set([]);
      this.lastSearchedTerm.set('');
      return;
    }
    this.searchHandle = setTimeout(() => void this.search(value), SEARCH_DEBOUNCE_MS);
  }

  protected onTermEnter(): void {
    clearTimeout(this.searchHandle);
    void this.search(this.term());
  }

  private async search(raw: string): Promise<void> {
    const term = raw.trim();
    if (term.length < SEARCH_MIN_CHARS) return;
    const token = ++this.searchToken;
    this.searching.set(true);
    this.searchError.set(false);
    try {
      const found = await this.searchFn()(term);
      if (token !== this.searchToken) return;
      this.results.set(found);
      this.lastSearchedTerm.set(term);
      // Quem estava escolhido e saiu da lista deixa de estar escolhido.
      this.selected.update((current) => (current && found.some((c) => c.uid === current.uid) ? current : null));
    } catch {
      if (token !== this.searchToken) return;
      this.results.set([]);
      this.lastSearchedTerm.set(term);
      this.searchError.set(true);
    } finally {
      if (token === this.searchToken) this.searching.set(false);
    }
  }

  protected pick(candidate: SubstitutionCandidate): void {
    this.selected.update((current) => (current?.uid === candidate.uid ? null : candidate));
  }

  protected submit(): void {
    const replaced = this.replaced();
    const invitee = this.selected();
    if (!replaced || !invitee || this.busy()) return;
    const note = this.reasonNote().trim();
    this.send.emit({
      replacedUid: replaced.uid,
      replacedName: replaced.name,
      inviteeUid: invitee.uid,
      inviteeName: invitee.name,
      reason: this.reason(),
      reasonNote: note.length > 0 ? note : null,
    });
  }

  // ——— diálogo ———

  protected close(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;

    // Prende o Tab no diálogo: sem isso o foco escapa pra tela de fundo.
    const items = this.focusable();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private focusable(): HTMLElement[] {
    return Array.from(this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
  }
}
