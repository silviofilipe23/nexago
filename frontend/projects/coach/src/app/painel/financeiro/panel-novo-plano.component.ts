import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { FinanceService } from './finance.service';
import { CYCLE_LABEL, centsToInput, toCents, type PlanCycle } from './finance-rules';

const CYCLES: PlanCycle[] = ['mensal', 'trimestral', 'anual'];
const CYCLE_OPTIONS = CYCLES.map((c) => CYCLE_LABEL[c]);

function cycleFromLabel(label: string): PlanCycle {
  return CYCLES.find((c) => CYCLE_LABEL[c] === label) ?? 'mensal';
}

/** Cria e edita um plano de mensalidade. */
@Component({
  selector: 'co-panel-novo-plano',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormFieldComponent, FormSelectComponent, FormTextareaComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Planos" [subtitle]="editingId ? 'Editar plano' : 'Novo plano'">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving() || !canSubmit()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else if (editingId) {
            Salvar alterações
          } @else {
            Criar plano
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (finance.error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (editingId && finance.ready() && !loaded()) {
          <div class="co-alert" role="alert">Plano não encontrado.</div>
        }

        <co-panel-card title="Dados do plano" kicker="Mensalidade da escola">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome do plano" placeholder="Ex: Mensal" formControlName="name" [wide]="true" [error]="fieldError('name')" />
            <co-form-field label="Valor (R$)" placeholder="180,00" formControlName="amount" [error]="fieldError('amount')" />
            <co-form-select label="Ciclo de cobrança" [options]="cycleOptions" formControlName="cycle" />
            <co-form-textarea label="Descrição" formControlName="description" />
          </form>
          @if (editingId) {
            <p class="note">Mudar o valor não altera as parcelas já geradas.</p>
          }
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter) 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    @media (max-width: 900px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
    .body > co-panel-card:first-child {
      grid-column: 1;
      grid-row: 1 / 3;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    .preview-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .preview-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }
    .note {
      margin: 12px 0 0;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
  `,
})
export class PanelNovoPlanoComponent {
  protected readonly finance = inject(FinanceService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly cycleOptions = CYCLE_OPTIONS;
  /** `null` = criando; com id = editando. */
  protected readonly editingId = this.route.snapshot.paramMap.get('id');

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    amount: ['', Validators.required],
    cycle: [CYCLE_LABEL.mensal],
    description: [''],
  });

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly loaded = signal(false);
  protected readonly canSubmit = computed(() => (this.editingId ? this.loaded() : true));

  constructor() {
    if (!this.editingId) {
      return;
    }
    // Os planos chegam por snapshot; preenche o form assim que o plano aparecer (uma vez).
    const ref = effect(() => {
      const plan = this.finance.plans().find((p) => p.id === this.editingId);
      if (!plan) {
        return;
      }
      this.form.setValue({
        name: plan.name,
        amount: centsToInput(plan.amountCents),
        cycle: CYCLE_LABEL[plan.cycle],
        description: plan.description,
      });
      this.loaded.set(true);
      ref.destroy();
    });
  }

  protected fieldError(field: 'name' | 'amount'): string | null {
    if (!this.submitted()) {
      return null;
    }
    const raw = this.form.getRawValue();
    if (field === 'name') {
      return raw.name.trim() ? null : 'Informe o nome.';
    }
    const cents = toCents(raw.amount);
    return cents !== null && cents > 0 ? null : 'Informe um valor maior que zero.';
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.submitted.set(true);
    const raw = this.form.getRawValue();
    const cents = toCents(raw.amount);
    if (!raw.name.trim() || cents === null || cents <= 0) {
      this.error.set('Revise os campos destacados.');
      return;
    }
    const input = {
      name: raw.name,
      amountCents: cents,
      cycle: cycleFromLabel(raw.cycle),
      description: raw.description,
    };
    this.saving.set(true);
    try {
      if (this.editingId) {
        await this.finance.updatePlan(this.editingId, input);
      } else {
        await this.finance.createPlan(input);
      }
      void this.router.navigateByUrl('/painel/financeiro/planos');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o plano.');
    } finally {
      this.saving.set(false);
    }
  }
}
