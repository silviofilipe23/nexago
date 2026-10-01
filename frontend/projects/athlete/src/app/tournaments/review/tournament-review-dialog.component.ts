import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { TournamentReviewSubmitter } from '../../data/tournament-review-submitter';
import { tournamentReviewErrorMessage } from '../../data/tournament-reviews-repository';
import {
  TOURNAMENT_REVIEW_ASPECTS,
  TOURNAMENT_REVIEW_COMMENT_MAX,
  TOURNAMENT_REVIEW_XP,
  reviewDayMonth,
  reviewQuestion,
  reviewRatingLabel,
  type MyTournamentReview,
  type TournamentReviewAspectKey,
  type TournamentReviewAspects,
  type TournamentReviewInvite,
} from '../../data/tournament-reviews';
import { NxInlineMessageComponent } from '../../shared/feedback';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';

/**
 * Avaliação do torneio — modal declarativo (o host renderiza dentro de `@if`), no molde do
 * `ArenaReviewDialogComponent`: foco preso à mão, Esc/backdrop = "Agora não", erro inline para
 * não perder o comentário digitado. O toast de sucesso é do host.
 */
@Component({
  selector: 'app-tournament-review-dialog',
  imports: [NxSpinnerComponent, NxInlineMessageComponent],
  templateUrl: './tournament-review-dialog.component.html',
  styleUrl: './tournament-review-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
    '(keydown.tab)': 'onTabKey($event, false)',
    '(keydown.shift.tab)': 'onTabKey($event, true)',
  },
})
export class TournamentReviewDialogComponent {
  private readonly submitter = inject(TournamentReviewSubmitter);
  private readonly hostElement: ElementRef<HTMLElement> = inject(ElementRef);

  readonly invite = input.required<TournamentReviewInvite>();
  /** Avaliação já enviada (edição) — pré-preenche o formulário. */
  readonly existing = input<MyTournamentReview | null>(null);
  readonly submitted = output<{ created: boolean }>();
  readonly dismissed = output<void>();

  protected readonly stars: readonly number[] = [1, 2, 3, 4, 5];
  protected readonly aspectList = TOURNAMENT_REVIEW_ASPECTS;
  protected readonly xpReward = TOURNAMENT_REVIEW_XP;
  protected readonly commentMax = TOURNAMENT_REVIEW_COMMENT_MAX;

  // `linkedSignal`: começa no que veio de `existing` (edição) e segue editável pelo atleta.
  protected readonly overall = linkedSignal<number | null>(() => this.existing()?.overall ?? null);
  protected readonly aspectRatings = linkedSignal<TournamentReviewAspects>(() => ({ ...(this.existing()?.aspects ?? {}) }));
  protected readonly comment = linkedSignal<string>(() => this.existing()?.comment ?? '');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly starButtons = viewChildren<ElementRef<HTMLButtonElement>>('starBtn');
  private readonly triggerElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    afterNextRender(() => this.starButtons()[(this.overall() ?? 1) - 1]?.nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.triggerElement?.focus());
  }

  protected readonly isEdit = computed(() => this.invite().status === 'submitted');
  protected readonly question = computed(() => reviewQuestion(this.invite().tournamentName));
  protected readonly closesLabel = computed(() => reviewDayMonth(this.invite().closesAt));
  protected readonly ratingText = computed(() => reviewRatingLabel(this.overall()));
  protected readonly commentLength = computed(() => this.comment().length);
  protected readonly canSubmit = computed(() => this.overall() != null && !this.sending());
  protected readonly submitLabel = computed(() => {
    if (this.sending()) return 'Enviando…';
    return this.isEdit() ? 'Salvar alterações' : `Enviar e ganhar +${TOURNAMENT_REVIEW_XP} XP`;
  });

  protected aspectValue(key: TournamentReviewAspectKey): number {
    return this.aspectRatings()[key] ?? 0;
  }

  protected setOverall(value: number): void {
    if (this.sending()) return;
    this.overall.set(value);
  }

  protected onStarKeydown(event: KeyboardEvent, star: number): void {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, star + delta));
    this.setOverall(next);
    this.starButtons()[next - 1]?.nativeElement.focus();
  }

  /** Tocar de novo na mesma estrela limpa a nota do aspecto — todos são opcionais. */
  protected setAspect(key: TournamentReviewAspectKey, value: number): void {
    if (this.sending()) return;
    this.aspectRatings.update((current) => {
      const next: TournamentReviewAspects = { ...current };
      if (next[key] === value) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  protected onCommentInput(value: string): void {
    this.comment.set(value);
  }

  protected dismiss(): void {
    if (this.sending()) return;
    this.dismissed.emit();
  }

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

  private focusableElements(): HTMLElement[] {
    const root = this.hostElement.nativeElement;
    return Array.from(root.querySelectorAll<HTMLElement>('button, textarea, [tabindex]')).filter((el) => {
      if (el.hasAttribute('disabled')) return false;
      const tabindex = el.getAttribute('tabindex');
      return tabindex === null || Number(tabindex) >= 0;
    });
  }

  protected async submit(): Promise<void> {
    const overall = this.overall();
    if (this.sending() || overall == null) return;
    this.sending.set(true);
    this.error.set(null);
    try {
      const { created } = await this.submitter.submit({
        tournamentId: this.invite().tournamentId,
        overall,
        aspects: this.aspectRatings(),
        comment: this.comment(),
      });
      this.submitted.emit({ created });
    } catch (err) {
      this.error.set(tournamentReviewErrorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }
}
