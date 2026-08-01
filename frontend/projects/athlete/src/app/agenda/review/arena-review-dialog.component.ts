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
  viewChildren,
} from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { ArenaReviewError, REVIEW_ALREADY_SENT_MESSAGE, submitArenaReview } from '../../data/arena-reviews-repository';
import type { ReviewableBooking } from '../../data/pending-arena-review';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { NxInlineMessageComponent } from '../../shared/feedback';
import {
  REVIEW_DEFAULT_TAGS,
  REVIEW_HIGHLIGHT_TAGS,
  REVIEW_XP_REWARD,
  composeReviewComment,
  ratingLabel,
  reviewSessionSubtitle,
} from './arena-review-copy';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** "Como foi o jogo na {arena}?" — espelha `rating_dialog.dart`. Diferenças de plataforma:
 *  Esc e clique no backdrop valem "Agora não" (o app usa `barrierDismissible: false`, hostil
 *  no desktop); o erro fica inline em vez de fechar com snackbar, pra não jogar fora o
 *  comentário digitado; e o foco é gerenciado manualmente (inicial na estrela atual, preso
 *  enquanto aberto, devolvido ao gatilho ao fechar) porque não há infraestrutura de dialog
 *  nativo (`<dialog>`) fazendo isso por nós. */
@Component({
  selector: 'app-arena-review-dialog',
  imports: [NxSpinnerComponent, NxInlineMessageComponent],
  templateUrl: './arena-review-dialog.component.html',
  styleUrl: './arena-review-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTabKey($event, false)',
    '(keydown.shift.tab)': 'onTabKey($event, true)',
  },
})
export class ArenaReviewDialogComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();
  // Anotação explícita: `inject(ElementRef)` sem argumento de tipo infere `ElementRef<any>`.
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly booking = input.required<ReviewableBooking>();
  readonly submitted = output<string>();
  /** Emitido quando o backend recusa por "já avaliada" — outra aba/o app já mandou a mesma
   *  reserva antes deste store saber. Distinto de `submitted`: o host não deve comemorar
   *  +10 XP aqui, porque este envio não creditou XP nenhum. */
  readonly alreadyReviewed = output<string>();
  readonly dismissed = output<void>();

  protected readonly xpReward = REVIEW_XP_REWARD;
  protected readonly highlightTags = REVIEW_HIGHLIGHT_TAGS;
  protected readonly stars: readonly number[] = [1, 2, 3, 4, 5];

  protected readonly rating = signal(5);
  protected readonly selectedTags = signal<ReadonlySet<string>>(new Set(REVIEW_DEFAULT_TAGS));
  protected readonly commentOpen = signal(false);
  protected readonly comment = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Roving tabindex das estrelas: dá foco por índice sem depender de nome de classe CSS,
   *  tanto pro foco inicial quanto pra navegação por seta. */
  private readonly starButtons = viewChildren<ElementRef<HTMLButtonElement>>('starBtn');

  /** Elemento que tinha o foco antes do diálogo abrir — normalmente o botão que o disparou.
   *  Recebe o foco de volta quando o componente é destruído (`@if` em Tasks 6-8 cobre tanto
   *  "Agora não" quanto envio bem-sucedido, sem duplicar a lógica nos dois caminhos). */
  private readonly triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => this.starButtons()[this.rating() - 1]?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.triggerElement?.focus());
  }

  // `ratingText`, não `ratingLabel`: um campo com o mesmo nome da função importada compila,
  // mas confunde quem lê.
  protected readonly ratingText = computed(() => ratingLabel(this.rating()));
  protected readonly sessionSubtitle = computed(() => reviewSessionSubtitle(this.booking(), new Date()));
  protected readonly arenaName = computed(() => {
    const name = this.booking().arenaName.trim();
    return name.length > 0 ? name : 'sua arena';
  });

  protected isTagSelected(tag: string): boolean {
    return this.selectedTags().has(tag);
  }

  protected setRating(value: number): void {
    if (this.sending()) return;
    this.rating.set(value);
  }

  /** Setas navegam o radiogroup e levam o foco junto, como manda o padrão ARIA. */
  protected onStarKeydown(event: KeyboardEvent, star: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, star + delta));
    this.setRating(next);
    this.starButtons()[next - 1]?.nativeElement.focus();
  }

  /** Tab preso no diálogo: no primeiro/último controle alcançável, volta pro outro extremo
   *  em vez de deixar o foco escapar pro conteúdo de fundo. `Event`, não `KeyboardEvent`:
   *  bindings de host não estreitam o tipo pelo nome do evento, mesmo padrão de
   *  `focusSearch(event: Event)` nos outros componentes com atalho de teclado. */
  protected onTabKey(event: Event, backward: boolean): void {
    const focusable = this.focusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (backward && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!backward && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Controles realmente alcançáveis por Tab, na ordem do documento. As estrelas usam
   *  roving tabindex, então só a selecionada (`tabindex="0"`) entra aqui. */
  private focusableElements(): HTMLElement[] {
    const root = this.hostElement.nativeElement;
    const candidates = root.querySelectorAll<HTMLElement>('button, textarea, [tabindex]');
    return Array.from(candidates).filter((el) => {
      if (el.hasAttribute('disabled')) return false;
      const tabindex = el.getAttribute('tabindex');
      return tabindex === null || Number(tabindex) >= 0;
    });
  }

  protected toggleTag(tag: string): void {
    if (this.sending()) return;
    this.selectedTags.update((current) => {
      const next = new Set(current);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  }

  protected toggleCommentField(): void {
    if (this.sending()) return;
    this.commentOpen.update((open) => !open);
  }

  protected onCommentInput(value: string): void {
    this.comment.set(value);
  }

  protected dismiss(): void {
    if (this.sending()) return;
    this.dismissed.emit();
  }

  protected async submit(): Promise<void> {
    const uid = this.auth.user()?.uid ?? '';
    const db = this.firestore;
    const booking = this.booking();
    if (this.sending() || this.rating() < 1) return;
    if (!uid || !db) {
      this.error.set('Sua sessão não está ativa. Entre na conta e tente de novo.');
      return;
    }

    this.sending.set(true);
    this.error.set(null);
    try {
      await submitArenaReview(db, {
        arenaId: booking.arenaId,
        bookingId: booking.id,
        userId: uid,
        rating: this.rating(),
        comment: composeReviewComment([...this.selectedTags()], this.comment()),
      });
      this.submitted.emit(booking.id);
    } catch (err) {
      // "Já avaliada" não é um erro pro atleta — outra aba (ou o app) já mandou essa mesma
      // reserva antes deste store saber. Trava o modal aqui vira um beco sem saída (o mesmo
      // erro se repete pra sempre); em vez disso avisa o host pra marcar como avaliada e
      // fechar, como as outras duas telas fariam se soubessem.
      if (err instanceof ArenaReviewError && err.message === REVIEW_ALREADY_SENT_MESSAGE) {
        this.alreadyReviewed.emit(booking.id);
        return;
      }
      // Só mensagem de `ArenaReviewError` é apresentável; rules e rede falam inglês técnico.
      this.error.set(
        err instanceof ArenaReviewError ? err.message : 'O serviço não respondeu. Sua avaliação continua aqui.',
      );
    } finally {
      this.sending.set(false);
    }
  }
}
