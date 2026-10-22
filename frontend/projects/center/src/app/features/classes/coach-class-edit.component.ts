import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { writeErrorMessage } from '../../data/actions/actor';
import { ClassesActions } from '../../data/actions/classes.actions';
import { CenterStore } from '../../data/center-store.service';
import { weekdaysLabel } from '../../domain/schedule';
import type { TrainingClass } from '../../domain/models';
import { ModalComponent } from '../../ui/kit';

/**
 * Professor na própria turma ("Ver e editar turmas atribuídas"): nome, nível e quadra. Horário,
 * dias, local, vagas e professor seguem com o gestor — mexem em contrato, agenda e cobrança.
 */
@Component({
  selector: 'ct-coach-class-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `
    <ct-modal kicker="Sua turma" [title]="cls().name" [width]="480" (closed)="closed.emit()">
      <div class="ct-kv"><span>Horário</span><span>{{ when() }}</span></div>
      <div class="ct-kv"><span>Local</span><span>{{ cls().locationName || '—' }}</span></div>
      <div class="ct-kv"><span>Vagas</span><span>{{ cls().seatsTaken }} de {{ cls().capacity }}</span></div>
      <div class="ct-field">
        <label for="cc-name">Nome da turma</label>
        <input id="cc-name" class="ct-input" [value]="name()" (input)="name.set(value($event))" maxlength="80" />
      </div>
      <div class="ct-form-grid">
        <div class="ct-field">
          <label for="cc-level">Nível</label>
          <select id="cc-level" class="ct-input" (change)="level.set(value($event))">
            @for (l of levels(); track l) {
              <option [value]="l" [selected]="l === level()">{{ l }}</option>
            }
          </select>
        </div>
        <div class="ct-field">
          <label for="cc-court">Quadra</label>
          <select id="cc-court" class="ct-input" [disabled]="courts().length === 0" (change)="courtId.set(value($event))">
            <option value="" [selected]="!courtId()">{{ courts().length ? 'Sem quadra definida' : 'Local sem quadras cadastradas' }}</option>
            @for (q of courts(); track q.id) {
              <option [value]="q.id" [selected]="q.id === courtId()">{{ q.name }}</option>
            }
          </select>
        </div>
      </div>
      <p class="ct-dim hint">Horário, dias, local, vagas e professor quem muda é o gestor do centro. As próximas aulas acompanham o nome e a quadra.</p>
      @if (error()) {
        <p class="ct-error-text" role="alert">{{ error() }}</p>
      }
      <div footer>
        <button type="button" class="ct-ghost-btn" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || !changed()" (click)="save()">{{ busy() ? 'Salvando…' : 'Salvar' }}</button>
      </div>
    </ct-modal>
  `,
  styles: `
    .hint { margin: 0; line-height: 1.45; }
  `,
})
export class CoachClassEditComponent implements OnInit {
  readonly cls = input.required<TrainingClass>();
  readonly closed = output<void>();

  private readonly store = inject(CenterStore);
  private readonly actions = inject(ClassesActions);

  protected readonly name = signal('');
  protected readonly level = signal('');
  protected readonly courtId = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly levels = computed(() => {
    const list = this.store.programById(this.cls().programId)?.levels ?? [];
    return list.includes(this.cls().level) || !this.cls().level ? list : [this.cls().level, ...list];
  });
  protected readonly courts = computed(() =>
    this.store.courts().filter((q) => q.locationId === this.cls().locationId && (q.status === 'active' || q.id === this.cls().courtId)),
  );
  protected readonly when = computed(() => `${weekdaysLabel(this.cls().weekdays)} · ${this.cls().startTime} · ${this.cls().durationMin} min`);
  protected readonly changed = computed(
    () => this.name().trim() !== this.cls().name || this.level() !== this.cls().level || this.courtId() !== this.cls().courtId,
  );

  ngOnInit(): void {
    this.name.set(this.cls().name);
    this.level.set(this.cls().level);
    this.courtId.set(this.cls().courtId);
  }

  protected value(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const court = this.courts().find((q) => q.id === this.courtId());
      await this.actions.coachEdit(this.cls(), { name: this.name(), level: this.level(), courtId: court?.id ?? '', courtName: court?.name ?? '' });
      this.closed.emit();
    } catch (e) {
      this.error.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
