import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { publicAspectRows, type PublicReviewSummary } from '../../data/tournament-reviews';

/** "Como os atletas avaliaram" (spec §5): média de cada aspecto com nota. Some abaixo de 3
 *  avaliações e quando nenhum aspecto foi avaliado. Estilo próprio para não engordar a aba. */
@Component({
  selector: 'app-tournament-review-aspects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length) {
      <section class="tra-card" aria-labelledby="tra-title">
        <span class="tra-kicker">Avaliação dos atletas</span>
        <h2 class="tra-title" id="tra-title">Como os atletas avaliaram</h2>
        @for (row of rows(); track row.key) {
          <div class="tra-row">
            <span class="tra-label">{{ row.label }}</span>
            <span class="tra-value">{{ row.value }}</span>
            <div class="tra-track"><span [style.width.%]="row.pct"></span></div>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .tra-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-5);
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .tra-kicker {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .tra-title {
      margin: 4px 0 8px;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 17px;
      color: var(--nx-text);
    }
    .tra-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 12px;
      padding: 9px 0;
    }
    .tra-label {
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }
    .tra-value {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }
    .tra-track {
      grid-column: 1 / -1;
      height: 5px;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      overflow: hidden;
    }
    .tra-track span {
      display: block;
      height: 100%;
      background: var(--nx-orange-500);
    }
  `,
})
export class TournamentReviewAspectsComponent {
  readonly summary = input<PublicReviewSummary | null>(null);
  protected readonly rows = computed(() => publicAspectRows(this.summary()));
}
