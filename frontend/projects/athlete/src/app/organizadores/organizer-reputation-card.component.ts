import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrganizerReputationVm } from './organizer-profile.vm';

const STAR_SLOTS = [1, 2, 3, 4, 5] as const;

/** Card "Avaliações dos atletas" da coluna lateral: nota, estrelas, contagem e os 5 aspectos.
 *  Sem comentário de atleta (decisão do dono). `vm` nulo = menos de 3 avaliações. */
@Component({
  selector: 'app-organizer-reputation-card',
  imports: [RouterLink],
  template: `
    <section class="rc" aria-labelledby="rc-title">
      <div class="rc-head">
        <div>
          <p class="rc-kicker">Reputação</p>
          <h2 class="rc-title" id="rc-title">Avaliações dos atletas</h2>
        </div>
        @if (vm() && showAllLink()) {
          <a class="rc-link" [routerLink]="[]" [queryParams]="{ aba: 'avaliacoes' }">Ver todas</a>
        }
      </div>

      @if (vm(); as r) {
        <div class="rc-body">
          <div class="rc-score">
            <strong>{{ r.average }}</strong>
            <span class="rc-stars" role="img" [attr.aria-label]="r.average + ' de 5 estrelas'">
              @for (slot of stars; track slot) {
                <svg width="12" height="12" viewBox="0 0 24 24" [class.rc-star--on]="slot <= r.stars" aria-hidden="true"><path fill="currentColor" d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z" /></svg>
              }
            </span>
            <span class="rc-count">{{ r.countLabel }}</span>
          </div>
          <ul class="rc-aspects">
            @for (a of r.aspects; track a.key) {
              <li>
                <span class="rc-aspect-label">{{ a.label }}</span>
                <span class="rc-bar" aria-hidden="true"><span [style.width.%]="a.pct"></span></span>
                <span class="rc-aspect-value">{{ a.value }}</span>
              </li>
            }
          </ul>
        </div>
      } @else {
        <p class="rc-empty">
          <strong>Ainda sem avaliações suficientes</strong>
          A nota aparece depois de 3 avaliações de atletas que jogaram os eventos.
        </p>
      }
    </section>
  `,
  styleUrl: './organizer-reputation-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerReputationCardComponent {
  readonly vm = input.required<OrganizerReputationVm | null>();
  readonly showAllLink = input(true);

  protected readonly stars = STAR_SLOTS;
}
