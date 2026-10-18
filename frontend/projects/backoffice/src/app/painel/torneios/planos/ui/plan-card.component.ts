import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent, type PillTone } from '../../../ui/pill.component';
import {
  COMMISSION_PCT,
  STATUS_LABEL,
  brl,
  dayLabel,
  effectivePlan,
  marginCents,
  marginPct,
  marginTone,
  planCost,
  type PlanEntry,
  type PlanRules,
  type PlanStatus,
} from '../data/tournament-plans';
import { MarginBarComponent } from './margin-bar.component';
import { PlanSpecsComponent } from './plan-specs.component';

const STATUS_TONE: Record<PlanStatus, PillTone> = { ativo: 'green', oculto: 'dim', rascunho: 'yellow' };

/** Card do plano na visão geral: o que vale hoje, custo/margem pelas regras e o que está pendente. */
@Component({
  selector: 'bo-plan-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PillComponent, MarginBarComponent, PlanSpecsComponent],
  template: `
    @if (plan(); as p) {
      <article class="card">
        <div class="top">
          <h3>{{ p.name }}</h3>
          <bo-pill [tone]="statusTone()">{{ statusLabel() }}</bo-pill>
        </div>
        <div>
          <div class="price">{{ brl(p.priceCents) }}</div>
          <div class="per">por evento · + {{ commission }}% das inscrições</div>
        </div>
        <div class="specs"><bo-plan-specs [plan]="p" /></div>
        <div class="money">
          <div class="row"><span>Custo estimado</span><span class="mono">{{ brl(cost()) }}</span></div>
          <div class="row">
            <span>Margem bruta</span>
            <span class="mono strong" [class]="tone()">{{ brl(margin()) }} · {{ pct() }}%</span>
          </div>
          <bo-margin-bar [pct]="pct()" [min]="rules().minMarginPct" />
        </div>
        @if (entry().next; as n) {
          <div class="note"><bo-icon name="calendar" [size]="13" /> v{{ n.version }} agendada para {{ day(n.effectiveFrom) }}</div>
        }
        @if (entry().draft) {
          <div class="note draft"><bo-icon name="edit" [size]="13" /> Rascunho não publicado</div>
        }
        <div class="foot">
          <span class="ver">{{ entry().version ? 'v' + entry().version : 'Nunca publicado' }}</span>
          <a class="bo-mini-btn" [routerLink]="['/painel/torneios/planos', entry().id]">
            <bo-icon name="edit" [size]="13" /> Editar
          </a>
        </div>
      </article>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .card { height: 100%; box-sizing: border-box; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .top { display: flex; align-items: center; gap: 10px; }
    h3 { flex: 1; margin: 0; min-width: 0; font-family: var(--nx-font-display); font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .price { font-family: var(--nx-font-display); font-weight: 800; font-size: 30px; letter-spacing: -0.03em; }
    .per { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 4px; }
    .specs { padding-top: 14px; border-top: 1px solid var(--nx-line); }
    .money { padding: 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); display: flex; flex-direction: column; gap: 9px; }
    .row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
    .row > span:first-child { color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); }
    .strong { font-weight: 700; }
    .green { color: var(--nx-win); }
    .yellow { color: var(--nx-pending); }
    .red { color: var(--nx-live); }
    .note { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--nx-orange-500); }
    .note.draft { color: var(--nx-pending); }
    .foot { display: flex; align-items: center; gap: 8px; margin-top: auto; }
    .ver { flex: 1; font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-mute); }
    a.bo-mini-btn { text-decoration: none; }
  `,
})
export class PlanCardComponent {
  readonly entry = input.required<PlanEntry>();
  readonly rules = input.required<PlanRules>();
  readonly today = input.required<string>();

  protected readonly commission = COMMISSION_PCT;
  protected readonly brl = brl;
  protected readonly day = dayLabel;

  /** Plano novo ainda sem publicação mostra o rascunho. */
  protected readonly plan = computed(() => effectivePlan(this.entry(), this.today()) ?? this.entry().draft);
  protected readonly status = computed<PlanStatus>(() =>
    this.entry().version === 0 ? 'rascunho' : this.plan()?.status ?? 'rascunho',
  );
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly statusTone = computed(() => STATUS_TONE[this.status()]);
  protected readonly cost = computed(() => planCost(this.plan()?.courts ?? 0, this.rules()));
  protected readonly margin = computed(() => (this.plan() ? marginCents(this.plan()!, this.rules()) : 0));
  protected readonly pct = computed(() => (this.plan() ? marginPct(this.plan()!, this.rules()) : 0));
  protected readonly tone = computed(() => marginTone(this.pct(), this.rules().minMarginPct));
}
