import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PanelCardComponent } from '../../../ui/panel-card.component';
import { PillComponent } from '../../../ui/pill.component';
import { NumFieldComponent } from '../../../squad/niveis-regras/ui/num-field.component';
import {
  brl,
  marginCents,
  marginPct,
  marginTone,
  planCost,
  suggestedPrice,
  toCents,
  type Issues,
  type PlanRules,
  type TournamentPlan,
} from '../data/tournament-plans';

export interface FinanceRow {
  id: string;
  plan: TournamentPlan;
}

/**
 * Estrutura financeira: custo fixo, custo por quadra e margem mínima (versionados) e a tabela
 * de custo × margem × preço sugerido de cada plano, recalculada a cada tecla.
 */
@Component({
  selector: 'bo-finance-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelCardComponent, PillComponent, IconComponent, NumFieldComponent],
  template: `
    <bo-panel-card kicker="Estrutura financeira" title="Custo, margem e preço sugerido por plano">
      <div card-actions class="actions">
        <bo-pill tone="dim">v{{ version() }} · estimativa por evento</bo-pill>
        @if (dirty()) {
          <button type="button" class="bo-mini-btn" [disabled]="saving()" (click)="discard.emit()">Descartar</button>
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="saving() || hasIssues()" (click)="save.emit()">
            Salvar v{{ version() + 1 }}
          </button>
        }
      </div>
      <div class="inputs">
        <div class="field">
          <span class="lbl">Custo fixo por evento</span>
          <bo-num-field label="Custo fixo por evento" prefix="R$" [value]="rules().fixedCostCents / 100" [invalid]="!!issues()['fixedCostCents']" [disabled]="readonly()" (valueChange)="set('fixedCostCents', $event, true)" />
        </div>
        <div class="field">
          <span class="lbl">Custo por quadra</span>
          <bo-num-field label="Custo por quadra" prefix="R$" [value]="rules().courtCostCents / 100" [invalid]="!!issues()['courtCostCents']" [disabled]="readonly()" (valueChange)="set('courtCostCents', $event, true)" />
        </div>
        <div class="field">
          <span class="lbl">Margem mínima</span>
          <bo-num-field label="Margem mínima" suffix="%" [value]="rules().minMarginPct" [invalid]="!!issues()['minMarginPct']" [disabled]="readonly()" (valueChange)="set('minMarginPct', $event, false)" />
        </div>
        <p class="hint">Recalculam a tabela e os cards na hora; salvar cria uma versão nova. Comissão e Sponsors entram à parte.</p>
      </div>

      <div class="split">
        <div class="table" role="table" aria-label="Margem por plano">
          <div class="tr th" role="row">
            @for (c of cols; track c; let i = $index) {
              <span role="columnheader" [class.r]="i > 0">{{ c }}</span>
            }
          </div>
          @for (r of view(); track r.id) {
            <div class="tr" role="row">
              <span class="name" role="cell">{{ r.name }} <em>· {{ r.courts }}q</em></span>
              <span class="r" role="cell">{{ brl(r.price) }}</span>
              <span class="r dim" role="cell">{{ brl(r.cost) }}</span>
              <span class="r b" role="cell">{{ brl(r.margin) }}</span>
              <span class="r b" role="cell" [class]="r.tone">{{ r.pct }}%</span>
              <span class="r" role="cell" [class.up]="r.suggested > r.price" [class.dim]="r.suggested <= r.price">
                {{ r.suggested > r.price ? brl(r.suggested) : 'ok' }}
              </span>
            </div>
          }
          <div class="warn">
            <bo-icon name="alert" [size]="15" />
            <span>Cada quadra soma {{ brl(rules().courtCostCents) }} de custo. Se o preço sobe menos que isso por quadra, a margem em reais fica parada e o percentual cai a cada plano.</span>
          </div>
        </div>
        <div class="bars">
          <div class="legend"><span><i class="c"></i>Custo</span><span><i class="m"></i>Margem</span></div>
          @for (r of view(); track r.id) {
            <div class="bar-row">
              <span class="bn">{{ r.name }}</span>
              <div class="bar" [style.width.%]="r.width">
                <div class="seg c" [style.flex]="r.costPart"></div>
                <div class="seg m" [style.flex]="r.marginPart">{{ r.marginPart ? brl(r.margin) : '' }}</div>
              </div>
            </div>
          }
        </div>
      </div>
    </bo-panel-card>
  `,
  styles: `
    .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .inputs { display: grid; grid-template-columns: repeat(3, minmax(0, 200px)) minmax(0, 1fr); gap: 14px; align-items: end; margin-bottom: 20px; }
    .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .hint { margin: 0; font-size: 11.5px; color: var(--nx-text-dim); line-height: 1.45; }
    .split { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 28px; }
    .tr { display: grid; grid-template-columns: minmax(0, 1fr) 96px 96px 104px 56px 132px; gap: 8px; align-items: center; padding: 12px 4px; border-bottom: 1px solid var(--nx-line); font-family: var(--nx-font-mono); font-size: 12.5px; }
    .tr.th { padding-top: 0; padding-bottom: 10px; border-bottom-color: var(--nx-line-strong); font-size: 9.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .r { text-align: right; }
    .b { font-weight: 700; }
    .dim { color: var(--nx-text-mute); }
    .up { color: var(--nx-orange-500); }
    .green { color: var(--nx-win); }
    .yellow { color: var(--nx-pending); }
    .red { color: var(--nx-live); }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name em { font-style: normal; font-weight: 500; font-size: 11.5px; color: var(--nx-text-dim); }
    .warn { margin-top: 14px; display: flex; gap: 10px; padding: 12px 14px; border-radius: var(--nx-r-2); background: rgba(244, 197, 67, 0.06); border: 1px solid rgba(244, 197, 67, 0.25); font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute); }
    .warn bo-icon { color: var(--nx-pending); flex: none; margin-top: 1px; }
    .bars { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .legend { display: flex; gap: 14px; font-size: 11.5px; color: var(--nx-text-dim); }
    .legend span { display: flex; align-items: center; gap: 6px; }
    .legend i { width: 10px; height: 10px; border-radius: 2px; }
    i.c, .seg.c { background: var(--nx-surface-2); }
    i.c { border: 1px solid var(--nx-line-strong); }
    i.m, .seg.m { background: var(--nx-orange-500); }
    .bar-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 10px; align-items: center; }
    .bn { font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar { display: flex; height: 22px; border-radius: 5px; overflow: hidden; }
    .seg.c { border-right: 1px solid var(--nx-bg); }
    .seg.m { display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: #0a0a0a; white-space: nowrap; overflow: hidden; }
    @media (max-width: 1180px) {
      .split { grid-template-columns: minmax(0, 1fr); }
      .inputs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .hint { grid-column: 1 / -1; }
    }
    @media (max-width: 760px) {
      .table { overflow-x: auto; }
      .tr { min-width: 600px; }
      .inputs { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class FinanceCardComponent {
  readonly rows = input.required<FinanceRow[]>();
  readonly rules = input.required<PlanRules>();
  readonly version = input.required<number>();
  readonly issues = input<Issues>({});
  readonly dirty = input(false);
  readonly saving = input(false);
  readonly readonly = input(false);

  readonly rulesChange = output<PlanRules>();
  readonly save = output<void>();
  readonly discard = output<void>();

  protected readonly cols = ['Plano', 'Preço', 'Custo', 'Margem', '%', 'Preço p/ margem mín.'];
  protected readonly brl = brl;
  protected readonly hasIssues = computed(() => Object.keys(this.issues()).length > 0);

  protected readonly view = computed(() => {
    const r = this.rules();
    const valid = !this.hasIssues();
    const rows = this.rows().map(({ id, plan }) => {
      const cost = valid ? planCost(plan.courts, r) : NaN;
      const margin = valid ? marginCents(plan, r) : NaN;
      const pct = valid ? marginPct(plan, r) : 0;
      return {
        id,
        name: plan.name,
        courts: plan.courts,
        price: plan.priceCents,
        cost,
        margin,
        pct,
        tone: marginTone(pct, r.minMarginPct),
        suggested: valid ? suggestedPrice(plan.courts, r) : 0,
        costPart: valid ? Math.max(0, Math.min(cost, plan.priceCents)) : 0,
        marginPart: valid ? Math.max(0, margin) : 0,
      };
    });
    const max = Math.max(1, ...rows.map((x) => Math.max(x.price, Number.isFinite(x.cost) ? x.cost : 0)));
    return rows.map((x) => ({ ...x, width: (Math.max(x.price, Number.isFinite(x.cost) ? x.cost : 0) / max) * 100 }));
  });

  protected set(key: keyof PlanRules, value: unknown, money: boolean): void {
    const v = typeof value === 'number' ? value : NaN;
    this.rulesChange.emit({ ...this.rules(), [key]: money ? toCents(v) : v });
  }
}
