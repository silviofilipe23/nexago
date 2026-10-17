import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { PillComponent, type PillTone } from '../../../ui/pill.component';
import { TierPillComponent } from '../../niveis-regras/ui/tier-pill.component';
import {
  brl,
  dayMonthOfKey,
  includedTotals,
  stamp,
  type Payout,
  type PlanRow,
  type PlanStatus,
} from '../data/commission';
import { AmbassadorAvatarComponent } from './ambassador-avatar.component';

const STATUS: Record<PlanStatus, { label: string; tone: PillTone }> = {
  included: { label: 'Incluído', tone: 'green' },
  accumulating: { label: 'Acumulando', tone: 'dim' },
  held: { label: 'Retido', tone: 'yellow' },
};

const PAYOUT_STATUS: Record<Payout['status'], { label: string; tone: PillTone }> = {
  done: { label: 'Concluído', tone: 'green' },
  partial: { label: 'Parcial', tone: 'yellow' },
  processing: { label: 'Processando', tone: 'orange' },
};

/** Drawer "Repasse de {data}": quem entra, quem acumula, quem está retido — e o aprovar. */
@Component({
  selector: 'bo-payout-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PillComponent, TierPillComponent, AmbassadorAvatarComponent],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="backdrop" (click)="close()"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="payout-title">
      <header>
        <div>
          <h2 id="payout-title">Repasse de {{ date() }}</h2>
          <p>Fecha {{ closing() }} às 23:59 · mínimo {{ brl(minNetCents()) }} por embaixador; abaixo disso, acumula para o próximo.</p>
        </div>
        <button type="button" class="x" aria-label="Fechar" (click)="close()">✕</button>
      </header>

      @if (rows().length === 0) {
        <p class="empty">Nenhuma comissão liberada até o fechamento.</p>
      } @else {
        <div class="list" role="table" aria-label="Embaixadores do repasse">
          <div class="row head" role="row">
            <span role="columnheader">Embaixador</span>
            <span role="columnheader" class="num">Comissões</span>
            <span role="columnheader" class="num">Bruto</span>
            <span role="columnheader" class="num">Ajustes</span>
            <span role="columnheader" class="num">Líquido</span>
            <span role="columnheader">Status</span>
            <span role="columnheader"><span class="sr">Ações</span></span>
          </div>
          @for (r of rows(); track r.ambassadorId) {
            <div class="row" role="row">
              <span role="cell" class="amb">
                <bo-ambassador-avatar [id]="r.ambassadorId" [name]="r.ambassadorName" [size]="28" />
                <span class="name">
                  <strong>{{ r.ambassadorName || 'Embaixador' }}</strong>
                  @if (r.ambassadorTier) {
                    <bo-tier-pill [tier]="r.ambassadorTier" size="sm" />
                  }
                </span>
              </span>
              <span role="cell" class="num mono">{{ r.commissionIds.length + r.heldCommissionIds.length }}</span>
              <span role="cell" class="num mono">{{ brl(r.grossCents) }}</span>
              <span role="cell" class="num mono" [class.neg]="r.adjustmentsCents < 0">{{ r.adjustmentsCents ? brl(r.adjustmentsCents) : '—' }}</span>
              <span role="cell" class="num mono strong">{{ brl(r.netCents) }}</span>
              <span role="cell" [attr.title]="r.holdReason ?? null"><bo-pill [tone]="status(r).tone">{{ status(r).label }}</bo-pill></span>
              <span role="cell" class="act">
                @if (canHold()) {
                  @if (r.status === 'held' || r.heldCommissionIds.length > 0) {
                    <button type="button" class="link" [disabled]="busy()" (click)="unhold.emit(r)">Desfazer</button>
                  } @else if (r.commissionIds.length > 0) {
                    <button type="button" class="link" [disabled]="busy()" (click)="startHold(r)">Reter</button>
                  }
                }
              </span>
            </div>
            @if (holding() === r.ambassadorId) {
              <div class="hold">
                <label>
                  <span>Motivo da retenção de {{ r.ambassadorName }} (vai para o log)</span>
                  <textarea class="bo-input" rows="2" maxlength="280" placeholder="Ex.: suspeita de fraude, contrato pausado"
                    [value]="reason()" (input)="reason.set(value($event))"></textarea>
                </label>
                <div class="hold-actions">
                  <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="holding.set(null)">Cancelar</button>
                  <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || reason().trim().length < 3"
                    (click)="confirmHold(r)">Reter neste repasse</button>
                </div>
              </div>
            }
          }
        </div>
      }

      @if (error(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }

      <button type="button" class="history-toggle" [attr.aria-expanded]="showHistory()" (click)="showHistory.set(!showHistory())">
        Repasses anteriores ({{ history().length }})
      </button>
      @if (showHistory()) {
        <ul class="history">
          @for (p of history(); track p.id) {
            <li>
              <strong>{{ day(p.id) }}</strong>
              <bo-pill [tone]="payoutStatus(p).tone">{{ payoutStatus(p).label }}</bo-pill>
              <span class="mono">{{ brl(p.totalCents) }}</span>
              <span class="dim">{{ p.creditedCount }} {{ p.creditedCount === 1 ? 'embaixador' : 'embaixadores' }}{{ p.approvedBy ? ' · ' + p.approvedBy : '' }}{{ p.approvedAt ? ' · ' + stamp(p.approvedAt) : '' }}</span>
            </li>
          } @empty {
            <li class="dim">Nenhum repasse aprovado ainda.</li>
          }
        </ul>
      }

      <footer>
        <div class="total">
          <span>Total líquido</span>
          <strong>{{ brl(totals().totalCents) }}</strong>
          <span>{{ totals().count }} {{ totals().count === 1 ? 'embaixador' : 'embaixadores' }}</span>
        </div>
        @if (canApprove()) {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="busy() || totals().count === 0" (click)="approve.emit()">
            Aprovar repasse
          </button>
        }
      </footer>
    </aside>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.5); }
    .drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; width: min(820px, 100%); display: flex; flex-direction: column; gap: 16px; padding: 22px 22px 0; overflow-y: auto; background: var(--nx-surface-0); border-left: 1px solid var(--nx-line-strong); box-shadow: -24px 0 48px rgba(0, 0, 0, 0.45); }
    header { display: flex; align-items: flex-start; gap: 12px; }
    header div { flex: 1; }
    h2 { margin: 0 0 4px; font-family: var(--nx-font-display); font-weight: 700; font-size: 18px; }
    header p { margin: 0; font-size: 12.5px; color: var(--nx-text-dim); }
    .x { width: 32px; height: 32px; border: none; border-radius: var(--nx-r-2); background: transparent; color: var(--nx-text-mute); cursor: pointer; }
    .empty { margin: 0; font-size: 13px; color: var(--nx-text-dim); }
    .list { border: 1px solid var(--nx-line); border-radius: var(--nx-r-3); overflow-x: auto; }
    .row { display: grid; grid-template-columns: minmax(170px, 1.6fr) 64px 88px 84px 92px 100px 64px; gap: 10px; align-items: center; min-width: 720px; min-height: 56px; padding: 0 12px; border-top: 1px solid var(--nx-line); font-size: 13px; }
    .row.head { min-height: 40px; border-top: none; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .amb { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .name { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
    .name strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .num { text-align: right; }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; }
    .strong { font-weight: 700; }
    .neg { color: var(--nx-live); }
    .act { text-align: right; }
    .link { padding: 4px 6px; border: none; background: none; color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .link:disabled { opacity: 0.5; cursor: default; }
    .hold { padding: 12px; border-top: 1px dashed var(--nx-line-strong); background: var(--nx-surface-1); display: flex; flex-direction: column; gap: 8px; }
    .hold label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--nx-text-mute); }
    textarea.bo-input { height: auto; padding: 9px 11px; resize: vertical; }
    .hold-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .error { margin: 0; font-size: 12.5px; color: var(--nx-live); }
    .history-toggle { align-self: flex-start; padding: 0; border: none; background: none; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; text-decoration: underline; cursor: pointer; }
    .history { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .history li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; }
    .dim { color: var(--nx-text-dim); }
    footer { position: sticky; bottom: 0; margin: auto -22px 0; padding: 14px 22px; display: flex; align-items: center; gap: 16px; background: var(--nx-surface-0); border-top: 1px solid var(--nx-line-strong); }
    .total { flex: 1; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--nx-text-dim); }
    .total strong { font-family: var(--nx-font-display); font-weight: 800; font-size: 20px; color: var(--nx-text); }
  `,
})
export class PayoutDrawerComponent {
  readonly payoutDate = input.required<string>();
  readonly rows = input.required<PlanRow[]>();
  readonly history = input<Payout[]>([]);
  readonly minNetCents = input.required<number>();
  readonly canApprove = input(false);
  readonly canHold = input(false);
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly closed = output<void>();
  readonly approve = output<void>();
  readonly hold = output<{ row: PlanRow; reason: string }>();
  readonly unhold = output<PlanRow>();

  protected readonly holding = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly showHistory = signal(false);

  protected readonly brl = brl;
  protected readonly stamp = stamp;
  protected readonly day = dayMonthOfKey;
  protected readonly date = computed(() => dayMonthOfKey(this.payoutDate()));
  protected readonly totals = computed(() => includedTotals(this.rows()));
  protected readonly closing = computed(() => {
    const d = new Date(`${this.payoutDate()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('/');
  });

  protected status(r: PlanRow) {
    return STATUS[r.status];
  }

  protected payoutStatus(p: Payout) {
    return PAYOUT_STATUS[p.status];
  }

  protected startHold(r: PlanRow): void {
    this.reason.set('');
    this.holding.set(r.ambassadorId);
  }

  protected confirmHold(r: PlanRow): void {
    this.hold.emit({ row: r, reason: this.reason().trim() });
    this.holding.set(null);
  }

  protected close(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
