import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { RowComponent } from '../ui/row.component';
import { SquadContextService } from '../ui/squad-context.service';
import { AthletesService } from '../atletas/athletes.service';
import { TrainingsService, type AttendanceStatus } from '../treinos/trainings.service';

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  atrasado: 'Atrasado',
  justificado: 'Justificado',
};

@Component({
  selector: 'co-panel-presenca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, RowComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Controle de presença" [subtitle]="subtitle()">
        <select class="picker" [value]="selected()?.id ?? ''" (change)="selectTraining($any($event.target).value)">
          @for (t of trainings(); track t.id) {
            <option [value]="t.id">{{ t.title }} · {{ t.date }}</option>
          }
        </select>
      </co-page-header>

      <div class="body">
        @if (!selected()) {
          <p class="empty">Nenhum treino agendado para esta equipe ainda. Crie um treino primeiro.</p>
        } @else {
          <co-panel-card title="Marcar presença" [kicker]="roster().length + ' convocados'">
            @for (a of roster(); track a.athleteUid; let last = $last) {
              <co-row [title]="a.displayName" [sub]="a.category" [last]="last">
                <co-athlete-avatar row-avatar [initials]="a.initials" [size]="34" [status]="a.status" />
                <div row-trailing class="options">
                  @for (s of statusOptions; track s) {
                    <button type="button" class="opt" [class.active]="statusFor(a.athleteUid) === s" (click)="setStatus(a.athleteUid, s)">
                      {{ STATUS_LABEL[s] }}
                    </button>
                  }
                </div>
              </co-row>
            } @empty {
              <p class="empty">Nenhum atleta vinculado a esta equipe ainda.</p>
            }
          </co-panel-card>
          <button type="button" class="co-mini-btn co-mini-btn-primary save-btn" [disabled]="saving()" (click)="save()">
            @if (saving()) {
              Salvando…
            } @else {
              Salvar
            }
          </button>
        }
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
      overflow: hidden;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .picker {
      height: 36px;
      padding: 0 10px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
    }
    .options {
      display: flex;
      gap: 6px;
    }
    .opt {
      height: 26px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 10.5px;
      cursor: pointer;
    }
    .opt.active {
      background: var(--nx-orange-500);
      border-color: transparent;
      color: var(--nx-text-on-orange);
    }
    .save-btn {
      align-self: flex-start;
    }
  `,
})
export class PanelPresencaComponent {
  private readonly trainingsService = inject(TrainingsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly statusOptions: AttendanceStatus[] = ['presente', 'ausente', 'atrasado', 'justificado'];

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService.trainings().filter((t) => !activeId || t.squadId === activeId);
  });

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  protected readonly selectedTrainingId = signal<string | null>(null);
  protected readonly draftAttendance = signal<Record<string, AttendanceStatus>>({});
  protected readonly saving = signal(false);

  protected readonly selected = computed(() => {
    const id = this.selectedTrainingId() ?? this.trainings()[0]?.id ?? null;
    return this.trainings().find((t) => t.id === id) ?? null;
  });

  protected readonly subtitle = computed(() => {
    const t = this.selected();
    return t ? `${t.title} · ${t.date} · ${t.startTime}` : 'Selecione um treino';
  });

  constructor() {
    effect(() => {
      const t = this.selected();
      this.draftAttendance.set(t ? { ...t.attendance } : {});
    });
  }

  protected selectTraining(id: string): void {
    this.selectedTrainingId.set(id);
  }

  protected statusFor(athleteUid: string): AttendanceStatus | null {
    return this.draftAttendance()[athleteUid] ?? null;
  }

  protected setStatus(athleteUid: string, status: AttendanceStatus): void {
    this.draftAttendance.update((map) => ({ ...map, [athleteUid]: status }));
  }

  protected async save(): Promise<void> {
    const t = this.selected();
    if (!t) {
      return;
    }
    this.saving.set(true);
    try {
      await this.trainingsService.setAttendance(t.id, this.draftAttendance());
    } finally {
      this.saving.set(false);
    }
  }
}
