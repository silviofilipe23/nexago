import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PillComponent } from '../ui/pill.component';
import {
  hoursLabel,
  PERIOD_LABEL,
  contractEndLine,
  daysAgo,
  maskedPhone,
  money,
  monthYear,
  normalizeSearch,
  statusLabel,
  statusTone,
  customersCsv,
  type CrmCustomer,
  type CrmCustomerStatus,
  monthGames,
  gamesSummary,
  type CrmMonth,
} from './crm.model';
import { CrmUiService } from './crm-ui.service';
import { CrmStore } from './crm.store';

type Filter = 'all' | 'members' | CrmCustomerStatus;

const STATUS_FILTERS: ReadonlyArray<{ id: Filter; label: string; color?: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'members', label: 'Mensalistas' },
  { id: 'active', label: 'Ativo', color: 'var(--nx-win)' },
  { id: 'expiring', label: 'Vencendo', color: 'var(--nx-pending)' },
  { id: 'not_renewed', label: 'Não renovou', color: 'var(--nx-orange-400)' },
  { id: 'overdue', label: 'Inadimplente', color: 'var(--nx-live)' },
  { id: 'canceled', label: 'Cancelado', color: '#9AA0A6' },
  { id: 'walk_in', label: 'Avulsos' },
];

/** Aba Clientes: a base inteira (contratos, Planos de horário e avulsos) com status e horas jogadas por semana. */
@Component({
  selector: 'ar-crm-customers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, PillComponent, IconComponent],
  styleUrls: ['./crm.scss'],
  template: `
    @if (store.overview(); as o) {
      <section class="summary" aria-label="Por status">
        <div class="sum"><div class="label">Ativos</div><div class="sum-v good">{{ o.kpis.byStatus.active }}</div></div>
        <div class="sum"><div class="label">Vencendo</div><div class="sum-v warn">{{ o.kpis.byStatus.expiring }}</div></div>
        <div class="sum"><div class="label">Inadimplentes</div><div class="sum-v red">{{ o.kpis.byStatus.overdue }}</div></div>
        <div class="sum"><div class="label">Não renovaram</div><div class="sum-v orange">{{ o.kpis.byStatus.not_renewed }}</div></div>
        <div class="sum"><div class="label">Avulsos</div><div class="sum-v">{{ o.kpis.byStatus.walk_in }}</div></div>
      </section>

      <div class="bar">
        <div class="chips" role="group" aria-label="Filtrar por status">
          @for (f of filters; track f.id) {
            <button type="button" class="chip" [class.on]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)">
              @if (f.color) { <i class="cdot" [style.background]="f.color"></i> }
              {{ f.label }} <small>{{ counts()[f.id] }}</small>
            </button>
          }
        </div>
        <div class="tools">
          <div class="seg" role="group" aria-label="Vencimento">
            @for (d of dueOptions; track d) {
              <button type="button" [class.on]="due() === d" (click)="due.set(d)">{{ d === 0 ? 'Todos' : 'Dia ' + d }}</button>
            }
          </div>
          <label class="search">
            <ar-icon name="search" [size]="15" />
            <input type="search" placeholder="Nome ou telefone" aria-label="Buscar por nome ou telefone" [value]="query()" (input)="query.set($any($event.target).value)" />
          </label>
          <button type="button" class="btn lg" [disabled]="rows().length === 0" (click)="exportCsv()"><ar-icon name="download" [size]="14" /> CSV</button>
        </div>
      </div>

      <section class="card table-card" aria-label="Lista de clientes">
        <div class="ar-table-scroll">
          <div class="table">
            <div class="tr th"><span>Cliente</span><span>Contrato</span><span>Venc.</span><span>Horas/sem · 6 meses</span><span>Mensal</span><span>Status</span><span>Último jogo</span><span></span></div>
            @for (c of visible(); track c.key) {
              <div class="tr">
                <button type="button" class="who" (click)="ui.openCustomer(c.key)">
                  <ar-avatar [name]="c.name" [photoUrl]="c.photoUrl" [size]="36" />
                  <span class="who-t">
                    <span class="name">{{ c.name }} @if (c.contract?.source === 'schedule_plan') { <i class="tag">App</i> }</span>
                    <span class="sub">{{ masked(c.phone) ?? 'sem telefone' }} · desde {{ since(c) }}</span>
                  </span>
                </button>
                <span class="ct">
                  @if (c.contract; as v) {
                    <span class="name sm">{{ v.planName }}</span><span class="sub">{{ periodLabel[v.period] }} · {{ endLine(v) }}</span>
                  } @else {
                    <span class="name sm mute">Avulso</span><span class="sub">{{ c.conversion ? c.conversion.avulso90d + ' reservas em 90 dias' : games6m(c) }}</span>
                  }
                </span>
                <span><span class="due" [class.off]="!c.contract">{{ c.contract ? pad(c.contract.dueDay) : '—' }}</span></span>
                <span class="freq">
                  <span class="mini" aria-hidden="true">
                    @for (m of c.months; track m.month) {
                      <i [style.height.%]="bar(games(m))"><b [style.height.%]="games(m) ? (m.plan / games(m)) * 100 : 0"></b></i>
                    }
                  </span>
                  <span class="mono" [class.warn]="low(c)">{{ hoursLabel(c.hoursPerWeek ?? 0) }}<small>/sem{{ c.contract ? ' · de ' + hoursLabel(c.contract.weeklyHours) : '' }}</small></span>
                </span>
                <span class="money">{{ c.contract && c.kind === 'member' ? money(c.contract.monthlyPriceReais) : c.conversion ? money(c.conversion.avgMonthlyReais) : '—' }}</span>
                <span><ar-pill [tone]="tone(c)">{{ label(c) }}</ar-pill></span>
                <span class="sub">{{ ago(c.daysSinceVisit) }}</span>
                <span>
                  @if (c.whatsapp) {
                    <a class="icon-btn" [href]="'https://wa.me/' + c.whatsapp" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp de ' + c.name"><ar-icon name="message" [size]="15" /></a>
                  }
                </span>
              </div>
            } @empty {
              <p class="state pad">{{ o.customers.length === 0 ? 'Ninguém ainda. Os clientes aparecem aqui conforme reservam ou viram mensalistas.' : 'Ninguém com esse filtro.' }}</p>
            }
          </div>
        </div>
        <div class="foot">
          <span class="legend"><i class="sw g"></i>Jogos do contrato <i class="sw o"></i>Avulsos</span>
          <span>Mostrando {{ visible().length }} de {{ rows().length }}</span>
          @if (visible().length < rows().length) {
            <button type="button" class="btn" (click)="limit.set(limit() + 100)">Mostrar mais</button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    :host { display: flex; flex-direction: column; gap: 16px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
    .sum { background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: 12px; padding: 12px 14px; }
    .sum-v { font-family: var(--nx-font-display); font-weight: 700; font-size: 22px; margin-top: 4px; color: var(--nx-text); }
    .sum-v.red { color: var(--nx-live); }
    .sum-v.orange { color: var(--nx-orange-400); }
    .bar { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 13px; border-radius: 999px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); color: var(--nx-text-mute); font: 600 12.5px var(--nx-font-ui); cursor: pointer; }
    .chip.on { background: rgba(255,106,26,.12); border-color: rgba(255,106,26,.55); color: var(--nx-orange-400); }
    .chip small { font-family: var(--nx-font-mono); font-size: 10px; opacity: .75; }
    .cdot { width: 7px; height: 7px; border-radius: 50%; }
    .tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .seg button { padding: 7px 12px; border-radius: 8px; font: 600 12.5px var(--nx-font-ui); color: var(--nx-text-mute); background: none; border: none; cursor: pointer; }
    .seg button.on { background: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .search { display: flex; align-items: center; gap: 8px; height: 40px; width: 240px; padding: 0 12px; border-radius: 10px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text-dim); }
    .search input { flex: 1; min-width: 0; background: transparent; border: none; color: var(--nx-text); font: 13px var(--nx-font-ui); outline: none; }
    .table-card { padding: 0; overflow: hidden; }
    .table { min-width: 1080px; }
    .tr { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.1fr) 52px minmax(0, 1.2fr) 86px 150px 96px 40px; gap: 14px; align-items: center; padding: 11px 18px; border-bottom: 1px solid var(--nx-line); }
    .th span { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .who { display: flex; align-items: center; gap: 12px; min-width: 0; background: none; border: none; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .who:hover .name { color: var(--nx-orange-400); }
    .who-t, .ct { display: flex; flex-direction: column; min-width: 0; }
    .name.sm { font-size: 13px; }
    .name.mute { color: var(--nx-text-mute); }
    .tag { font-style: normal; font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--nx-text-mute); border: 1px solid var(--nx-line-strong); border-radius: 6px; padding: 1px 5px; margin-left: 6px; }
    .due { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 28px; border-radius: 8px; background: var(--nx-surface-1); border: 1px solid var(--nx-line); font: 600 12px var(--nx-font-mono); color: var(--nx-text); }
    .due.off { color: var(--nx-text-dim); }
    .freq { display: flex; align-items: center; gap: 10px; }
    .mini { display: flex; align-items: flex-end; gap: 3px; height: 24px; }
    .mini i { width: 7px; min-height: 2px; border-radius: 2px; background: rgba(255,106,26,.45); display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
    .mini b { display: block; background: var(--nx-win); }
    .mono small { color: var(--nx-text-dim); }
    .icon-btn { width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); display: inline-flex; align-items: center; justify-content: center; color: var(--nx-win); }
    .foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 18px; font-size: 12px; color: var(--nx-text-dim); flex-wrap: wrap; }
    .legend { display: inline-flex; gap: 8px; align-items: center; }
    .sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .sw.g { background: var(--nx-win); }
    .sw.o { background: rgba(255,106,26,.45); margin-left: 8px; }
    .pad { padding: 18px; }
    @include ar.below(md) {
      .summary { grid-template-columns: 1fr 1fr; }
      .search { width: 100%; }
    }
  `,
})
export class CrmCustomersComponent {
  protected readonly store = inject(CrmStore);
  protected readonly ui = inject(CrmUiService);

  protected readonly filters = STATUS_FILTERS;
  protected readonly dueOptions = [0, 5, 15, 25];
  protected readonly periodLabel = PERIOD_LABEL;
  protected readonly money = money;
  protected readonly hoursLabel = hoursLabel;
  protected readonly masked = maskedPhone;
  protected readonly endLine = contractEndLine;
  protected readonly ago = daysAgo;
  protected readonly label = statusLabel;
  protected readonly tone = statusTone;

  protected readonly filter = signal<Filter>('members');
  protected readonly due = signal(0);
  protected readonly query = signal('');
  protected readonly limit = signal(100);

  private readonly maxMonth = computed(() => Math.max(1, ...this.store.customers().flatMap((c) => c.months.map(monthGames))));

  protected readonly counts = computed(() => {
    const out = Object.fromEntries(STATUS_FILTERS.map((f) => [f.id, 0])) as Record<Filter, number>;
    for (const c of this.store.customers()) {
      out.all++;
      if (c.kind === 'member') out.members++;
      out[c.status]++;
    }
    return out;
  });

  protected readonly rows = computed(() => {
    const f = this.filter();
    const due = this.due();
    const q = normalizeSearch(this.query());
    const digits = this.query().replace(/\D/g, '');
    return this.store.customers().filter((c) => {
      if (f === 'members' ? c.kind !== 'member' : f !== 'all' && c.status !== f) return false;
      if (due && c.contract?.dueDay !== due) return false;
      if (!q) return true;
      return normalizeSearch(c.name).includes(q) || (digits.length >= 4 && (c.phone ?? '').replace(/\D/g, '').includes(digits));
    });
  });

  protected readonly visible = computed(() => this.rows().slice(0, this.limit()));

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected games(m: CrmMonth): number {
    return monthGames(m);
  }

  protected games6m(c: CrmCustomer): string {
    return gamesSummary(c);
  }

  protected bar(total: number): number {
    return Math.max(8, (total / this.maxMonth()) * 100);
  }

  protected since(c: CrmCustomer): string {
    const dates = [c.firstDate, c.contract?.startDate].filter((d): d is string => !!d).sort();
    return monthYear(dates[0]);
  }

  protected low(c: CrmCustomer): boolean {
    return c.kind === 'member' && !!c.contract && (c.hoursPerWeek ?? 0) < c.contract.weeklyHours / 2;
  }

  protected exportCsv(): void {
    const blob = new Blob(['﻿' + customersCsv(this.rows())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes-${this.store.today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
