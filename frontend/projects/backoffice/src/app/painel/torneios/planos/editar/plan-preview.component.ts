import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PillComponent } from '../../../ui/pill.component';
import { COMMISSION_PCT, brl, type TournamentPlan } from '../data/tournament-plans';
import { PlanSpecsComponent } from '../ui/plan-specs.component';

/** Como o card deve aparecer para o organizador no app (390 px). A tela de contratação vem depois. */
@Component({
  selector: 'bo-plan-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, PillComponent, PlanSpecsComponent],
  template: `
    <bo-panel-card kicker="Preview" title="Como o organizador vê no app">
      <bo-pill card-actions tone="dim">390 px</bo-pill>
      @let p = plan();
      <div class="phone">
        <div class="name">{{ p.name || 'Sem nome' }}</div>
        @if (p.description) {
          <div class="desc">{{ p.description }}</div>
        }
        <div class="price"><strong>{{ brl(p.priceCents) }}</strong><span>/evento</span></div>
        <div class="terms">{{ p.depositPct }}% na contratação · + {{ commission }}% das inscrições</div>
        <div class="specs"><bo-plan-specs [plan]="p" /></div>
        <div class="cta" aria-hidden="true">Contratar para meu torneio</div>
      </div>
    </bo-panel-card>
  `,
  styles: `
    .phone { border-radius: 22px; padding: 18px; background: radial-gradient(120% 90% at 0% 0%, rgba(255, 106, 26, 0.22), transparent 60%), #0b0b0c; border: 1px solid rgba(255, 106, 26, 0.4); }
    .name { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; overflow-wrap: anywhere; }
    .desc { margin-top: 6px; font-size: 12.5px; line-height: 1.45; color: var(--nx-text-mute); }
    .price { display: flex; align-items: baseline; gap: 6px; margin-top: 14px; }
    .price strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 28px; letter-spacing: -0.03em; }
    .price span, .terms { font-size: 12px; color: var(--nx-text-dim); }
    .terms { font-size: 11.5px; margin-top: 2px; }
    .specs { margin-top: 14px; }
    .cta { margin-top: 16px; height: 44px; border-radius: 14px; background: var(--nx-orange-500); color: #0a0a0a; display: grid; place-items: center; font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; }
  `,
})
export class PlanPreviewComponent {
  readonly plan = input.required<TournamentPlan>();

  protected readonly commission = COMMISSION_PCT;
  protected readonly brl = brl;
}
