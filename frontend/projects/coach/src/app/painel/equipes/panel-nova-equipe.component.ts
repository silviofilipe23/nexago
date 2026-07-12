import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormSelectComponent } from '../ui/form-select.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadsService } from './squads.service';

@Component({
  selector: 'co-panel-nova-equipe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    FormSelectComponent,
    FormTextareaComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Nova equipe" subtitle="Cadastro de equipe">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else {
            Criar equipe
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        <co-panel-card title="Dados da equipe" kicker="Informações básicas">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome da equipe" placeholder="Ex: Equipe Sub-15" formControlName="name" [wide]="true" />
            <co-form-select label="Categoria" [options]="categoryOptions" formControlName="category" />
            <co-form-select label="Naipe" [options]="genderOptions" formControlName="gender" />
            <co-form-textarea label="Descrição" formControlName="description" />
          </form>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
  `,
})
export class PanelNovaEquipeComponent {
  private readonly squadsService = inject(SquadsService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly categoryOptions = ['Sub-15', 'Sub-17', 'Adulto', 'Livre'];
  protected readonly genderOptions = ['Masculino', 'Feminino', 'Misto'];

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    category: ['Sub-15', Validators.required],
    gender: ['Masculino', Validators.required],
    description: [''],
  });

  protected async submit(): Promise<void> {
    this.error.set(null);
    if (this.form.invalid) {
      this.error.set('Informe o nome da equipe.');
      return;
    }
    this.saving.set(true);
    try {
      await this.squadsService.createSquad(this.form.getRawValue());
      void this.router.navigateByUrl('/painel/equipes');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível criar a equipe.');
    } finally {
      this.saving.set(false);
    }
  }
}
