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

/** Novo objetivo (protótipo TrNovoObjetivoScreen) — tela mock: o formulário é interativo
 *  (reactive forms), mas "Criar objetivo" não persiste nada, só navega de volta pro
 *  Plano de evolução. Ver docs/superpowers/specs/2026-07-13-coach-evolucao-lesoes-mock-design.md. */
@Component({
  selector: 'co-panel-novo-objetivo',
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
      <co-page-header title="Novo objetivo" subtitle="Ana Beatriz · Plano de evolução">
        <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="submit()">Criar objetivo</button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Detalhes do objetivo" kicker="Meta individual">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título do objetivo" placeholder="Ex: Melhorar saque" [wide]="true" formControlName="title" />
            <co-form-select label="Fundamento relacionado" [options]="fundamentos" formControlName="fundamento" />
            <co-form-field label="Prazo" placeholder="Selecionar data" formControlName="prazo" />
            <co-form-textarea label="Observações" formControlName="observacoes" />
          </form>
        </co-panel-card>

        <co-panel-card title="Objetivos ativos" kicker="Ana Beatriz">
          <co-row title="Aumentar impulsão" sub="Prazo 01/09/2026">
            <co-pill row-trailing tone="orange">40%</co-pill>
          </co-row>
          <co-row title="Melhorar recepção" sub="Prazo 30/07/2026" [last]="true">
            <co-pill row-trailing tone="green">90%</co-pill>
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
export class PanelNovoObjetivoComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly fundamentos = ['Saque', 'Recepção', 'Ataque', 'Bloqueio', 'Físico'];

  protected readonly form = this.fb.group({
    title: '',
    fundamento: 'Saque',
    prazo: '',
    observacoes: 'Foco em consistência no saque flutuante — meta acordada após avaliação técnica.',
  });

  protected submit(): void {
    void this.router.navigateByUrl('/painel/atletas/plano-evolucao');
  }
}
