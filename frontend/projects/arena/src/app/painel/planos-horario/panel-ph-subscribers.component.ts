import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { shortDate } from '../aulas/class.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { PhAddSubscriberModalComponent } from './ph-add-subscriber-modal.component';
import { PhSubscriberDetailComponent } from './ph-subscriber-detail.component';
import { PhPageComponent } from './planos-horario-ui';
import {
  matchesFilter,
  nextDueDate,
  playersLabel,
  slotCourtsLabel,
  subscriptionSlotsLabel,
  subscribersCsv,
  type SubscriberFilter,
  type SubscriberState,
} from './schedule-plan.logic';
import { CYCLE_LABEL, type ScheduleSubscription } from './schedule-plan.model';
import { SchedulePlansStore } from './schedule-plans.store';

interface Row {
  sub: ScheduleSubscription;
  state: SubscriberState;
  nextDue: string | null;
}

const FILTERS: ReadonlyArray<{ id: SubscriberFilter; label: string; param: string }> = [
  { id: 'all', label: 'Todos', param: '' },
  { id: 'ok', label: 'Em dia', param: 'em-dia' },
  { id: 'late', label: 'Atrasados', param: 'atrasados' },
  { id: 'paused', label: 'Pausados', param: 'pausados' },
  { id: 'leaving', label: 'Saindo', param: 'saindo' },
];

/** 04 · Assinantes — filtros por situação, tabela e o detalhe do selecionado com as ações. */
@Component({
  selector: 'ar-panel-ph-subscribers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PhPageComponent, PhSubscriberDetailComponent, PhAddSubscriberModalComponent, PanelCardComponent, PillComponent, AvatarComponent, IconComponent],
  template: `
    <ar-ph-page [subtitle]="'Assinantes · ' + activeCount() + ' ativo' + (activeCount() === 1 ? '' : 's')" tab="assinantes" [empty]="!store.loading() && store.subscriptions().length === 0">
      <div page-actions class="actions">
        <button type="button" class="ar-mini-btn" [disabled]="filtered().length === 0" (click)="exportCsv()"><ar-icon name="download" [size]="14" /> Exportar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="adding.set(true)"><ar-icon name="plus" [size]="14" /> Adicionar assinante</button>
      </div>

      @if (store.loading()) {
        <p class="state">Carregando assinantes…</p>
      } @else if (store.loadError(); as err) {
        <p class="state">{{ err }}</p>
      } @else {
        <div class="layout">
          <ar-panel-card pad="sm" class="table-card">
            <div class="filters">
              @for (f of filters; track f.id) {
                <button type="button" class="ar-chip" [class.active]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }} · {{ counts()[f.id] }}</button>
              }
            </div>
            <div class="ar-table-scroll">
              <div class="table">
                <div class="tr th">
                  <span>Titular</span><span>Plano</span><span>Horário fixo</span><span>Ciclo</span><span>Cobrança</span><span>Repos.</span><span>Status</span>
                </div>
                @for (r of filtered(); track r.sub.id) {
                  <button type="button" class="tr" [class.sel]="selectedId() === r.sub.id" (click)="selectedId.set(r.sub.id)">
                    <span class="who">
                      <ar-avatar [name]="r.sub.holderName" [photoUrl]="r.sub.holderPhotoUrl" [size]="28" />
                      <span class="who-text"><b>{{ r.sub.holderName }}</b><small>{{ players(r.sub.members.length) }}</small></span>
                    </span>
                    <span class="ell mute">{{ r.sub.planName }}</span>
                    <span class="mono">{{ slots(r.sub) }} <i>{{ courts(r.sub) }}</i></span>
                    <span class="mute">{{ cycleLabel[r.sub.cycle] }}</span>
                    <span class="mono" [class.late]="r.state.kind === 'late' || r.state.kind === 'suspended'">{{ r.nextDue ? shortDate(r.nextDue) : '—' }}</span>
                    <span class="mono" [class.dim]="r.sub.makeupBalance === 0">{{ r.sub.makeupBalance }}</span>
                    <span><ar-pill [tone]="r.state.tone">{{ r.state.label }}</ar-pill></span>
                  </button>
                } @empty {
                  <p class="state pad">{{ store.subscriptions().length === 0 ? 'Nenhum assinante ainda. Quando um atleta assinar pelo app ou você adicionar, ele aparece aqui.' : 'Ninguém nessa situação.' }}</p>
                }
              </div>
            </div>
          </ar-panel-card>

          <div class="side">
            @if (selected(); as r) {
              <ar-ph-subscriber-detail [sub]="r.sub" [state]="r.state" [plan]="store.planById().get(r.sub.planId) ?? null" [readOnly]="readOnly()" />
            } @else {
              <ar-panel-card>
                <p class="state">Escolha um assinante para ver o horário, as mensalidades e as ações.</p>
              </ar-panel-card>
            }
          </div>
        </div>
      }
    </ar-ph-page>

    @if (adding()) {
      <ar-ph-add-subscriber-modal [plans]="activePlans()" (close)="adding.set(false)" />
    }
  `,
  styles: `
    @use 'breakpoints' as ar;
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .state { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; line-height: 1.5; }
    .pad { padding: 18px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    .side { min-width: 0; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; padding: 2px 2px 14px; border-bottom: 1px solid var(--nx-line); }
    .table { min-width: 760px; }
    .tr {
      display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.2fr) 82px 70px 52px 150px; gap: 12px;
      align-items: center; padding: 11px 14px; border: none; border-bottom: 1px solid var(--nx-line); background: transparent;
      width: 100%; text-align: left; color: inherit; font: inherit; cursor: pointer;
    }
    .tr:hover:not(.th) { background: var(--nx-surface-1); }
    .tr.th { cursor: default; padding-top: 12px; padding-bottom: 10px; }
    .th span { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .tr.sel { background: rgba(255, 106, 26, 0.06); box-shadow: inset 2px 0 0 var(--nx-orange-500); }
    .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .who-text { display: flex; flex-direction: column; min-width: 0; }
    .who-text b { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who-text small { font-size: 11px; color: var(--nx-text-dim); }
    .ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mute { font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 11.5px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mono i { font-style: normal; color: var(--nx-text-dim); }
    .mono.dim { color: var(--nx-text-dim); }
    .mono.late { color: var(--nx-pending); }
    @include ar.below(lg) {
      .layout { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelPhSubscribersComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  protected readonly store = inject(SchedulePlansStore);

  protected readonly filters = FILTERS;
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly shortDate = shortDate;
  protected readonly players = playersLabel;
  protected readonly slots = (s: ScheduleSubscription) => subscriptionSlotsLabel(s);
  protected readonly courts = (s: ScheduleSubscription) => slotCourtsLabel(s.slots);
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('planosHorario'));

  protected readonly filter = signal<SubscriberFilter>(
    FILTERS.find((f) => f.param && f.param === this.route.snapshot.queryParamMap.get('filtro'))?.id ?? 'all',
  );
  protected readonly selectedId = signal<string | null>(null);
  protected readonly adding = signal(false);

  protected readonly rows = computed<Row[]>(() => {
    const states = this.store.states();
    const bySub = this.store.chargesBySub();
    return this.store.subscriptions().map((sub) => ({
      sub,
      state: states.get(sub.id) ?? { kind: 'ok', label: 'Em dia', tone: 'green', overdueDays: 0 },
      nextDue: sub.status === 'paused' ? null : nextDueDate(bySub.get(sub.id) ?? []),
    }));
  });
  protected readonly counts = computed(() => {
    const out = { all: 0, ok: 0, late: 0, paused: 0, leaving: 0 } as Record<SubscriberFilter, number>;
    for (const r of this.rows()) for (const f of FILTERS) if (matchesFilter(r.state.kind, f.id)) out[f.id]++;
    return out;
  });
  protected readonly filtered = computed(() => this.rows().filter((r) => matchesFilter(r.state.kind, this.filter())));
  protected readonly selected = computed(() => {
    const rows = this.filtered();
    return rows.find((r) => r.sub.id === this.selectedId()) ?? rows[0] ?? null;
  });
  protected readonly activeCount = computed(() => this.store.subscriptions().filter((s) => s.status === 'active').length);
  protected readonly activePlans = computed(() => this.store.plans().filter((p) => p.status === 'active'));

  protected exportCsv(): void {
    const csv = subscribersCsv(this.filtered());
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assinantes-planos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
