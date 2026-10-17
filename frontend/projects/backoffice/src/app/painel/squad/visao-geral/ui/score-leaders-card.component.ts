import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { AmbassadorAvatarComponent } from '../../comissoes/ui/ambassador-avatar.component';
import { TIER_LABELS } from '../../niveis-regras/data/squad-rules';
import type { AmbassadorRow } from '../../embaixadores/data/ambassador';
import { PROFILE_ROUTE } from '../data/overview';

/** Os 5 maiores NexaGO Score do ciclo. O Score é interno: o atleta vê só pontos e nível. */
@Component({
  selector: 'bo-score-leaders-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, AmbassadorAvatarComponent, IconComponent, RouterLink],
  template: `
    <bo-panel-card title="NexaGO Score">
      <a card-actions class="action" routerLink="/painel/squad/embaixadores">Ranking completo</a>
      @if (leaders().length === 0) {
        <div class="empty">
          <bo-icon name="history" [size]="18" />
          <span>O Score diário ainda não foi calculado. Os pesos já estão em Níveis &amp; regras.</span>
        </div>
      }
      @for (r of leaders(); track r.contract.uid; let i = $index) {
        <a class="row" [routerLink]="profileRoute + '/' + r.contract.uid">
          <span class="pos" [class.first]="i === 0">{{ i + 1 }}</span>
          <bo-ambassador-avatar [id]="r.contract.uid" [name]="r.contract.name" [size]="28" />
          <span class="who">
            <strong>{{ r.contract.name }}</strong>
            <span>{{ tierLabels[r.contract.tier] }}</span>
          </span>
          <b class="score">{{ r.contract.score }}</b>
        </a>
      }
    </bo-panel-card>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .action { font-size: 12.5px; font-weight: 600; color: var(--nx-orange-500); text-decoration: none; }
    .action:hover { text-decoration: underline; }
    .empty { display: flex; gap: 10px; align-items: flex-start; padding: 12px 0; font-size: 12.5px; line-height: 1.5; color: var(--nx-text-dim); }
    .empty bo-icon { flex: none; margin-top: 1px; }
    .row { display: flex; align-items: center; gap: 12px; height: 46px; color: inherit; text-decoration: none; }
    .row + .row { border-top: 1px solid var(--nx-line); }
    .row:hover strong { color: var(--nx-orange-500); }
    .pos { width: 14px; font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-text-dim); }
    .pos.first { color: var(--nx-orange-500); }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .who strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .who span { font-size: 11px; color: var(--nx-text-dim); }
    .score { font-family: var(--nx-font-display); font-weight: 800; font-size: 16px; }
  `,
})
export class ScoreLeadersCardComponent {
  readonly leaders = input.required<AmbassadorRow[]>();
  protected readonly tierLabels = TIER_LABELS;
  protected readonly profileRoute = PROFILE_ROUTE;
}
