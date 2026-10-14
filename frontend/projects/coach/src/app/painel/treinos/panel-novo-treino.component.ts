import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FormFieldComponent } from '../ui/form-field.component';
import { FormTextareaComponent } from '../ui/form-textarea.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { addDays, isEndBeforeStart, sanitizeDuration } from './training-rules';
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
      <co-page-header title="Planejamento de treinos" [subtitle]="editingId ? 'Editar treino' : 'Novo treino'">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving() || !canSubmit()" (click)="submit()">
          @if (saving()) {
            Salvando…
          } @else if (editingId) {
            Salvar alterações
          } @else {
            Salvar treino
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }

        @if (editingId && trainingsReady() && !loaded()) {
          <div class="co-alert" role="alert">Treino não encontrado. Ele pode ter sido excluído.</div>
        } @else if (!editingId && !squadName()) {
          <div class="co-alert" role="alert">Crie ou selecione uma equipe para planejar um treino.</div>
        }

        <co-panel-card title="Detalhes do treino" kicker="Objetivo e horário">
          @if (duplicatedTitle(); as source) {
            <p class="squad-note">Duplicando de «{{ source }}»</p>
          }
          @if (!editingId && squadName(); as name) {
            <p class="squad-note">Equipe: <strong>{{ name }}</strong></p>
          }
          <form [formGroup]="form" class="grid">
            <co-form-field label="Título" placeholder="Ex: Treino técnico · Recepção" formControlName="title" [wide]="true" [error]="fieldError('title')" />
            <co-form-field label="Data" type="date" formControlName="date" [error]="fieldError('date')" />
            <co-form-field label="Início" type="time" formControlName="startTime" [error]="fieldError('startTime')" />
            <co-form-field label="Fim" type="time" formControlName="endTime" [error]="fieldError('endTime')" />
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
            <input class="ex-input" placeholder="Nome do exercício" [value]="newLabel()" (input)="newLabel.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); addExercise()" />
            <input class="ex-dur-input" type="number" min="1" max="240" aria-label="Duração em minutos" [value]="newDuration()" (input)="newDuration.set(+$any($event.target).value)" (keydown.enter)="$event.preventDefault(); addExercise()" />
            <button type="button" class="co-ghost-btn" (click)="addExercise()">
              <co-icon name="plus" [size]="13" />
              Adicionar
            </button>
          </div>
          @if (exercises().length > 0) {
            <div class="ex-total">Total: {{ totalMinutes() }} min</div>
          }
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
    .squad-note {
      margin: 0 0 12px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }
    .squad-note strong {
      color: var(--nx-text);
    }
    .ex-total {
      margin-top: 10px;
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
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  /** `null` = criando; com id = editando um treino existente. */
  protected readonly editingId = this.route.snapshot.paramMap.get('id');
  /** `?de=<id>`: cria um treino novo partindo de um existente. */
  private readonly duplicateFromId = this.editingId ? null : this.route.snapshot.queryParamMap.get('de');
  protected readonly duplicatedTitle = signal<string | null>(null);

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
  protected readonly submitted = signal(false);
  /** Edição: o treino já foi lido do snapshot e o form está preenchido. */
  protected readonly loaded = signal(false);
  protected readonly trainingsReady = this.trainingsService.ready;

  protected readonly squadName = computed(() => this.squadContext.activeSquad()?.name ?? null);
  protected readonly totalMinutes = computed(() => this.exercises().reduce((sum, e) => sum + e.durationMin, 0));
  protected readonly canSubmit = computed(() => (this.editingId ? this.loaded() : !!this.squadName()));

  constructor() {
    const sourceId = this.editingId ?? this.duplicateFromId;
    if (!sourceId) {
      return;
    }
    // Os treinos chegam por snapshot; preenche o form assim que o treino aparecer (uma vez).
    const ref = effect(() => {
      const t = this.trainingsService.trainings().find((x) => x.id === sourceId);
      if (!t) {
        return;
      }
      if (this.duplicateFromId) {
        this.duplicatedTitle.set(t.title);
      }
      this.form.setValue({
        title: t.title,
        // Duplicar sugere a mesma aula na semana seguinte; editar mantém a data.
        date: this.duplicateFromId && t.date ? addDays(t.date, 7) : t.date,
        startTime: t.startTime,
        endTime: t.endTime,
        location: t.location,
        materials: t.materials,
      });
      this.exercises.set(
        [...t.exercises].sort((a, b) => a.order - b.order).map((e) => ({ label: e.label, durationMin: e.durationMin })),
      );
      this.loaded.set(true);
      ref.destroy();
    });
  }

  protected fieldError(field: 'title' | 'date' | 'startTime' | 'endTime'): string | null {
    if (!this.submitted()) {
      return null;
    }
    const raw = this.form.getRawValue();
    switch (field) {
      case 'title':
        return raw.title.trim() ? null : 'Informe o título.';
      case 'date':
        return raw.date ? null : 'Informe a data.';
      case 'startTime':
        return raw.startTime ? null : 'Informe o início.';
      case 'endTime':
        return isEndBeforeStart(raw.startTime, raw.endTime) ? 'O fim precisa ser depois do início.' : null;
    }
  }

  protected addExercise(): void {
    const label = this.newLabel().trim();
    if (!label) {
      return;
    }
    this.exercises.update((list) => [...list, { label, durationMin: sanitizeDuration(this.newDuration()) }]);
    this.newLabel.set('');
    this.newDuration.set(10);
  }

  protected removeExercise(index: number): void {
    this.exercises.update((list) => list.filter((_, i) => i !== index));
  }

  protected async submit(): Promise<void> {
    this.error.set(null);
    const squadId = this.squadContext.activeSquadId();
    if (!this.editingId && !squadId) {
      this.error.set('Selecione uma equipe ativa antes de criar um treino.');
      return;
    }
    this.submitted.set(true);
    const raw = this.form.getRawValue();
    if (
      this.form.invalid ||
      !raw.title.trim() ||
      isEndBeforeStart(raw.startTime, raw.endTime)
    ) {
      this.error.set('Revise os campos destacados.');
      return;
    }
    this.saving.set(true);
    try {
      const fields = {
        title: raw.title.trim(),
        date: raw.date,
        startTime: raw.startTime,
        endTime: raw.endTime,
        location: raw.location,
        materials: raw.materials,
        exercises: this.exercises().map((e, i) => ({ ...e, order: i })),
      };
      if (this.editingId) {
        await this.trainingsService.updateTraining(this.editingId, fields);
      } else {
        await this.trainingsService.createTraining({ squadId: squadId!, ...fields });
      }
      void this.router.navigateByUrl('/painel/treinos');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar o treino.');
    } finally {
      this.saving.set(false);
    }
  }
}
