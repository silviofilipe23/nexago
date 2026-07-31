import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { ArenaReviewError, submitArenaReview } from '../../data/arena-reviews-repository';
import type { ReviewableBooking } from '../../data/pending-arena-review';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
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

/** "Como foi o jogo na {arena}?" — espelha `rating_dialog.dart`. Duas diferenças de
 *  plataforma: Esc e clique no backdrop valem "Agora não" (o app usa `barrierDismissible:
 *  false`, hostil no desktop), e o erro fica inline em vez de fechar com snackbar, pra não
 *  jogar fora o comentário digitado. */
@Component({
  selector: 'app-arena-review-dialog',
  imports: [NxSpinnerComponent],
  templateUrl: './arena-review-dialog.component.html',
  styleUrl: './arena-review-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'dismiss()',
  },
})
export class ArenaReviewDialogComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  readonly booking = input.required<ReviewableBooking>();
  readonly submitted = output<string>();
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
    const group = (event.target as HTMLElement).closest('.arv-stars');
    group?.querySelectorAll<HTMLButtonElement>('.arv-star')[next - 1]?.focus();
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
      this.error.set('Não foi possível enviar sua avaliação. Tente de novo.');
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
      // Só mensagem de `ArenaReviewError` é apresentável; rules e rede falam inglês técnico.
      this.error.set(
        err instanceof ArenaReviewError ? err.message : 'Não foi possível enviar sua avaliação. Tente de novo.',
      );
    } finally {
      this.sending.set(false);
    }
  }
}
