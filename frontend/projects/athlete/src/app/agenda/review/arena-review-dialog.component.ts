import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import {
  ArenaReviewError,
  REVIEW_ALREADY_SENT_MESSAGE,
  normalizeReviewTags,
  submitArenaReview,
} from '../../data/arena-reviews-repository';
import type { ReviewableBooking } from '../../data/pending-arena-review';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { NxInlineMessageComponent } from '../../shared/feedback';
import {
  REVIEW_COMMENT_MAX,
  REVIEW_ON_TIME_QUESTION,
  REVIEW_XP_REWARD,
  composeReviewComment,
  keepReviewTags,
  ratingHint,
  ratingLabel,
  reviewRebookSuggestion,
  reviewSentMessage,
  reviewSessionSubtitle,
  reviewTagsFor,
  reviewTagsHeading,
  reviewToneFor,
} from './arena-review-copy';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** "Como foi jogar na {arena}?" — espelha `arena_review_page.dart` (app, PR #1322): nota sem
 *  padrão, opções que mudam com a nota (destaques em 4–5, o que melhorar em 1–3), pergunta de
 *  pontualidade, CTA desligado sem nota e, depois do envio, "Avaliação enviada" com "Jogar de
 *  novo" em nota boa. Diferenças de plataforma: Esc e clique no backdrop valem "Agora não" (ou
 *  "Fechar" depois do envio); o erro fica inline em vez de snackbar, pra não jogar fora o
 *  comentário digitado; e o foco é gerenciado à mão (inicial na estrela, preso enquanto
 *  aberto, devolvido ao gatilho ao fechar) porque não há `<dialog>` nativo fazendo isso.
 *
 *  `submitted` só sai quando o atleta deixa a tela de sucesso (Fechar, Esc, backdrop ou
 *  "Jogar de novo"): emitir no envio faria o host fechar o modal antes do "Avaliação enviada". */
@Component({
  selector: 'app-arena-review-dialog',
  imports: [NxSpinnerComponent, NxInlineMessageComponent, RouterLink],
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
  private readonly injector = inject(Injector);
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
  protected readonly onTimeQuestion = REVIEW_ON_TIME_QUESTION;
  protected readonly commentMax = REVIEW_COMMENT_MAX;
  protected readonly stars: readonly number[] = [1, 2, 3, 4, 5];

  /** Sem nota inicial: o atleta escolhe, e o CTA diz o que falta enquanto isso. */
  protected readonly rating = signal<number | null>(null);
  protected readonly selectedTags = signal<ReadonlySet<string>>(new Set<string>());
  /** "A quadra foi liberada no horário?" — null = não respondida. */
  protected readonly onTime = signal<boolean | null>(null);
  protected readonly commentOpen = signal(false);
  protected readonly comment = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Nota que foi enviada; não-null troca o formulário pelo "Avaliação enviada". */
  protected readonly sentRating = signal<number | null>(null);

  /** Roving tabindex das estrelas: dá foco por índice sem depender de nome de classe CSS,
   *  tanto pro foco inicial quanto pra navegação por seta. */
  private readonly starButtons = viewChildren<ElementRef<HTMLButtonElement>>('starBtn');
  private readonly successHeading = viewChild<ElementRef<HTMLElement>>('successHeading');

  /** Elemento que tinha o foco antes do diálogo abrir — normalmente o botão que o disparou.
   *  Recebe o foco de volta quando o componente é destruído. */
  private readonly triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => this.starButtons()[this.focusableStar() - 1]?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.triggerElement?.focus());
  }

  // `ratingText`, não `ratingLabel`: um campo com o mesmo nome da função importada compila,
  // mas confunde quem lê.
  protected readonly ratingText = computed(() => ratingLabel(this.rating()));
  protected readonly ratingHintText = computed(() => ratingHint(this.rating()));
  /** Nota 1–3 pinta o rótulo de vermelho, como no app. */
  protected readonly lowRating = computed(() => {
    const rating = this.rating();
    return rating != null && reviewToneFor(rating) === 'improve';
  });
  protected readonly tagOptions = computed(() => reviewTagsFor(this.rating()));
  protected readonly tagsHeading = computed(() => {
    const rating = this.rating();
    return rating == null ? '' : reviewTagsHeading(reviewToneFor(rating));
  });
  protected readonly sessionSubtitle = computed(() => reviewSessionSubtitle(this.booking(), new Date()));
  protected readonly arenaName = computed(() => {
    const name = this.booking().arenaName.trim();
    return name.length > 0 ? name : 'sua arena';
  });
  protected readonly sentMessage = computed(() => {
    const rating = this.sentRating();
    return rating == null ? '' : reviewSentMessage(this.booking().arenaName, rating);
  });
  protected readonly rebook = computed(() => {
    const rating = this.sentRating();
    return rating == null ? null : reviewRebookSuggestion(this.booking(), rating, new Date());
  });

  /** Estrela que entra no Tab: a da nota, ou a primeira enquanto não há nota. */
  protected focusableStar(): number {
    return this.rating() ?? 1;
  }

  protected isTagSelected(tag: string): boolean {
    return this.selectedTags().has(tag);
  }

  protected setRating(value: number): void {
    if (this.sending()) return;
    this.selectedTags.set(keepReviewTags(this.selectedTags(), this.rating(), value));
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
   *  bindings de host não estreitam o tipo pelo nome do evento. */
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
   *  roving tabindex, então só a da vez (`tabindex="0"`) entra aqui. */
  private focusableElements(): HTMLElement[] {
    const root = this.hostElement.nativeElement;
    const candidates = root.querySelectorAll<HTMLElement>('button, textarea, a[href], [tabindex]');
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

  /** Tocar de novo na resposta marcada desmarca (volta a "não respondida"). */
  protected setOnTime(value: boolean): void {
    if (this.sending()) return;
    this.onTime.update((current) => (current === value ? null : value));
  }

  protected openCommentField(): void {
    if (this.sending()) return;
    this.commentOpen.set(true);
  }

  protected onCommentInput(value: string): void {
    this.comment.set(value);
  }

  /** Esc, backdrop e "Agora não". Depois do envio, fechar conclui (`submitted`). */
  protected dismiss(): void {
    if (this.sending()) return;
    if (this.sentRating() != null) {
      this.finish();
      return;
    }
    this.dismissed.emit();
  }

  /** Sai da tela de sucesso: o host marca a reserva como avaliada e fecha o modal. Também no
   *  "Jogar de novo", depois que o `routerLink` já disparou a navegação. */
  protected finish(): void {
    this.submitted.emit(this.booking().id);
  }

  protected async submit(): Promise<void> {
    const uid = this.auth.user()?.uid ?? '';
    const db = this.firestore;
    const booking = this.booking();
    const rating = this.rating();
    if (this.sending() || rating == null) return;
    if (!uid || !db) {
      this.error.set('Sua sessão não está ativa. Entre na conta e tente de novo.');
      return;
    }

    const tags = normalizeReviewTags([...this.selectedTags()]);
    this.sending.set(true);
    this.error.set(null);
    try {
      await submitArenaReview(db, {
        arenaId: booking.arenaId,
        bookingId: booking.id,
        userId: uid,
        rating,
        comment: composeReviewComment(tags, this.comment(), reviewToneFor(rating)),
        tags,
        onTime: this.onTime(),
      });
      this.sentRating.set(rating);
      // O formulário some; sem isso o foco cai no <body>, fora do diálogo.
      afterNextRender(() => this.successHeading()?.nativeElement.focus(), { injector: this.injector });
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
