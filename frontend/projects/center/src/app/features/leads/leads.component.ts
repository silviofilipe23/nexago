import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { monthLabel, monthKey, todayKey } from '../../domain/dates';
import { BannerComponent, PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import {
  FUNNEL,
  LOST_LABEL,
  SOURCE_LABEL,
  byStage,
  durationLabel,
  filterLeads,
  funnelStats,
  interestLine,
  leadFlag,
  lostSummary,
  nextLine,
  pct,
  whenLabel,
  type Lead,
} from './lead-model';
import { LeadFormComponent } from './lead-form.component';
import { LeadsService } from './leads.service';
import { ScheduleTrialComponent } from './schedule-trial.component';

/** Cartões por coluna antes do "+ N". */
const COLUMN_CAP = 12;

/** C1 — Funil de captação: interessados por etapa, do primeiro contato à matrícula. */
@Component({
  selector: 'ct-leads',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, StatComponent, BannerComponent, PersonComponent, LeadFormComponent, ScheduleTrialComponent],
  template: `
    <ct-page-header title="Captação" [subtitle]="subtitle()">
      @if (ctx.can('settings')) {
        <a class="ct-mini-btn" [routerLink]="['/centro', ctx.activeCenterId(), 'configuracoes']" [queryParams]="{ aba: 'captacao' }">Link e QR de captação</a>
      }
      <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="!ctx.canWrite()" (click)="showForm.set(true)">Novo interessado</button>
    </ct-page-header>
    @if (leads.error()) {
      <ct-banner tone="red" title="Algo deu errado">{{ leads.error() }}</ct-banner>
    }
    <div class="page">
      <div class="ct-stats">
        <ct-stat label="Novos interessados" [value]="'' + stats().newThisMonth" [sub]="deltaLabel()" />
        <ct-stat label="Fizeram experimental" [value]="'' + stats().attendedThisMonth" [sub]="pct(stats().attendedThisMonth, stats().newThisMonth) + '% dos interessados'" />
        <ct-stat label="Matricularam" tone="green" [value]="'' + stats().wonThisMonth" [sub]="pct(stats().wonThisMonth, stats().attendedThisMonth) + '% de quem fez experimental'" />
        <ct-stat label="Sem resposta > 24h" [tone]="stats().noReply ? 'red' : ''" [value]="'' + stats().noReply" [sub]="responseLabel()" />
      </div>

      <div class="ct-filter-bar">
        <button type="button" class="ct-chip" [class.active]="!programId()" (click)="programId.set('')">Todos</button>
        @for (p of store.programs(); track p.id) {
          <button type="button" class="ct-chip" [class.active]="programId() === p.id" (click)="programId.set(p.id)">{{ p.name }}</button>
        }
      </div>

      @if (!leads.loaded()) {
        <div class="ct-empty">Carregando…</div>
      } @else {
        <div class="board">
          @for (col of columns(); track col.stage) {
            <section class="col" [attr.aria-label]="col.label">
              <header class="col-h">
                <span class="dot" [style.background]="col.color"></span>
                <span class="ct-disp ct-grow">{{ col.label }}</span>
                <span class="ct-mono n">{{ col.total }}</span>
              </header>
              @for (l of col.items; track l.id) {
                <a class="card" [class.hot]="flag(l) === 'hot'" [routerLink]="['/centro', ctx.activeCenterId(), 'captacao', l.id]">
                  <div class="row">
                    <ct-person class="ct-grow" [name]="l.name" [colorKey]="l.id" [size]="26" />
                    <span class="ct-mono when">{{ when(l) }}</span>
                  </div>
                  <div class="int">{{ interestLine(l) }}</div>
                  <div class="row">
                    <span class="ct-tag">{{ SOURCE_LABEL[l.source] }}</span>
                    <span class="next" [class]="'next ' + (flag(l) ?? '')">{{ next(l) }}</span>
                  </div>
                </a>
              } @empty {
                <div class="none">—</div>
              }
              @if (col.total > col.items.length) {
                <div class="ct-mono more">+ {{ col.total - col.items.length }} {{ col.stage === 'won' ? 'matriculados' : 'interessados' }}</div>
              }
            </section>
          }
        </div>
        <div class="lost">
          <span class="ct-disp">Perdidos · {{ lost().total }}</span>
          <span>{{ lostLine() }}</span>
        </div>
        @if (!leads.leads().length) {
          <div class="ct-empty">
            Nenhum interessado ainda. Cadastre quem chegou no balcão ou pelo WhatsApp em “Novo interessado” — ou ligue a página pública em Configurações › Captação.
          </div>
        }
      }
    </div>

    @if (showForm()) {
      <ct-lead-form (closed)="showForm.set(false)" (saved)="onSaved($event)" />
    }
    @if (scheduling(); as l) {
      <ct-schedule-trial [lead]="l" (closed)="scheduling.set(null)" (finished)="scheduling.set(null)" />
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .board { display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 4px; }
    .col { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); min-width: 0; }
    .col-h { display: flex; align-items: center; gap: 8px; padding: 2px 2px 4px; font-size: 12.5px; }
    .dot { width: 8px; height: 8px; border-radius: 3px; }
    .n { font-size: 11px; font-weight: 700; color: var(--nx-text-mute); }
    .card { padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); display: flex; flex-direction: column; gap: 8px; text-decoration: none; color: inherit; }
    .card:hover, .card:focus-visible { border-color: var(--nx-line-strong); }
    .card.hot { background: rgba(255,106,26,0.07); border-color: rgba(255,106,26,0.45); }
    .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .when { font-size: 9.5px; color: var(--nx-text-dim); white-space: nowrap; }
    .int { font-size: 11.5px; color: var(--nx-text-mute); }
    .next { flex: 1; min-width: 0; font-size: 11px; color: var(--nx-text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .next.late { color: var(--nx-live); } .next.warn { color: var(--nx-pending); } .next.hot { color: var(--nx-orange-400); }
    .none { font-size: 12px; color: var(--nx-text-dim); padding: 4px 2px; }
    .more { font-size: 10px; padding: 4px 2px; color: var(--nx-text-dim); }
    .lost { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--nx-text-dim); }
    .lost .ct-disp { font-size: 12.5px; font-weight: 600; color: var(--nx-text-mute); }
    @media (max-width: 1100px) { .board { grid-template-columns: repeat(5, 240px); } }
  `,
})
export class LeadsComponent implements OnInit {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  protected readonly leads = inject(LeadsService);
  private readonly router = inject(Router);

  protected readonly SOURCE_LABEL = SOURCE_LABEL;
  protected readonly interestLine = interestLine;
  protected readonly pct = pct;

  protected readonly programId = signal('');
  protected readonly showForm = signal(false);
  protected readonly scheduling = signal<Lead | null>(null);

  private readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  private readonly now = new Date();

  protected readonly subtitle = computed(() => `Interessados e aulas experimentais · ${monthLabel(monthKey(this.today()), true).toLowerCase()}`);
  protected readonly filtered = computed(() => filterLeads(this.leads.leads(), this.programId()));
  protected readonly stats = computed(() => funnelStats(this.filtered(), this.today(), this.now, this.ctx.center()?.timezone));
  protected readonly columns = computed(() =>
    FUNNEL.map((f) => {
      const all = byStage(this.filtered(), f.stage);
      return { ...f, total: all.length, items: all.slice(0, COLUMN_CAP) };
    }),
  );
  protected readonly lost = computed(() => lostSummary(this.filtered()));
  protected readonly lostLine = computed(() => this.lost().reasons.map((r) => `${LOST_LABEL[r.reason]} ${r.count}`).join(' · '));

  protected readonly deltaLabel = computed(() => {
    const d = this.stats().newThisMonth - this.stats().newPrevMonth;
    return `${d >= 0 ? '+' : ''}${d} vs. mês passado`;
  });
  protected readonly responseLabel = computed(() => {
    const m = this.stats().avgResponseMin;
    return m == null ? 'tempo de resposta aparece com os primeiros contatos' : `tempo médio de resposta ${durationLabel(m)}`;
  });

  ngOnInit(): void {
    this.leads.watch();
  }

  protected flag(l: Lead) {
    return leadFlag(l, this.leads.settings().alertHours, this.now);
  }

  protected next(l: Lead): string {
    return nextLine(l, this.leads.settings().alertHours, this.today(), this.now);
  }

  protected when(l: Lead): string {
    return whenLabel(l, this.today(), this.now);
  }

  protected onSaved(e: { id: string; schedule: boolean }): void {
    this.showForm.set(false);
    if (!e.schedule) return;
    // O listener traz o doc novo logo depois do commit; sem ele, abre o detalhe.
    const l = this.leads.byId(e.id);
    if (l) this.scheduling.set(l);
    else void this.router.navigate(['/centro', this.ctx.activeCenterId(), 'captacao', e.id], { queryParams: { agendar: 1 } });
  }
}
