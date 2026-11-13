import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { DrawerComponent } from '../ui/drawer.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaStatComponent, AulasPageComponent } from './aulas-ui';
import { brl, type Charge, type Enrollment } from './billing.model';
import {
  fetchEnrollments,
  fetchPenaltyCharges,
  setEnrollmentStatus,
  undoCancellation,
  waiveCancellationPenalty,
} from './billing-repository';
import {
  CANCEL_REASON_LABEL,
  CANCEL_REASON_SHORT,
  buildCancellationRows,
  canEndNow,
  canUndo,
  canWaive,
  cancellationKpis,
  penaltyMath,
  penaltyPill,
  planLine,
  type CancellationRow,
} from './cancellations.model';
import { shortDate, todayKeyLocal } from './class.model';

type Step = 'view' | 'waive' | 'end';

/** "2026-11-12" → "12/11/2026". */
function fullDate(key: string | null): string {
  if (!key) return '—';
  const [y, m, d] = key.split('-');
  return d && m && y ? `${d}/${m}/${y}` : key;
}

/** Cancelamentos de plano de aula (canvas "Cancelar plano de aula · aviso prévio e multa"): quem
 *  pediu para sair pelo app, a última aula e a multa por quebra de fidelidade. A arena isenta a
 *  multa, encerra na hora ou desfaz o cancelamento. */
@Component({
  selector: 'ar-panel-aulas-cancellations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, AulaStatComponent, PanelCardComponent, PillComponent, AvatarComponent, DrawerComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Alunos que pediram para sair: aviso prévio e multa" tab="cancelamentos">
      @if (loading()) {
        <p class="state-text">Carregando cancelamentos…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        @if (notice(); as n) {
          <p class="notice">{{ n }}</p>
        }
        <div class="stats">
          <ar-aula-stat label="Saindo este mês" [value]="'' + kpis().leavingThisMonth" sub="última aula no mês" />
          <ar-aula-stat label="Multas em aberto" [value]="brl(kpis().openPenaltiesReais)" [tone]="kpis().openPenaltiesReais > 0 ? 'orange' : 'default'" [sub]="kpis().openPenaltiesStudents + ' aluno(s)'" />
          <ar-aula-stat label="Multas pagas" [value]="brl(kpis().paidPenaltiesReais)" tone="green" [sub]="kpis().paidPenaltiesCount + ' no mês'" />
          <ar-aula-stat label="Motivo nº 1" [value]="topReasonShort()" [sub]="topReasonSub()" />
        </div>

        <ar-panel-card>
          <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Cancelamentos">
            <div class="ar-table-inner">
              <div class="t-head"><span>Aluno</span><span>Plano</span><span>Pedido</span><span>Última aula</span><span>Multa</span><span>Motivo</span></div>
              @for (r of rows(); track r.enrollment.id) {
                <button type="button" class="t-row" (click)="open(r)">
                  <span class="who">
                    <ar-avatar [name]="r.enrollment.name" [photoUrl]="r.enrollment.photoUrl" [size]="32" />
                    <span class="name">{{ r.enrollment.name }}</span>
                    @if (r.closed) {
                      <ar-pill tone="dim">Encerrado</ar-pill>
                    }
                  </span>
                  <span class="cell">{{ plan(r.enrollment) }}</span>
                  <span class="mono">{{ short(r.request.requestedOn) }}</span>
                  <span class="mono">{{ short(r.endsOn) }}</span>
                  <span><ar-pill [tone]="pill(r).tone">{{ pill(r).label }}</ar-pill></span>
                  <span class="cell">{{ reasonLabel[r.request.reason] }}</span>
                </button>
              } @empty {
                <p class="state-text empty">Nenhum aluno pediu para sair. Os pedidos feitos pelo app aparecem aqui.</p>
              }
            </div>
          </div>
        </ar-panel-card>
      }
    </ar-aulas-page>

    @if (selected(); as r) {
      <ar-drawer width="560px" [ariaLabel]="'Cancelamento de ' + r.enrollment.name" (close)="close()">
        <div class="drawer">
          <div class="d-head">
            <ar-avatar [name]="r.enrollment.name" [photoUrl]="r.enrollment.photoUrl" [size]="44" />
            <div class="grow">
              <div class="kicker">Cancelamento · {{ plan(r.enrollment) }}</div>
              <h2>{{ r.enrollment.name }}</h2>
            </div>
            <ar-pill [tone]="r.closed ? 'dim' : 'yellow'">{{ r.closed ? 'Encerrado' : 'Saindo' }}</ar-pill>
          </div>
          <div class="kv"><span>Pedido</span><b>{{ full(r.request.requestedOn) }} · pelo app</b></div>
          <div class="kv"><span>Motivo</span><b>{{ reasonLabel[r.request.reason] }}</b></div>
          @if (r.request.note) {
            <p class="note">“{{ r.request.note }}”</p>
          }
          <div class="kv"><span>Última aula</span><b>{{ full(r.endsOn) }}</b></div>
          <div class="kv"><span>Aviso prévio</span><b>{{ r.enrollment.cancellationPolicy.noticeDays > 0 ? r.enrollment.cancellationPolicy.noticeDays + ' dias' : 'Sem aviso' }}</b></div>
          <div class="kv"><span>Fidelidade até</span><b>{{ r.enrollment.commitmentEndsOn ? full(r.enrollment.commitmentEndsOn) : 'Sem fidelidade' }}</b></div>
          <div class="kv"><span>Multa</span><b>{{ math(r) }}</b></div>
          <div class="kv"><span>Situação</span><ar-pill [tone]="pill(r).tone">{{ pill(r).label }}</ar-pill></div>
          @if (r.request.waivedReason) {
            <div class="kv"><span>Isenção</span><b>{{ r.request.waivedReason }}</b></div>
          }
          @if (r.penalty; as pc) {
            @if (pc.status === 'open') {
              <div class="kv"><span>Vencimento da multa</span><b>{{ full(pc.dueDate) }}</b></div>
            }
          }
          <a class="cta" [routerLink]="['/painel/aulas/alunos', r.enrollment.id]">Ver ficha do aluno</a>

          @if (actionError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          @if (!readOnly()) {
            @switch (step()) {
              @case ('waive') {
                <div class="confirm">
                  <div class="field-label">Motivo da isenção</div>
                  <input class="input-box" type="text" maxlength="280" placeholder="Ex.: mudou de cidade por trabalho" aria-label="Motivo da isenção"
                    [value]="waiveReason()" (input)="waiveReason.set($any($event.target).value)" />
                  <div class="modal-actions">
                    <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="step.set('view')">Voltar</button>
                    <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || waiveReason().trim().length < 3" (click)="waive(r)">{{ busy() ? 'Isentando…' : 'Isentar multa' }}</button>
                  </div>
                </div>
              }
              @case ('end') {
                <div class="confirm">
                  <p class="confirm-text">A matrícula de {{ first(r.enrollment.name) }} termina hoje: a vaga fica livre e as mensalidades futuras são canceladas. A multa, se houver, continua.</p>
                  <div class="modal-actions">
                    <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="step.set('view')">Voltar</button>
                    <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="endNow(r)">{{ busy() ? 'Encerrando…' : 'Encerrar agora' }}</button>
                  </div>
                </div>
              }
              @default {
                <div class="modal-actions wrap">
                  @if (canUndo(r)) {
                    <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="undo(r)">{{ busy() ? 'Desfazendo…' : 'Desfazer cancelamento' }}</button>
                  }
                  @if (canEndNow(r)) {
                    <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="step.set('end')">Encerrar agora (libera a vaga hoje)</button>
                  }
                  @if (canWaive(r)) {
                    <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="step.set('waive')">Isentar multa</button>
                  }
                </div>
                @if (canUndo(r)) {
                  <p class="hint">Desfazer volta a matrícula ao normal e cancela a multa em aberto.</p>
                }
              }
            }
          }
        </div>
      </ar-drawer>
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .notice { font-size: 12.5px; color: var(--nx-text-mute); margin: 0; padding: 10px 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1); }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .t-head, .t-row { display: grid; grid-template-columns: minmax(220px, 1.6fr) minmax(150px, 1.2fr) 70px 90px 150px minmax(150px, 1.2fr); gap: 12px; align-items: center; }
    .t-head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .t-head span, .kicker { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .t-row { width: 100%; padding: 10px 0; background: none; border: none; border-bottom: 1px solid var(--nx-line); text-align: left; cursor: pointer; color: inherit; }
    .t-row:hover .name { color: var(--nx-orange-500); }
    .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cell { font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; color: var(--nx-text-mute); }
    .drawer { padding: 24px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; max-height: 100vh; box-sizing: border-box; }
    .drawer h2 { font-family: var(--nx-font-display); font-size: 20px; margin: 2px 0 0; color: var(--nx-text); }
    .d-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .grow { flex: 1; min-width: 0; }
    .kv { display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 13px; padding: 8px 0; border-bottom: 1px solid var(--nx-line); color: var(--nx-text-mute); }
    .kv b { color: var(--nx-text); font-weight: 600; text-align: right; }
    .note { margin: 0; padding: 10px 12px; border-radius: var(--nx-r-2); background: var(--nx-surface-1); font-size: 13px; color: var(--nx-text-mute); font-style: italic; }
    .cta { color: var(--nx-orange-500); font-weight: 600; font-size: 13px; text-decoration: none; margin-top: 6px; }
    .confirm { margin-top: 12px; padding: 14px; border-radius: var(--nx-r-3, 12px); border: 1px solid var(--nx-line); background: var(--nx-surface-0); }
    .confirm .modal-actions { margin-top: 12px; }
    .confirm-text { margin: 0; font-size: 13px; color: var(--nx-text); line-height: 1.5; }
    .wrap { flex-wrap: wrap; }
    @media (max-width: 1080px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelAulasCancellationsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));
  protected readonly brl = brl;
  protected readonly reasonLabel = CANCEL_REASON_LABEL;
  protected readonly short = shortDate;
  protected readonly full = fullDate;
  protected readonly plan = planLine;
  protected readonly pill = penaltyPill;
  protected readonly math = penaltyMath;
  protected readonly canWaive = canWaive;
  protected readonly canUndo = canUndo;
  protected readonly canEndNow = canEndNow;
  private readonly todayKey = todayKeyLocal();

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  private readonly enrollments = signal<Enrollment[]>([]);
  private readonly penalties = signal<Map<string, Charge>>(new Map());
  protected readonly rows = computed(() => buildCancellationRows(this.enrollments(), this.penalties(), this.todayKey));
  protected readonly kpis = computed(() => cancellationKpis(this.rows(), this.todayKey));
  protected readonly topReasonShort = computed(() => {
    const top = this.kpis().topReason;
    return top ? CANCEL_REASON_SHORT[top.reason] : '—';
  });
  protected readonly topReasonSub = computed(() => {
    const top = this.kpis().topReason;
    return top ? `${top.count} pedido(s) · ${top.label}` : 'sem pedidos';
  });

  private readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.rows().find((r) => r.enrollment.id === this.selectedId()) ?? null);
  protected readonly step = signal<Step>('view');
  protected readonly waiveReason = signal('');
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId, true);
    });
  }

  private async load(arenaId: string, initial = false): Promise<void> {
    if (initial) this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const enrollments = await fetchEnrollments(db, arenaId);
      const withPenalty = enrollments.filter((e) => (e.cancelRequest?.penaltyReais ?? 0) > 0).map((e) => e.id);
      const penalties = await fetchPenaltyCharges(db, withPenalty);
      this.enrollments.set(enrollments);
      this.penalties.set(penalties);
    } catch {
      this.loadError.set('Não foi possível carregar os cancelamentos.');
    } finally {
      this.loading.set(false);
    }
  }

  protected first(name: string): string {
    return name.split(' ')[0] ?? name;
  }

  protected open(r: CancellationRow): void {
    this.selectedId.set(r.enrollment.id);
    this.step.set('view');
    this.waiveReason.set('');
    this.actionError.set(null);
  }

  protected close(): void {
    if (this.busy()) return;
    this.selectedId.set(null);
  }

  protected waive(r: CancellationRow): Promise<void> {
    return this.run(() => waiveCancellationPenalty(arenaFunctions(), r.enrollment.id, this.waiveReason().trim()));
  }

  protected endNow(r: CancellationRow): Promise<void> {
    return this.run(() => setEnrollmentStatus(arenaFunctions(), r.enrollment.id, 'canceled'));
  }

  protected undo(r: CancellationRow): Promise<void> {
    const name = this.first(r.enrollment.name);
    return this.run(async () => {
      const out = await undoCancellation(arenaFunctions(), r.enrollment.id);
      this.notice.set(out.penaltyPaid
        ? `Cancelamento de ${name} desfeito. A multa já estava paga: se quiser devolver, faça por fora.`
        : `Cancelamento de ${name} desfeito: a matrícula segue normal.`);
    });
  }

  /** Executa a ação, recarrega e volta a gaveta ao resumo (fecha sozinha se o pedido sumiu). */
  private async run(action: () => Promise<unknown>): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || this.busy()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
      this.step.set('view');
      this.waiveReason.set('');
      await this.load(arenaId);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }
}
