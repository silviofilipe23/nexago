import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import type { TournamentPlan } from '../data/tournament-plans';

/** O que o pacote entrega, na mesma ordem no card, no editor e no preview do app. */
@Component({
  selector: 'bo-plan-specs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @let p = plan();
    <ul>
      <li><bo-icon name="court" [size]="15" /><span><b>{{ p.courts }}</b> {{ p.courts > 1 ? 'quadras' : 'quadra' }}</span></li>
      <li><bo-icon name="whistle" [size]="15" /><span><b>{{ p.courts * p.refsPerCourt }}</b> árbitros</span></li>
      @if (p.live) {
        <li><bo-icon name="video" [size]="15" /><span>Transmissão ao vivo · quadra principal</span></li>
      }
      @if (p.live && p.narrator) {
        <li><bo-icon name="mic" [size]="15" /><span>Narrador</span></li>
      }
      <li><bo-icon name="clock" [size]="15" /><span>Cobertura de até {{ p.hours }}h</span></li>
    </ul>
  `,
  styles: `
    ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
    li { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--nx-text); }
    bo-icon { color: var(--nx-orange-500); flex: none; display: inline-flex; }
  `,
})
export class PlanSpecsComponent {
  readonly plan = input.required<TournamentPlan>();
}
