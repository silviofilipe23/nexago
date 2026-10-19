import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../ui/icon.component';
import { PillComponent } from '../../../ui/pill.component';
import { brl } from '../../planos/data/tournament-plans';
import {
  CONTRACT_STATUS_VIEW,
  attentionOf,
  dayLabel,
  dayRangeLabel,
  isOpen,
  nextStep,
  type PlanContract,
} from '../data/plan-contracts';

export type ContractRowAction = 'ver' | 'avancar' | 'cancelar';

/** Fila de contratos: evento, organizador, plano congelado, contas e o próximo passo de cada um. */
@Component({
  selector: 'bo-contracts-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, PillComponent],
  host: { '(document:click)': 'onDocClick($event)', '(document:keydown.escape)': 'menuFor.set(null)' },
  template: `
    <div class="tr th" role="row">
      <span>Evento</span><span>Data</span><span class="org">Organizador</span><span>Plano</span>
      <span class="num">Sinal</span><span class="num">Saldo</span><span>Status e pendência</span><span></span>
    </div>
    @if (loading()) {
      @for (s of skeleton; track s) { <div class="skeleton-row"><span></span><span></span><span></span></div> }
    } @else {
      @for (c of rows(); track c.id) {
        <div class="tr" role="row" (click)="action.emit({ contract: c, action: 'ver' })">
          <span class="ev">
            <span class="strong ellipsis" [title]="c.tournamentName">{{ c.tournamentName }}</span>
            <span class="sub ellipsis">{{ c.city || 'Cidade não informada' }}<span class="org-inline"> · {{ c.organizerName }}</span></span>
          </span>
          <span class="mono">{{ range(c) }}</span>
          <span class="dim ellipsis org" [title]="c.organizerName">{{ c.organizerName }}</span>
          <span class="ev">
            <span class="strong ellipsis">{{ c.plan.name }}</span>
            <span class="sub ellipsis">{{ c.plan.courts }} {{ c.plan.courts === 1 ? 'quadra' : 'quadras' }} · {{ brl(c.priceCents) }}</span>
          </span>
          <span class="num money">{{ brl(c.depositCents) }}</span>
          <span class="num ev end">
            <span class="money">{{ brl(c.balanceCents) }}</span>
            @if (c.balanceDueDate) { <span class="sub">até {{ day(c.balanceDueDate) }}</span> }
          </span>
          <span class="att">
            <span><bo-pill [tone]="view(c).tone">{{ view(c).label }}</bo-pill></span>
            @if (attention(c); as a) { <span [class]="'att-text ' + a.tone">{{ a.text }}</span> }
            @if (logos().get(c.id); as n) {
              <span class="logos"><bo-icon name="sponsor" [size]="12" /> {{ n }} {{ n === 1 ? 'logo' : 'logos' }} p/ aprovar</span>
            }
          </span>
          <span class="more-wrap" (click)="$event.stopPropagation()">
            <button type="button" class="more" [attr.aria-label]="'Ações do contrato de ' + c.tournamentName"
              [attr.aria-expanded]="menuFor() === c.id" (click)="menuFor.set(menuFor() === c.id ? null : c.id)">
              <bo-icon name="more" [size]="16" />
            </button>
            @if (menuFor() === c.id) {
              <div class="menu" role="menu">
                @if (step(c); as s) {
                  <button type="button" role="menuitem" class="primary" [disabled]="s.blocked !== null" [title]="s.blocked ?? ''"
                    (click)="pick(c, 'avancar')">{{ s.label }}</button>
                }
                <button type="button" role="menuitem" (click)="pick(c, 'ver')">Ver contrato</button>
                <button type="button" role="menuitem" class="danger" [disabled]="!open(c)" (click)="pick(c, 'cancelar')">Cancelar contrato</button>
              </div>
            }
          </span>
        </div>
      } @empty {
        <div class="empty">{{ emptyLabel() }}</div>
      }
    }
  `,
  styles: `
    :host { display: block; background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-4); }
    .tr { display: grid; grid-template-columns: minmax(150px, 1.5fr) 96px minmax(96px, 1fr) minmax(100px, 1fr) 76px 88px minmax(140px, 1.3fr) 32px; gap: 10px; align-items: center; min-height: 62px; padding: 8px 12px; border-top: 1px solid var(--nx-line); cursor: pointer; }
    .tr:hover { background: var(--nx-surface-1); }
    .th { min-height: 0; padding: 14px 12px 12px; border-top: none; cursor: default; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .th:hover { background: none; }
    .ev { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .ev.end { align-items: flex-end; }
    .strong { font-family: var(--nx-font-display); font-weight: 700; font-size: 13px; }
    .sub { font-size: 11px; color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-mute); }
    .dim { font-size: 12.5px; color: var(--nx-text-mute); }
    .num { text-align: right; }
    .money { font-family: var(--nx-font-display); font-weight: 800; font-size: 13px; }
    .ellipsis { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .att { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; min-width: 0; font-size: 12px; }
    .att-text.warn { color: var(--nx-orange-500); font-weight: 600; }
    .att-text.late { color: var(--nx-live); font-weight: 600; }
    .att-text.dim { color: var(--nx-text-mute); }
    .logos { display: inline-flex; align-items: center; gap: 5px; color: var(--nx-pending); font-size: 11.5px; }
    .more-wrap { position: relative; display: grid; place-items: center; cursor: default; }
    .more { width: 28px; height: 28px; display: grid; place-items: center; border: none; border-radius: 8px; background: none; color: var(--nx-text-dim); cursor: pointer; }
    .more:hover { background: var(--nx-surface-2); color: var(--nx-text); }
    .menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 20; min-width: 170px; padding: 6px; border: 1px solid var(--nx-line-strong); border-radius: var(--nx-r-3); background: var(--nx-surface-1); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); display: flex; flex-direction: column; }
    .menu button { height: 32px; padding: 0 10px; border: none; border-radius: 8px; background: none; color: var(--nx-text); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; white-space: nowrap; }
    .menu button:hover:not(:disabled) { background: var(--nx-surface-2); }
    .menu button:disabled { opacity: 0.45; cursor: not-allowed; }
    .menu .primary { font-weight: 700; color: var(--nx-orange-500); }
    .menu .danger { color: var(--nx-live); }
    .empty { padding: 48px 16px; border-top: 1px solid var(--nx-line); text-align: center; font-size: 12.5px; color: var(--nx-text-dim); }
    .skeleton-row { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 24px; align-items: center; height: 62px; padding: 0 56px; border-top: 1px solid var(--nx-line); }
    .org-inline { display: none; }
    /* Tela estreita: o organizador vai para a linha do evento e a coluna sai. */
    @media (max-width: 1180px) {
      .tr { grid-template-columns: minmax(150px, 1.5fr) 96px minmax(100px, 1fr) 76px 88px minmax(140px, 1.3fr) 32px; }
      .org { display: none; }
      .org-inline { display: inline; }
    }
    .skeleton-row span { height: 10px; border-radius: 5px; background: var(--nx-surface-2); opacity: 0.7; }
  `,
})
export class ContractsTableComponent {
  readonly rows = input.required<PlanContract[]>();
  readonly today = input.required<string>();
  /** Logos em análise por contrato (id → quantidade). */
  readonly logos = input<ReadonlyMap<string, number>>(new Map());
  readonly loading = input(false);
  readonly emptyLabel = input('Nenhum contrato aqui');

  readonly action = output<{ contract: PlanContract; action: ContractRowAction }>();

  protected readonly skeleton = [0, 1, 2, 3, 4];
  protected readonly menuFor = signal<string | null>(null);
  protected readonly brl = brl;

  protected view(c: PlanContract) {
    return CONTRACT_STATUS_VIEW[c.status];
  }
  protected range(c: PlanContract): string {
    return dayRangeLabel(c.startDate, c.endDate);
  }
  protected day(d: string): string {
    return dayLabel(d);
  }
  protected attention(c: PlanContract) {
    return attentionOf(c, this.today());
  }
  protected step(c: PlanContract) {
    return nextStep(c, this.today());
  }
  protected open(c: PlanContract): boolean {
    return isOpen(c.status);
  }
  protected pick(contract: PlanContract, action: ContractRowAction): void {
    this.menuFor.set(null);
    this.action.emit({ contract, action });
  }
  protected onDocClick(e: MouseEvent): void {
    if (this.menuFor() && !e.composedPath().some((n) => (n as HTMLElement).classList?.contains('more-wrap'))) this.menuFor.set(null);
  }
}
