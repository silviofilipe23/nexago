import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { RowComponent } from '../ui/row.component';

/** Registro de lesão (protótipo TrRegistroLesaoScreen) — tela mock: formulário interativo,
 *  mas "Salvar registro" não persiste nada, só navega de volta pra Lesões.
 *  Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-registro-lesao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    FormSelectComponent,
    FormTextareaComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
    PillComponent,
    RowComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Registrar lesão" subtitle="Nova ficha de lesão">
        <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="submit()">Salvar registro</button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Dados da lesão" kicker="Ficha médica">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Atleta" formControlName="athlete" />
            <co-form-field label="Tipo de lesão" placeholder="Ex: Entorse de tornozelo grau I" formControlName="type" />
            <co-form-field label="Data da ocorrência" placeholder="dd/mm/aaaa" formControlName="date" />
            <co-form-field label="Previsão de retorno" placeholder="dd/mm/aaaa" formControlName="forecast" />
            <co-form-field label="Médico responsável" placeholder="Nome e especialidade" formControlName="doctor" />
            <co-form-select label="Status" [options]="statusOptions" formControlName="status" />
            <co-form-textarea label="Observações" formControlName="notes" />
          </form>
        </co-panel-card>

        <co-panel-card title="Histórico de lesões" kicker="Lucas Ramos">
          <co-row title="Tendinite no joelho" sub="Fev/2025 · Liberado">
            <co-pill row-trailing tone="green">Resolvida</co-pill>
          </co-row>
          <co-row title="Contusão no antebraço" sub="Ago/2024 · Liberado" [last]="true">
            <co-pill row-trailing tone="green">Resolvida</co-pill>
          </co-row>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  `,
})
export class PanelRegistroLesaoComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly statusOptions = ['Recuperação', 'Liberado', 'Restrição'];

  protected readonly form = this.fb.group({
    athlete: 'Lucas Ramos',
    type: '',
    date: '',
    forecast: '',
    doctor: '',
    status: 'Recuperação',
    notes: '',
  });

  protected submit(): void {
    void this.router.navigateByUrl('/painel/lesoes');
  }
}
