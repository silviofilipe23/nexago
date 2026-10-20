import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaStatComponent, AulasPageComponent, TeacherAvatarComponent } from './aulas-ui';
import { brl } from './billing.model';
import { shortDate, todayKeyLocal } from './class.model';
import { previewPayouts, watchMonthPayouts } from './payout-repository';
import {
  PAYOUT_STATE_LABEL,
  PAYOUT_STATE_TONE,
  buildPayoutRows,
  defaultPayoutMonth,
  isMonthKey,
  monthLastDay,
  monthLongLabel,
  monthShortLabel,
  payoutBaseLabel,
  payoutModelLabel,
  payoutTotals,
  shiftMonth,
  shortMonthDay,
  type ArenaPayoutPreview,
  type ClassPayout,
  type PayoutRow,
} from './payout.model';

/** 15 · Repasse dos professores no mês — prévia do servidor (`previewArenaClassPayouts`) +
 *  fechamentos gravados (`arenaClassPayouts`). O detalhe de cada professor fecha e registra o
 *  pagamento, que é feito por fora. Só quem lê o financeiro chega aqui (guard da rota). */
@Component({
  selector: 'ar-panel-aulas-payouts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, PillComponent, IconComponent, AulaStatComponent, TeacherAvatarComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Repasse dos professores" subtitle="Fechamento mensal · o pagamento é feito direto ao professor, fora da plataforma" tab="professores" [empty]="!loading() && rows().length === 0">
      <div page-actions class="month-nav">
        <button type="button" class="ar-mini-btn icon" aria-label="Mês anterior" (click)="goMonth(-1)">
          <ar-icon name="chevron-left" [size]="14" />
        </button>
        <span class="month-label">{{ monthLabel() }}</span>
        <button type="button" class="ar-mini-btn icon" aria-label="Próximo mês" [disabled]="month() >= currentMonth" (click)="goMonth(1)">
          <ar-icon name="chevron-right" [size]="14" />
        </button>
      </div>

      @if (loading()) {
        <p class="state-text">Calculando o repasse…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="kpis">
          <ar-aula-stat [label]="'Receita de aulas · ' + monthShort()" [value]="brl(preview()?.revenueReais ?? 0)" tone="green" [sub]="revenueSub()" />
          <ar-aula-stat [label]="'Repasse · ' + monthShort()" [value]="brl(totals().totalReais)" tone="orange" [sub]="totals().teachers + ' professor' + (totals().teachers === 1 ? '' : 'es')" />
          <ar-aula-stat label="Pago" [value]="brl(totals().paidReais)" tone="green" [sub]="totals().paidCount + ' de ' + totals().teachers" />
          <ar-aula-stat label="A pagar" [value]="brl(totals().toPayReais)" [sub]="isCurrent() ? 'fechamento em ' + closingDay() : 'mês encerrado'" />
        </div>

        @if (isCurrent()) {
          <div class="info-banner">Mês em andamento — valores parciais. O fechamento abre em 1º de {{ nextMonthLabel() }}.</div>
        }

        <ar-panel-card title="Professores" [kicker]="monthLabel()">
          <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Repasse por professor">
            <div class="ar-table-inner">
              <div class="table-head">
                <span>Professor</span><span>Modelo</span><span>Aulas</span><span>Alunos</span><span>Base de cálculo</span><span>Valor</span><span>Situação</span><span></span>
              </div>
              @for (r of rows(); track r.teacherId) {
                <a class="table-row" [routerLink]="['/painel/aulas/repasse', r.teacherId]" [queryParams]="{ mes: month() }">
                  <div class="who">
                    <ar-teacher-avatar [name]="r.teacherName" [color]="r.teacherColor" [size]="32" />
                    <div class="name">{{ r.teacherName }}</div>
                  </div>
                  <span class="cell">{{ modelLabel(r) }}</span>
                  <span class="mono">{{ r.figures.classesGiven }}</span>
                  <span class="mono">{{ r.figures.students }}</span>
                  <span class="cell">{{ baseLabel(r) }}</span>
                  <span class="mono value">{{ brl(value(r)) }}</span>
                  <div class="state">
                    <ar-pill [tone]="stateTone[r.state]">{{ stateText(r) }}</ar-pill>
                    @if (r.stale) {
                      <span class="warn">mudou — recalcule</span>
                    } @else if (r.figures.pendingSessions > 0 && !r.closed) {
                      <span class="warn">{{ r.figures.pendingSessions }} sem chamada</span>
                    }
                  </div>
                  <ar-icon name="chevron-right" [size]="14" />
                </a>
              } @empty {
                <p class="state-text empty">Nenhum professor com aula ou receita em {{ monthLabel() }}.</p>
              }
            </div>
          </div>
          <p class="hint">
            Receita = mensalidades e pacotes pagos no mês, rateados pelos horários de cada aluno entre os professores.
            No % da receita, a base desconta a taxa NexaGO das mensalidades pagas online (a manual não tem taxa).
            Aulas e presenças contam só com a chamada fechada.
            @if ((preview()?.unassignedReais ?? 0) > 0) {
              {{ brl(preview()!.unassignedReais) }} de receita sem horário na matrícula não entram em repasse.
            }
          </p>
        </ar-panel-card>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .month-nav { display: flex; align-items: center; gap: 8px; }
    .month-label { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); min-width: 150px; text-align: center; }
    .icon { width: 34px; padding: 0; justify-content: center; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .info-banner {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-text-mute); flex: none;
    }
    .table-head, .table-row {
      display: grid;
      grid-template-columns: minmax(200px, 1.4fr) minmax(130px, 1fr) 60px 60px minmax(130px, 1fr) 110px minmax(150px, 1fr) 20px;
      gap: 12px;
      align-items: center;
    }
    .table-head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span {
      font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .table-row { padding: 12px 0; border-bottom: 1px solid var(--nx-line); text-decoration: none; color: inherit; }
    .table-row:hover .name { color: var(--nx-orange-500); }
    .table-row ar-icon { color: var(--nx-text-dim); }
    .who { display: flex; align-items: center; gap: 11px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .cell { font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; font-weight: 700; color: var(--nx-text); }
    .value { color: var(--nx-orange-500); font-size: 13px; }
    .state { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .warn { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-pending); }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelAulasPayoutsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly brl = brl;
  protected readonly stateTone = PAYOUT_STATE_TONE;
  private readonly today = todayKeyLocal();
  protected readonly currentMonth = this.today.slice(0, 7);

  protected readonly month = signal(this.monthFromUrl());
  protected readonly preview = signal<ArenaPayoutPreview | null>(null);
  private readonly closed = signal<ClassPayout[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly rows = computed(() => buildPayoutRows(this.preview()?.teachers ?? [], this.closed(), this.month(), this.today));
  protected readonly totals = computed(() => payoutTotals(this.rows()));
  protected readonly isCurrent = computed(() => this.month() >= this.currentMonth);
  protected readonly monthLabel = computed(() => monthLongLabel(this.month()));
  protected readonly monthShort = computed(() => monthShortLabel(this.month()));
  protected readonly nextMonthLabel = computed(() => monthLongLabel(shiftMonth(this.month(), 1)).split(' ')[0]);
  protected readonly closingDay = computed(() => shortMonthDay(monthLastDay(this.month())));
  protected readonly revenueSub = computed(() => {
    const fees = this.preview()?.feesReais ?? 0;
    const nexa = this.preview()?.platformFeesReais ?? 0;
    const parts = [
      ...(fees > 0 ? [`sem ${brl(fees)} de taxa de matrícula`] : []),
      ...(nexa > 0 ? [`${brl(nexa)} de taxa NexaGO`] : []),
    ];
    return parts.length ? parts.join(' · ') : 'mensalidades pagas no mês';
  });

  private unsub: Unsubscribe | null = null;
  private loadSeq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsub?.());
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const month = this.month();
      if (arenaId) untracked(() => void this.load(arenaId, month));
    });
  }

  private monthFromUrl(): string {
    const raw = this.route.snapshot.queryParamMap.get('mes');
    return isMonthKey(raw) && raw <= this.today.slice(0, 7) ? raw : defaultPayoutMonth(this.today);
  }

  private async load(arenaId: string, month: string): Promise<void> {
    const seq = ++this.loadSeq;
    this.loading.set(true);
    this.loadError.set(null);
    this.unsub?.();
    this.closed.set([]);
    this.unsub = watchMonthPayouts(arenaFirestore(), arenaId, month, (list) => this.closed.set(list), () => this.closed.set([]));
    try {
      const preview = await previewPayouts(arenaFunctions(), arenaId, month);
      if (seq === this.loadSeq) this.preview.set(preview);
    } catch (err) {
      if (seq === this.loadSeq) {
        this.preview.set(null);
        this.loadError.set(err instanceof Error ? err.message : 'Não foi possível calcular o repasse.');
      }
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  protected goMonth(delta: number): void {
    const next = shiftMonth(this.month(), delta);
    if (next > this.currentMonth) return;
    this.month.set(next);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { mes: next }, replaceUrl: true });
  }

  protected modelLabel(r: PayoutRow): string {
    return payoutModelLabel(r.figures.model);
  }

  protected baseLabel(r: PayoutRow): string {
    return r.figures.model ? payoutBaseLabel(r.figures) : '—';
  }

  protected value(r: PayoutRow): number {
    return r.closed ? r.closed.amountReais : r.figures.amountReais;
  }

  protected stateText(r: PayoutRow): string {
    if (r.state === 'paid' && r.closed?.paidOn) return `Pago ${shortDate(r.closed.paidOn)}`;
    return PAYOUT_STATE_LABEL[r.state];
  }
}
