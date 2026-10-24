import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { formatInstant, monthLabel, todayKey } from '../../domain/dates';
import type { EnrollmentRequest } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import { RegisterRequestModalComponent } from './register-request-modal.component';
import {
  REQUEST_FILTERS,
  REQUEST_TYPE,
  countByFilter,
  filterRequests,
  requestPeriod,
  requestReason,
  requestSituation,
  requestStats,
  type RequestFilter,
} from './request-view';

/** T1 — trancamentos, pausas por lesão e cancelamentos pedidos pelo app ou registrados no balcão. */
@Component({
  selector: 'ct-requests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, StatComponent, PersonComponent, IconComponent, RegisterRequestModalComponent],
  template: `
    <ct-page-header title="Trancamentos e cancelamentos" [subtitle]="subtitle()">
      @if (canRegister()) {
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="registering.set(true)"><ct-icon name="plus" [size]="14" />Registrar pedido</button>
      }
    </ct-page-header>

    <div class="page">
      <div class="ct-stats">
        <ct-stat label="Para revisar" [value]="'' + stats().review" [sub]="stats().reviewSub" [tone]="stats().review ? 'orange' : ''" />
        <ct-stat label="Pausados agora" [value]="'' + stats().pausedNow" [sub]="stats().pausedSub" />
        <ct-stat label="Cancelamentos em aviso" [value]="'' + stats().cancelNotice" [sub]="stats().cancelSub" />
        <ct-stat
          [label]="'Retidos em ' + monthName()"
          [value]="stats().cancelsInMonth ? stats().retained + ' de ' + stats().cancelsInMonth : '0'"
          [sub]="stats().retainedSub"
          [tone]="stats().retained ? 'green' : ''"
        />
      </div>

      <div class="ct-filter-bar">
        @for (f of FILTERS; track f.value) {
          <button type="button" class="ct-chip" [class.active]="filter() === f.value" (click)="filter.set(f.value)">
            {{ f.label }}{{ f.value !== 'all' && counts()[f.value] ? ' · ' + counts()[f.value] : '' }}
          </button>
        }
      </div>

      <section class="ct-card flush">
        <div class="ct-table" style="--cols: minmax(170px, 1.2fr) 150px minmax(150px, 1.4fr) minmax(120px, 1.1fr) minmax(170px, 1.6fr) 100px; --min-w: 940px">
          <div class="ct-thead"><span>Aluno</span><span>Tipo</span><span>Motivo</span><span>Período</span><span>Situação</span><span>Pedido</span></div>
          @for (r of rows(); track r.id) {
            <a class="ct-tr" [class.hi]="r.status === 'pending'" [routerLink]="['/centro', centerId(), 'pedidos', r.id]">
              <ct-person [name]="r.studentName" [sub]="r.className" [colorKey]="r.studentId" [size]="28" />
              <span><span [class]="'ct-pill ' + TYPE[r.type][1]">{{ TYPE[r.type][0] }}</span></span>
              <span class="ct-ellipsis">{{ reason(r) }}</span>
              <span class="ct-mono">{{ period(r) }}</span>
              <span [class]="'ct-ellipsis tone-' + situation(r).tone">{{ situation(r).label }}</span>
              <span class="ct-mono">{{ when(r) }}</span>
            </a>
          } @empty {
            <div class="ct-empty">
              @if (!store.loaded.requests()) {
                Carregando…
              } @else if (store.requests().length) {
                Nenhum pedido neste filtro.
              } @else {
                Nenhum pedido ainda. Quando um aluno trancar, pedir pausa por lesão ou cancelar pelo app, o pedido aparece aqui.
              }
            </div>
          }
        </div>
      </section>
    </div>

    @if (registering()) {
      <ct-register-request-modal (closed)="registering.set(false)" (created)="opened($event)" />
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .tone-yellow { color: var(--nx-pending); }
    .tone-green { color: var(--nx-win); }
    .tone-orange { color: var(--nx-orange-400); }
    .tone-red { color: var(--nx-live); }
    .tone-blue { color: var(--nx-blue); }
    .tone-dim { color: var(--nx-text-dim); }
  `,
})
export class RequestsComponent {
  readonly centerId = input.required<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly router = inject(Router);

  protected readonly FILTERS = REQUEST_FILTERS;
  protected readonly TYPE = REQUEST_TYPE;
  protected readonly reason = requestReason;
  protected readonly period = requestPeriod;
  protected readonly situation = requestSituation;

  protected readonly filter = signal<RequestFilter>('all');
  protected readonly registering = signal(false);

  private readonly tz = computed(() => this.ctx.center()?.timezone ?? 'America/Sao_Paulo');
  private readonly month = computed(() => todayKey(this.tz()).slice(0, 7));
  protected readonly monthName = computed(() => monthLabel(this.month(), true).split(' ')[0]!.toLowerCase());
  protected readonly subtitle = computed(() => `Pedidos feitos pelo app ou na recepção · ${this.monthName()}`);

  /** Registrar no balcão é das callables de gestão (owner/admin). */
  protected readonly canRegister = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  protected readonly stats = computed(() => requestStats(this.store.requests(), this.month(), this.tz()));
  protected readonly counts = computed(() => countByFilter(this.store.requests()));
  protected readonly rows = computed(() => filterRequests(this.store.requests(), this.filter()));

  protected when(r: EnrollmentRequest): string {
    return formatInstant(r.createdAt, this.tz()).split(' ').slice(0, 2).join(' ');
  }

  protected opened(requestId: string): void {
    this.registering.set(false);
    void this.router.navigate(['/centro', this.centerId(), 'pedidos', requestId]);
  }
}
