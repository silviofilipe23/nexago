import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  TOURNAMENT_REVIEW_XP,
  reviewCtaState,
  reviewDayMonth,
  reviewQuestion,
  type TournamentReviewInvite,
} from '../../data/tournament-reviews';

/** Botão da avaliação nas abas do torneio. Não abre o diálogo sozinho: põe `?avaliar=1` na URL
 *  e a casca (`TournamentShellComponent`) abre — um host só, para o painel, as abas e o link
 *  `torneios/:id/avaliar`. */
@Component({
  selector: 'app-tournament-review-cta',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('pending') {
        <section class="trc trc--accent" aria-label="Avaliação do torneio">
          <div class="trc-copy">
            <span class="trc-kicker">AVALIAÇÃO · +{{ xp }} XP</span>
            <p class="trc-title">{{ question() }}</p>
            <p class="trc-sub">Leva 10 segundos · fecha em {{ closesLabel() }}</p>
          </div>
          <a class="trc-btn trc-btn--primary" [routerLink]="[]" [queryParams]="{ avaliar: 1 }" queryParamsHandling="merge">Avaliar torneio</a>
        </section>
      }
      @case ('submitted') {
        <section class="trc" aria-label="Avaliação do torneio">
          <div class="trc-copy">
            <span class="trc-kicker">AVALIAÇÃO ENVIADA</span>
            <p class="trc-title">{{ submittedTitle() }}</p>
            <p class="trc-sub">Dá pra editar até {{ closesLabel() }}</p>
          </div>
          <a class="trc-btn" [routerLink]="[]" [queryParams]="{ avaliar: 1 }" queryParamsHandling="merge">Editar</a>
        </section>
      }
      @case ('closed') {
        <section class="trc trc--muted" aria-label="Avaliação do torneio">
          <p class="trc-sub">Avaliação encerrada em {{ closesLabel() }}</p>
        </section>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .trc {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 14px 16px; margin-bottom: 12px; background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
    }
    .trc--accent { border-color: rgba(255, 106, 26, 0.45); }
    .trc--muted { opacity: 0.8; }
    .trc-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .trc-kicker { font-family: var(--nx-font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; color: var(--nx-orange-500); }
    .trc-title { margin: 0; font-size: 15px; font-weight: 800; color: var(--nx-text); }
    .trc-sub { margin: 0; font-size: 12px; color: var(--nx-text-mute); }
    .trc-btn {
      flex: none; display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px;
      font-size: 14px; font-weight: 800; text-decoration: none; color: var(--nx-text); background: transparent;
      border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-2);
      @media (max-width: 640px) { min-height: 44px; }
    }
    .trc-btn--primary { color: #0a0a0a; background: var(--nx-orange-500); border-color: transparent; }
  `,
})
export class TournamentReviewCtaComponent {
  readonly invite = input<TournamentReviewInvite | null>(null);
  readonly myOverall = input<number | null>(null);
  readonly now = input<Date>(new Date());

  protected readonly xp = TOURNAMENT_REVIEW_XP;
  protected readonly state = computed(() => reviewCtaState(this.invite(), this.now()));
  protected readonly question = computed(() => reviewQuestion(this.invite()?.tournamentName ?? ''));
  protected readonly closesLabel = computed(() => {
    const invite = this.invite();
    return invite ? reviewDayMonth(invite.closesAt) : '';
  });
  protected readonly submittedTitle = computed(() => {
    const overall = this.myOverall();
    return overall == null ? 'Você avaliou este torneio' : `Você avaliou ★ ${overall}`;
  });
}
