import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { TrainingsService } from './trainings.service';

@Component({
  selector: 'co-panel-novo-treino',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    FormFieldComponent,
    FormTextareaComponent,
    IconComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PanelShellComponent,
  ],
  template: `
    <co-panel-shell>
      <co-page-header title="Planejamento de treinos" subtitle="Novo treino">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else {
            Salvar treino
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        <co-panel-card title="Detalhes do treino" kicker="Objetivo e horário">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título" placeholder="Ex: Treino técnico · Recepção" formControlName="title" [wide]="true" />
            <co-form-field label="Data" placeholder="AAAA-MM-DD" formControlName="date" />
            <co-form-field label="Início" placeholder="19:00" formControlName="startTime" />
            <co-form-field label="Fim" placeholder="20:30" formControlName="endTime" />
            <co-form-field label="Local" placeholder="Quadra 2 · Arena CFC" formControlName="location" />
            <co-form-textarea label="Materiais" formControlName="materials" />
          </form>
        </co-panel-card>

        <co-panel-card title="Exercícios" kicker="Aquecimento, técnica, tático...">
          @for (ex of exercises(); track $index; let i = $index) {
            <div class="ex-row">
              <span class="ex-label">{{ ex.label }}</span>
              <span class="ex-dur">{{ ex.durationMin }} min</span>
              <button type="button" class="co-ghost-btn" (click)="removeExercise(i)">Remover</button>
            </div>
          }
          <div class="ex-add">
            <input class="ex-input" placeholder="Nome do exercício" [value]="newLabel()" (input)="newLabel.set($any($event.target).value)" />
            <input class="ex-dur-input" type="number" [value]="newDuration()" (input)="newDuration.set(+$any($event.target).value)" />
            <button type="button" class="co-ghost-btn" (click)="addExercise()">
              <co-icon name="plus" [size]="13" />
              Adicionar
            </button>
          </div>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 760px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .ex-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .ex-label {
      flex: 1;
      font-size: 12.5px;
      color: var(--nx-text);
    }
    .ex-dur {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .ex-add {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .ex-input {
      flex: 1;
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
    .ex-dur-input {
      width: 72px;
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 13px;
    }
  `,
})
export class PanelNovoTreinoComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly squadContext = inject(SquadContextService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    title: ['', Validators.required],
    date: ['', Validators.required],
    startTime: ['', Validators.required],
    endTime: [''],
    location: [''],
    materials: [''],
  });

  protected readonly exercises = signal<{ label: string; durationMin: number }[]>([]);
  protected readonly newLabel = signal('');
  protected readonly newDuration = signal(10);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected addExercise(): void {
    const label = this.newLabel().trim();
    if (!label) {
      return;
    }
    this.exercises.update((list) => [...list, { label, durationMin: this.newDuration() || 10 }]);
    this.newLabel.set('');
    this.newDuration.set(10);
  }

  protected removeExercise(index: number): void {
    this.exercises.update((list) => list.filter((_, i) => i !== index));
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    const squadId = this.squadContext.activeSquadId();
    if (!squadId) {
      this.error.set('Selecione uma equipe ativa antes de criar um treino.');
      return;
    }
    if (this.form.invalid) {
      this.error.set('Preencha título, data e horário de início.');
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await this.trainingsService.createTraining({
        squadId,
        title: raw.title,
        date: raw.date,
        startTime: raw.startTime,
        endTime: raw.endTime,
        location: raw.location,
        materials: raw.materials,
        exercises: this.exercises().map((e, i) => ({ ...e, order: i })),
      });
      void this.router.navigateByUrl('/painel/treinos');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o treino.');
    } finally {
      this.saving.set(false);
    }
  }
}
