import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AthletesService } from '../atletas/athletes.service';
import { FormFieldComponent } from '../ui/form-field.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { localIsoDate } from '../treinos/training-rules';
import { FinanceService } from './finance.service';
import { CYCLE_LABEL, DEFAULT_INSTALLMENTS, formatBRL, formatDate, formatShortDate, generateCharges } from './finance-rules';

type Confirming = 'trocar' | 'encerrar' | null;

/** Matricula um aluno num plano (gerando as parcelas) e gerencia a matrícula existente. */
@Component({
  selector: 'co-panel-matricular',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, FormFieldComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Matrícula" subtitle="Aluno e plano de mensalidade">
        <a class="co-mini-btn" routerLink="/painel/financeiro">Pagamentos</a>
      </co-page-header>

      <div class="body">
        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (info(); as msg) {
          <div class="info" role="status">{{ msg }}</div>
        }

        <co-panel-card title="Aluno" kicker="Quem será cobrado">
          <label class="lbl" for="aluno">Aluno</label>
          <select id="aluno" class="select" (change)="chooseAthlete($any($event.target).value)">
            <option value="" [selected]="!athleteUid()">Selecione…</option>
            @for (a of roster(); track a.athleteUid) {
              <option [value]="a.athleteUid" [selected]="a.athleteUid === athleteUid()">{{ a.displayName }}</option>
            }
          </select>
          @if (roster().length === 0) {
            <p class="note">Nenhum atleta vinculado ainda. Convide um atleta em Atletas.</p>
          }
        </co-panel-card>

        @if (athleteUid() && enrollment(); as e) {
          <co-panel-card title="Matrícula atual" [kicker]="currentPlan()?.name ?? 'Plano removido'">
            <p class="note">
              {{ e.athleteName }} · {{ currentPlan() ? money(currentPlan()!.amountCents) + ' · ' + cycleLabel() : '' }} ·
              início {{ date(e.startDate) }} · vence todo dia {{ e.dueDay }}
            </p>

            <form [formGroup]="form" class="grid">
              <co-form-field label="Parcelas a gerar" type="number" formControlName="count" [error]="countError()" />
            </form>
            <div class="actions">
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busy() || !currentPlan()" (click)="generateMore()">Gerar próximos</button>
              <button type="button" class="co-mini-btn" [disabled]="busy()" (click)="confirming.set('trocar')">Trocar plano</button>
              <button type="button" class="co-ghost-btn danger" [disabled]="busy()" (click)="confirming.set('encerrar')">Encerrar matrícula</button>
            </div>

            @if (confirming() === 'trocar') {
              <div class="confirm">
                <label class="lbl" for="novo-plano">Novo plano</label>
                <select id="novo-plano" class="select" (change)="planId.set($any($event.target).value)">
                  <option value="" [selected]="!planId()">Selecione…</option>
                  @for (p of switchPlans(); track p.id) {
                    <option [value]="p.id" [selected]="p.id === planId()">{{ p.name }} · {{ money(p.amountCents) }}</option>
                  }
                </select>
                <p class="note">As parcelas pendentes de hoje em diante serão canceladas e substituídas pelas do plano novo. Pagas e vencidas ficam como estão.</p>
                <div class="actions">
                  <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busy() || !selectedPlan()" (click)="changePlan()">Confirmar troca</button>
                  <button type="button" class="co-ghost-btn" (click)="confirming.set(null)">Voltar</button>
                </div>
              </div>
            }
            @if (confirming() === 'encerrar') {
              <div class="confirm">
                <p class="note">Encerrar cancela as parcelas pendentes de hoje em diante. Pagas e vencidas ficam no histórico.</p>
                <div class="actions">
                  <button type="button" class="co-ghost-btn danger" [disabled]="busy()" (click)="endEnrollment()">Encerrar agora</button>
                  <button type="button" class="co-ghost-btn" (click)="confirming.set(null)">Voltar</button>
                </div>
              </div>
            }
          </co-panel-card>
        } @else if (athleteUid()) {
          <co-panel-card title="Plano" kicker="O que será cobrado">
            <label class="lbl" for="plano">Plano</label>
            <select id="plano" class="select" (change)="planId.set($any($event.target).value)">
              <option value="" [selected]="!planId()">Selecione…</option>
              @for (p of activePlans(); track p.id) {
                <option [value]="p.id" [selected]="p.id === planId()">{{ p.name }} · {{ money(p.amountCents) }} · {{ cycleName(p.cycle) }}</option>
              }
            </select>
            @if (finance.ready() && activePlans().length === 0) {
              <p class="note">Nenhum plano ativo. <a routerLink="/painel/financeiro/planos/novo">Criar plano</a></p>
            }

            <form [formGroup]="form" class="grid">
              <co-form-field label="Início" type="date" formControlName="startDate" />
              <co-form-field label="Dia do vencimento (1 a 28)" type="number" formControlName="dueDay" [error]="dueDayError()" />
              <co-form-field label="Parcelas a gerar" type="number" formControlName="count" [error]="countError()" />
            </form>

            @if (preview().length > 0) {
              <p class="preview">
                Vai gerar {{ preview().length }} parcela{{ preview().length === 1 ? '' : 's' }} de {{ money(selectedPlan()!.amountCents) }} ·
                {{ shortDate(preview()[0]!.dueDate) }} a {{ shortDate(preview()[preview().length - 1]!.dueDate) }}
              </p>
            }
            <div class="actions">
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="busy() || !canEnroll()" (click)="enroll()">
                @if (busy()) {
                  Salvando…
                } @else {
                  Matricular
                }
              </button>
            </div>
          </co-panel-card>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter, 32px) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 760px;
    }
    .lbl {
      display: block;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 6px;
    }
    .select {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 16px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .note {
      margin: 10px 0 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
      line-height: 1.5;
    }
    .preview {
      margin: 14px 0 0;
      font-size: 13px;
      color: var(--nx-text);
    }
    .info {
      padding: 10px 14px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-tint);
      color: var(--nx-text);
      font-size: 13px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .confirm {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
    }
    .danger {
      color: var(--nx-red-500, #ff5b5b);
    }
  `,
})
export class PanelMatricularComponent {
  protected readonly finance = inject(FinanceService);
  private readonly athletesService = inject(AthletesService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    startDate: [localIsoDate()],
    dueDay: [String(Math.min(28, new Date().getDate()))],
    count: ['12'],
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly athleteUid = signal(this.route.snapshot.queryParamMap.get('aluno') ?? '');
  protected readonly planId = signal('');
  protected readonly confirming = signal<Confirming>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  protected readonly roster = computed(() =>
    [...this.athletesService.roster()].sort((a, b) => a.displayName.localeCompare(b.displayName)),
  );
  protected readonly activePlans = computed(() => this.finance.plans().filter((p) => p.active));
  protected readonly enrollment = computed(
    () => this.finance.enrollments().find((e) => e.athleteUid === this.athleteUid() && e.status === 'ativa') ?? null,
  );
  protected readonly currentPlan = computed(() => this.finance.plans().find((p) => p.id === this.enrollment()?.planId) ?? null);
  protected readonly switchPlans = computed(() => this.activePlans().filter((p) => p.id !== this.enrollment()?.planId));
  protected readonly selectedPlan = computed(() => this.finance.plans().find((p) => p.id === this.planId()) ?? null);
  protected readonly athleteName = computed(
    () => this.roster().find((a) => a.athleteUid === this.athleteUid())?.displayName ?? this.enrollment()?.athleteName ?? '',
  );

  private readonly count = computed(() => Number(this.formValue().count));
  private readonly dueDay = computed(() => Number(this.formValue().dueDay));
  private readonly inputsValid = computed(
    () =>
      Number.isInteger(this.dueDay()) &&
      this.dueDay() >= 1 &&
      this.dueDay() <= 28 &&
      Number.isInteger(this.count()) &&
      this.count() >= 1 &&
      this.count() <= 36,
  );

  protected readonly preview = computed(() => {
    const plan = this.selectedPlan();
    if (!plan || !this.inputsValid() || !this.formValue().startDate) {
      return [];
    }
    return generateCharges({
      cycle: plan.cycle,
      amountCents: plan.amountCents,
      startDate: this.formValue().startDate!,
      dueDay: this.dueDay(),
      count: this.count(),
      existingPeriods: [],
    });
  });
  protected readonly canEnroll = computed(() => !!this.athleteUid() && !!this.selectedPlan() && this.preview().length > 0);

  constructor() {
    // Sugere a quantidade padrão do ciclo do plano escolhido — ou, numa matrícula já ativa, do plano atual.
    effect(() => {
      const plan = this.selectedPlan() ?? this.currentPlan();
      if (plan) {
        this.form.controls.count.setValue(String(DEFAULT_INSTALLMENTS[plan.cycle]));
      }
    });
  }

  protected money(cents: number): string {
    return formatBRL(cents);
  }
  protected date(iso: string): string {
    return formatDate(iso);
  }
  protected shortDate(iso: string): string {
    return formatShortDate(iso);
  }
  protected cycleName(cycle: keyof typeof CYCLE_LABEL): string {
    return CYCLE_LABEL[cycle];
  }
  protected cycleLabel(): string {
    const plan = this.currentPlan();
    return plan ? CYCLE_LABEL[plan.cycle] : '';
  }
  protected dueDayError(): string | null {
    return Number.isInteger(this.dueDay()) && this.dueDay() >= 1 && this.dueDay() <= 28 ? null : 'Use um dia de 1 a 28.';
  }
  protected countError(): string | null {
    return Number.isInteger(this.count()) && this.count() >= 1 && this.count() <= 36 ? null : 'Use de 1 a 36 parcelas.';
  }

  protected chooseAthlete(uid: string): void {
    this.athleteUid.set(uid);
    this.planId.set('');
    this.confirming.set(null);
    this.error.set(null);
    this.info.set(null);
  }

  private async run(action: () => Promise<string | void>, failure: string): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    this.busy.set(true);
    try {
      const message = await action();
      if (message) {
        this.info.set(message);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : failure);
    } finally {
      this.busy.set(false);
    }
  }

  protected enroll(): Promise<void> {
    const plan = this.selectedPlan();
    if (!plan || this.dueDayError() || this.countError()) {
      return Promise.resolve();
    }
    return this.run(async () => {
      const n = await this.finance.enroll({
        athleteUid: this.athleteUid(),
        athleteName: this.athleteName(),
        plan,
        startDate: this.formValue().startDate!,
        dueDay: this.dueDay(),
        count: this.count(),
      });
      this.planId.set('');
      return `Matrícula criada com ${n} parcela${n === 1 ? '' : 's'}.`;
    }, 'Não foi possível matricular.');
  }

  protected generateMore(): Promise<void> {
    const e = this.enrollment();
    const plan = this.currentPlan();
    if (!e || !plan || this.countError()) {
      return Promise.resolve();
    }
    return this.run(async () => {
      const n = await this.finance.generateMore(e, plan, this.count());
      return n === 0 ? 'Nenhuma parcela nova: esses períodos já existem.' : `${n} parcela${n === 1 ? '' : 's'} gerada${n === 1 ? '' : 's'}.`;
    }, 'Não foi possível gerar as parcelas.');
  }

  protected changePlan(): Promise<void> {
    const e = this.enrollment();
    const plan = this.selectedPlan();
    if (!e || !plan) {
      return Promise.resolve();
    }
    return this.run(async () => {
      const n = await this.finance.changePlan(e, plan, DEFAULT_INSTALLMENTS[plan.cycle], localIsoDate());
      this.confirming.set(null);
      this.planId.set('');
      return `Plano trocado. ${n} parcela${n === 1 ? '' : 's'} nova${n === 1 ? '' : 's'} do plano ${plan.name}.`;
    }, 'Não foi possível trocar o plano.');
  }

  protected endEnrollment(): Promise<void> {
    const e = this.enrollment();
    if (!e) {
      return Promise.resolve();
    }
    return this.run(async () => {
      await this.finance.endEnrollment(e, localIsoDate());
      this.confirming.set(null);
      return 'Matrícula encerrada.';
    }, 'Não foi possível encerrar a matrícula.');
  }
}
