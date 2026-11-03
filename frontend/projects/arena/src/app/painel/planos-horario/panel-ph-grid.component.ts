import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { isoWeekdayOf, todayKeyLocal, type ArenaClass } from '../aulas/class.model';
import { fetchClasses } from '../aulas/classes-repository';
import type { ArenaClub } from '../clubinho/club.model';
import { fetchClubs } from '../clubinho/clubs-repository';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { recurringCustomerLabel, type ArenaRecurringBooking } from '../recurring/arena-recurring-booking.model';
import { watchVisibleSeries } from '../recurring/recurring-bookings-repository';
import { ChartTabsComponent } from '../ui/chart-tabs.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { PhBarComponent, PhIconComponent, PhLineComponent, PhPageComponent } from './planos-horario-ui';
import {
  DAY_GROUP_DAYS,
  GRID_HOURS,
  bandOccupancy,
  cellOccupants,
  holdsSlot,
  primeCommitment,
  primeHoursLeft,
  waitlistCountAt,
  windowsLabel,
  type GridBlock,
} from './schedule-plan.logic';
import { CYCLE_LABEL, WEEKDAYS, WEEKDAY_LONG, WEEKDAY_SHORT } from './schedule-plan.model';
import { SchedulePlansStore } from './schedule-plans.store';

const ALL = 'Todas';

/** 03 · Grade da semana — cada célula (hora × dia) tem uma barra por quadra: horário fixo
 *  (planos e séries soltas) laranja, aula/clubinho verde, livre em contorno; badge da fila. */
@Component({
  selector: 'ar-panel-ph-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhPageComponent, PhBarComponent, PhLineComponent, PhIconComponent, PanelCardComponent, PillComponent, ChartTabsComponent, RouterLink],
  template: `
    <ar-ph-page [subtitle]="'Grade da semana · ' + store.activeCourts().length + ' quadra' + (store.activeCourts().length === 1 ? '' : 's')" tab="grade">
      <div page-actions>
        @if (courtTabs().length > 2) {
          <ar-chart-tabs [tabs]="courtTabs()" [active]="courtFilter()" (change)="courtFilter.set($event)" />
        }
      </div>

      @if (store.loading()) {
        <p class="state">Carregando grade…</p>
      } @else if (store.activeCourts().length === 0) {
        <p class="state">Cadastre quadras ativas para ver a grade.</p>
      } @else {
        <div class="layout">
          <ar-panel-card pad="sm">
            <div class="legend">
              <span><i class="sw fixed"></i>Horário fixo</span>
              <span><i class="sw class"></i>Aula ou Clubinho</span>
              <span><i class="sw free"></i>Livre para avulso</span>
              <span><b class="wl">N</b>Na lista de espera</span>
              <span class="legend-note">cada barra é uma quadra</span>
            </div>
            <div class="ar-table-scroll">
              <div class="grid">
                <span></span>
                @for (d of weekdays; track d) {
                  <span class="day">{{ dayShort[d] }}</span>
                }
                @for (h of hours; track h) {
                  <span class="hour" [class.prime]="h >= 18">{{ pad(h) }}h</span>
                  @for (d of weekdays; track d) {
                    @let cell = cellAt(d, h);
                    <button type="button" class="cell" [class.sel]="sel().d === d && sel().h === h" [class.nobre]="isPrimeCell(d, h)"
                      [attr.aria-label]="dayLong[d] + ' ' + pad(h) + ':00'" (click)="sel.set({ d, h })">
                      @for (c of cell.courts; track c.court.id) {
                        <i class="bar" [class.fixed]="c.block?.kind === 'fixed'" [class.class]="c.block?.kind === 'class'"></i>
                      }
                      @if (cell.wl > 0) {
                        <b class="wl abs">{{ cell.wl }}</b>
                      }
                    </button>
                  }
                }
              </div>
            </div>
          </ar-panel-card>

          <div class="side">
            @let s = selectedCell();
            <ar-panel-card [title]="dayLong[sel().d] + ' · ' + pad(sel().h) + ':00'" kicker="Horário selecionado">
              <span card-actions>
                @if (s.free === 0) {
                  <ar-pill tone="yellow">Lotado</ar-pill>
                } @else {
                  <ar-pill tone="green">{{ s.free }} livre{{ s.free === 1 ? '' : 's' }}</ar-pill>
                }
              </span>
              @for (c of s.courts; track c.court.id; let last = $last) {
                <div class="occ" [class.last]="last">
                  <span class="q" [class.fixed]="c.block?.kind === 'fixed'" [class.class]="c.block?.kind === 'class'">{{ c.court.name }}</span>
                  <div class="occ-body">
                    <div class="occ-title">{{ c.block?.title ?? 'Livre para avulso' }}</div>
                    @if (c.block) {
                      <div class="occ-sub">{{ c.block.detail }}</div>
                    }
                  </div>
                </div>
              }
              @if (s.wl > 0) {
                <div class="queue">
                  <ar-ph-icon name="queue" [size]="18" />
                  <div><b>{{ s.wl }} na lista de espera.</b> Quando uma quadra abrir, o 1º da fila recebe a oferta.</div>
                </div>
              }
            </ar-panel-card>

            <ar-panel-card title="Limite para planos" [kicker]="'Horário nobre · ' + primeLabel()">
              <div class="big-row"><span class="big">{{ prime().percent }}%</span><span class="dim">de {{ cap() }}% permitidos</span></div>
              <div class="bar-wrap">
                <ar-ph-bar [v]="prime().percent" [max]="100" [h]="8" />
                <i class="marker" [style.left.%]="cap()"></i>
              </div>
              <p class="note">
                @if (hoursLeft() > 0) {
                  Faltam {{ hoursLeft() }} horas-quadra para travar novas vendas no nobre.
                } @else {
                  O nobre chegou ao limite: novas assinaturas nesse horário são recusadas.
                }
                Os {{ 100 - cap() }}% restantes ficam sempre para avulso.
              </p>
            </ar-panel-card>

            <ar-panel-card title="Onde sobra espaço">
              <div class="lines">
                @for (o of freeBands(); track o.label) {
                  <ar-ph-line [k]="o.label" [v]="o.percent + '% fixo'" [strong]="true" />
                }
              </div>
              @if (freeBands()[0]; as f) {
                <a class="cta" routerLink="/painel/planos-horario/novo" [queryParams]="{ dias: groupDays[f.group].join(','), faixa: f.band.id }">Criar plano para essa faixa →</a>
              }
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-ph-page>
  `,
  styles: `
    @use 'breakpoints' as ar;
    .state { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 350px; gap: 16px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .legend { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; font-size: 11.5px; color: var(--nx-text-mute); }
    .legend span { display: inline-flex; align-items: center; gap: 6px; }
    .legend-note { margin-left: auto; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .sw { width: 10px; height: 10px; border-radius: 3px; }
    .sw.fixed, .bar.fixed { background: var(--nx-orange-500); border-color: transparent; }
    .sw.class, .bar.class { background: var(--nx-win); border-color: transparent; }
    .sw.free { border: 1px solid var(--nx-line-strong); }
    .wl { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 800; color: #0a0a0a; background: var(--nx-pending); border-radius: 4px; padding: 1px 4px; }
    .grid { display: grid; grid-template-columns: 40px repeat(7, minmax(44px, 1fr)); grid-auto-rows: 26px; gap: 3px; min-width: 380px; }
    .grid > span:nth-child(-n + 8) { height: 20px; }
    .day { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 700; color: var(--nx-text-dim); text-align: center; letter-spacing: 0.1em; text-transform: uppercase; align-self: center; }
    .hour { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); align-self: center; }
    .hour.prime { color: var(--nx-text-mute); }
    .cell { position: relative; display: flex; gap: 2px; padding: 3px; border-radius: 6px; border: none; background: transparent; cursor: pointer; min-width: 0; }
    .cell.nobre { background: rgba(255, 255, 255, 0.025); }
    .cell.sel { background: rgba(255, 106, 26, 0.1); outline: 1.5px solid var(--nx-orange-500); }
    .bar { flex: 1; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.07); min-width: 2px; }
    .bar.fixed { opacity: 0.92; }
    .wl.abs { position: absolute; top: -4px; right: -3px; font-size: 8.5px; padding: 0 3px; line-height: 13px; }
    .occ { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--nx-line); }
    .occ.last { border-bottom: none; }
    .q { width: 64px; flex: none; font-family: var(--nx-font-mono); font-weight: 800; font-size: 11.5px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .q.fixed { color: var(--nx-orange-500); }
    .q.class { color: var(--nx-win); }
    .occ-body { flex: 1; min-width: 0; }
    .occ-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .occ-sub { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 2px; }
    .queue { margin-top: 12px; padding: 12px; border-radius: 10px; background: rgba(244, 197, 67, 0.07); border: 1px solid rgba(244, 197, 67, 0.22); display: flex; align-items: center; gap: 10px; color: var(--nx-pending); font-size: 12px; line-height: 1.4; }
    .queue div { color: var(--nx-text-mute); }
    .queue b { color: var(--nx-text); }
    .big-row { display: flex; align-items: baseline; gap: 8px; }
    .big { font-family: var(--nx-font-mono); font-weight: 800; font-size: 26px; color: var(--nx-text); }
    .dim { font-size: 12px; color: var(--nx-text-dim); }
    .bar-wrap { position: relative; margin-top: 12px; }
    .marker { position: absolute; top: -4px; bottom: -4px; width: 2px; border-radius: 2px; background: var(--nx-text); }
    .note { font-size: 11.5px; color: var(--nx-text-dim); margin: 12px 0 0; line-height: 1.45; }
    .lines { display: flex; flex-direction: column; gap: 9px; }
    .cta { display: inline-block; margin-top: 12px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; color: var(--nx-orange-500); text-decoration: none; }
    @include ar.below(lg) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelPhGridComponent {
  private readonly arenaContext = inject(ArenaContextService);
  protected readonly store = inject(SchedulePlansStore);

  protected readonly weekdays = WEEKDAYS;
  protected readonly hours = GRID_HOURS;
  protected readonly dayShort = WEEKDAY_SHORT;
  protected readonly dayLong = WEEKDAY_LONG;
  protected readonly groupDays = DAY_GROUP_DAYS;

  private readonly series = signal<ArenaRecurringBooking[]>([]);
  private readonly classes = signal<ArenaClass[]>([]);
  private readonly clubs = signal<ArenaClub[]>([]);
  protected readonly courtFilter = signal(ALL);
  protected readonly sel = signal({ d: Math.min(5, isoWeekdayOf(todayKeyLocal())), h: 19 });

  protected readonly courtTabs = computed(() => [ALL, ...this.store.activeCourts().map((c) => c.name)]);
  private readonly courts = computed(() => {
    const all = this.store.activeCourts().map((c) => ({ id: c.id, name: c.name }));
    const f = this.courtFilter();
    return f === ALL ? all : all.filter((c) => c.name === f);
  });

  private readonly blocks = computed<GridBlock[]>(() => {
    const today = todayKeyLocal();
    const out: GridBlock[] = [];
    const planSeries = new Set<string>();
    for (const sub of this.store.subscriptions()) {
      if (!holdsSlot(sub)) continue;
      const status = sub.status === 'paused' ? ' · pausado' : sub.status === 'suspended' ? ' · suspenso' : '';
      for (const slot of sub.slots) {
        planSeries.add(slot.seriesId);
        out.push({
          kind: 'fixed', weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime, courtIds: [slot.courtId],
          title: sub.holderName, detail: `${sub.planName} · ${CYCLE_LABEL[sub.cycle].toLowerCase()}${status}`,
        });
      }
    }
    for (const s of this.series()) {
      if (s.status !== 'active' || planSeries.has(s.id) || (s.endDate && s.endDate < today)) continue;
      out.push({
        kind: 'fixed', weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, courtIds: [s.courtId],
        title: recurringCustomerLabel(s), detail: 'Horário fixo (fora de plano)',
      });
    }
    for (const c of this.classes()) {
      if (c.status !== 'active' || (c.endDate && c.endDate < today)) continue;
      for (const weekday of c.weekdays) {
        out.push({
          kind: 'class', weekday, startTime: c.startTime, endTime: c.endTime, courtIds: [c.courtId],
          title: c.name, detail: `Turma · ${c.studentCount} aluno${c.studentCount === 1 ? '' : 's'}`,
        });
      }
    }
    for (const c of this.clubs()) {
      if (c.status !== 'active' || c.weekday == null || (c.endDate && c.endDate < today)) continue;
      out.push({ kind: 'class', weekday: c.weekday, startTime: c.startTime, endTime: c.endTime, courtIds: c.courtIds, title: c.name, detail: 'Clubinho' });
    }
    return out;
  });

  /** Grade inteira (7 × 17) calculada uma vez por mudança de dado/filtro. */
  private readonly cells = computed(() => {
    const blocks = this.blocks();
    const courts = this.courts();
    const waitlist = this.store.waitlist();
    const map = new Map<string, { courts: ReturnType<typeof cellOccupants>; wl: number }>();
    for (const d of WEEKDAYS) {
      for (const h of GRID_HOURS) map.set(`${d}:${h}`, { courts: cellOccupants(blocks, courts, d, h), wl: waitlistCountAt(waitlist, d, h) });
    }
    return map;
  });
  protected readonly selectedCell = computed(() => {
    const { d, h } = this.sel();
    const cell = this.cells().get(`${d}:${h}`) ?? { courts: [], wl: 0 };
    return { ...cell, free: cell.courts.filter((c) => !c.block).length };
  });

  protected readonly cap = computed(() => this.store.settings().primeCapPercent);
  protected readonly prime = computed(() =>
    primeCommitment(this.store.settings().primeWindows, this.store.activeCourts().length, this.store.subscriptions()),
  );
  protected readonly hoursLeft = computed(() => primeHoursLeft(this.prime(), this.cap()));
  protected readonly primeLabel = computed(() => windowsLabel(this.store.settings().primeWindows));
  protected readonly freeBands = computed(() => bandOccupancy(this.store.subscriptions(), this.store.activeCourts().length).slice(0, 3));

  constructor() {
    let unsub: Unsubscribe | null = null;
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      unsub?.();
      unsub = null;
      if (!arenaId) return;
      const db = arenaFirestore();
      unsub = watchVisibleSeries(db, arenaId, (s) => this.series.set(s));
      void fetchClasses(db, arenaId).then((c) => this.classes.set(c)).catch(() => this.classes.set([]));
      void fetchClubs(db, arenaId).then((c) => this.clubs.set(c)).catch(() => this.clubs.set([]));
    });
    inject(DestroyRef).onDestroy(() => unsub?.());
  }

  protected cellAt(d: number, h: number) {
    return this.cells().get(`${d}:${h}`) ?? { courts: [], wl: 0 };
  }

  protected isPrimeCell(d: number, h: number): boolean {
    const from = `${this.pad(h)}:00`;
    return this.store.settings().primeWindows.some((w) => w.weekday === d && w.startTime <= from && w.endTime > from);
  }

  protected pad(h: number): string {
    return String(h).padStart(2, '0');
  }
}
