import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CheckboxComponent, type CheckboxToggle } from '../../../ui/checkbox.component';
import {
  ORIGIN_LABEL,
  STATUS_META,
  brl,
  statusLabel,
  whenLabel,
  type Commission,
} from '../data/commission';
import { AmbassadorAvatarComponent } from './ambassador-avatar.component';

export const PAGE_SIZE = 50;

/** Tabela de comissões. Checkbox só em `liberada` (é o que dá para reter no repasse). */
@Component({
  selector: 'bo-commissions-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CheckboxComponent, AmbassadorAvatarComponent],
  template: `
    <div class="table" role="table" aria-label="Comissões">
      <div class="row head" role="row">
        <span role="columnheader"><span class="sr">Selecionar</span></span>
        <span role="columnheader">Data</span>
        <span role="columnheader">Embaixador</span>
        <span role="columnheader">Atleta convertido</span>
        <span role="columnheader">Origem</span>
        <span role="columnheader" class="num">Receita líq.</span>
        <span role="columnheader" class="num">%</span>
        <span role="columnheader" class="num">Comissão</span>
        <span role="columnheader">Status</span>
      </div>
      @for (c of pageRows(); track c.id) {
        <div class="row" role="row" tabindex="0" [class.selected]="selected().has(c.id)"
          (click)="open.emit(c)" (keydown.enter)="open.emit(c)">
          <span role="cell" class="check" (click)="$event.stopPropagation()">
            <bo-checkbox
              [checked]="selected().has(c.id)"
              [disabled]="c.status !== 'released' || !canHold()"
              [reason]="c.status !== 'released' ? 'Só comissão liberada entra no repasse' : 'Sem permissão para reter'"
              [ariaLabel]="'Selecionar comissão de ' + c.ambassadorName + ' por ' + c.convertedLabel"
              (checkedChange)="toggle(c, $event)"
            />
          </span>
          <span role="cell" class="dim">{{ when(c) }}</span>
          <span role="cell" class="amb">
            <bo-ambassador-avatar [id]="c.ambassadorId" [name]="c.ambassadorName" />
            <strong>{{ c.ambassadorName }}</strong>
          </span>
          <span role="cell" class="athlete">{{ c.convertedLabel }}</span>
          <span role="cell" class="dim">{{ originLabel[c.origin] }}</span>
          <span role="cell" class="num mono">{{ brl(c.netCents) }}</span>
          <span role="cell" class="num mono dim">{{ pct(c.pct) }}%</span>
          <span role="cell" class="num mono" [class.void]="c.status === 'canceled'">{{ brl(c.amountCents) }}</span>
          <span role="cell" class="status" [class]="'status ' + tone(c)">
            <i aria-hidden="true"></i>{{ label(c) }}
            @if (c.hold && c.hold.payoutDate === openDate()) {
              <span class="held" [attr.title]="'Retida no repasse de ' + c.hold.payoutDate + ': ' + c.hold.reason">· retida</span>
            }
          </span>
        </div>
      }
    </div>
    @if (rows().length > pageSize) {
      <nav class="pager" aria-label="Paginação">
        <span>{{ first() }}–{{ last() }} de {{ rows().length }}</span>
        <button type="button" class="bo-mini-btn" [disabled]="page() === 0" (click)="pageChange.emit(page() - 1)">Anterior</button>
        <button type="button" class="bo-mini-btn" [disabled]="last() >= rows().length" (click)="pageChange.emit(page() + 1)">Próxima</button>
      </nav>
    }
  `,
  styles: `
    :host { display: block; }
    .table { border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); overflow-x: auto; }
    .row { display: grid; grid-template-columns: 44px 96px minmax(160px, 1.2fr) minmax(130px, 1fr) 64px 104px 48px 96px minmax(180px, 1.2fr); gap: 12px; align-items: center; min-width: 1000px; min-height: 66px; padding: 0 16px; border-top: 1px solid var(--nx-line); font-size: 13.5px; cursor: pointer; }
    .row:hover, .row.selected { background: rgba(255, 255, 255, 0.025); }
    .row:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: -2px; }
    .row.head { min-height: 52px; border-top: none; cursor: default; font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .row.head:hover { background: none; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .check { display: flex; justify-content: center; }
    .dim { color: var(--nx-text-dim); }
    .amb { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .amb strong, .athlete { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .amb strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; }
    .athlete { color: var(--nx-text-mute); }
    .num { text-align: right; }
    .mono { font-family: var(--nx-font-mono); font-weight: 500; font-size: 13px; }
    .void { color: var(--nx-text-dim); text-decoration: line-through; }
    .status { display: flex; align-items: center; gap: 7px; font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: currentColor; }
    .yellow { color: var(--nx-pending); }
    .green { color: var(--nx-win); }
    .red { color: var(--nx-live); }
    .dim.status { color: var(--nx-text-mute); }
    .held { font-weight: 500; color: var(--nx-text-dim); }
    .pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; font-size: 12.5px; color: var(--nx-text-dim); }
  `,
})
export class CommissionsTableComponent {
  readonly rows = input.required<Commission[]>();
  readonly page = input(0);
  readonly selected = input.required<ReadonlySet<string>>();
  readonly canHold = input(false);
  readonly now = input.required<Date>();
  /** Repasse em aberto: retenção de ciclo já fechado não vale mais. */
  readonly openDate = input<string | null>(null);

  readonly open = output<Commission>();
  readonly selectedChange = output<ReadonlySet<string>>();
  readonly pageChange = output<number>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly originLabel = ORIGIN_LABEL;
  protected readonly brl = brl;
  protected readonly pageRows = computed(() => this.rows().slice(this.page() * PAGE_SIZE, (this.page() + 1) * PAGE_SIZE));
  protected readonly first = computed(() => this.page() * PAGE_SIZE + 1);
  protected readonly last = computed(() => Math.min(this.rows().length, (this.page() + 1) * PAGE_SIZE));

  protected when(c: Commission): string {
    return whenLabel(c.registeredAt, this.now());
  }

  protected label(c: Commission): string {
    return statusLabel(c);
  }

  protected tone(c: Commission): string {
    return STATUS_META[c.status].tone;
  }

  protected pct(n: number): string {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  protected toggle(c: Commission, e: CheckboxToggle): void {
    const next = new Set(this.selected());
    if (e.checked) next.add(c.id);
    else next.delete(c.id);
    this.selectedChange.emit(next);
  }
}
