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
import { PLAN_DEFS } from './panel-planos.component';

function brl(value: number): string {
  return 'R$ ' + value.toLocaleString('pt-BR');
}

/** Novo plano (protótipo TrNovoPlanoScreen) — tela mock: formulário interativo,
 *  mas "Criar plano" não persiste nada, só navega de volta pra Planos.
 *  Ver docs/superpowers/specs/2026-07-13-coach-remaining-screens-mock-design.md. */
@Component({
  selector: 'co-panel-novo-plano',
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
      <co-page-header title="Novo plano" subtitle="Criar plano de mensalidade">
        <button type="button" class="co-mini-btn co-mini-btn-primary" (click)="submit()">Criar plano</button>
      </co-page-header>

      <div class="body">
        <co-panel-card title="Dados do plano" kicker="Nome e valor">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome do plano" placeholder="Ex: Semestral" formControlName="nome" />
            <co-form-field label="Valor" placeholder="R$ 0,00" formControlName="valor" />
            <co-form-select label="Ciclo de cobrança" [options]="ciclos" formControlName="ciclo" />
            <co-form-select label="Cobrança automática" [options]="cobrancaAutomatica" formControlName="automatica" />
            <co-form-textarea label="Descrição" formControlName="descricao" />
          </form>
        </co-panel-card>

        <co-panel-card title="Pré-visualização" kicker="Como o atleta vê">
          <div class="preview-card">
            <div class="preview-head">
              <div class="preview-name">Semestral</div>
              <co-pill tone="orange">0 atletas</co-pill>
            </div>
            <div class="preview-price">
              <span class="preview-value">{{ brl(900) }}</span>
              <span class="preview-cycle">/ semestral</span>
            </div>
            <p class="preview-desc">Treinos regulares, avaliações técnicas e acesso à biblioteca.</p>
          </div>
        </co-panel-card>

        <co-panel-card title="Planos existentes" kicker="Para referência">
          @for (p of existingPlans; track p.id; let last = $last) {
            <co-row [title]="p.nome" [sub]="brl(p.valor) + ' / ' + p.ciclo.toLowerCase()" [last]="last">
              <co-pill row-trailing tone="dim">{{ p.ativos }}</co-pill>
            </co-row>
          }
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
    .body > co-panel-card:first-child {
      grid-column: 1;
      grid-row: 1 / 3;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
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
    .preview-price {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 4px;
    }
    .preview-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-orange-500);
      letter-spacing: -0.02em;
    }
    .preview-cycle {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .preview-desc {
      font-family: var(--nx-font-ui);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      line-height: 1.4;
      margin: 0;
    }
  `,
})
export class PanelNovoPlanoComponent {
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly existingPlans = PLAN_DEFS;
  protected readonly ciclos = ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Por treino'];
  protected readonly cobrancaAutomatica = ['Ativada', 'Desativada'];

  protected readonly form = this.fb.group({
    nome: '',
    valor: '',
    ciclo: 'Mensal',
    automatica: 'Ativada',
    descricao: 'O que este plano inclui — visível para os atletas na confirmação.',
  });

  protected brl(value: number): string {
    return brl(value);
  }

  protected submit(): void {
    void this.router.navigateByUrl('/painel/financeiro/planos');
  }
}
