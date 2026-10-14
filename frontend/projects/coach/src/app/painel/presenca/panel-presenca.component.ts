import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AthleteAvatarComponent } from '../ui/athlete-avatar.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { SquadContextService } from '../ui/squad-context.service';
import { CoachContextService } from '../access/coach-context.service';
import { AthletesService } from '../atletas/athletes.service';
import { athletesAtRisk, defaultAttendance, sameAttendance, summarizeAttendance } from '../treinos/attendance-stats';
import { compareTrainings, localIsoDate } from '../treinos/training-rules';
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
  imports: [AthleteAvatarComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent, PillComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Controle de presença" [subtitle]="subtitle()">
        <select class="picker" aria-label="Treino" (change)="selectTraining($any($event.target).value)">
          @for (t of trainings(); track t.id) {
            <option [value]="t.id" [selected]="t.id === selectedId()">{{ t.title }} · {{ t.date }}</option>
          }
        </select>
      </co-page-header>

      <div class="body">
        @if (!selected()) {
          <p class="empty">
            Nenhum treino agendado para esta equipe ainda.
            @if (ctx.can('treinos', 'write')) {
              Crie um treino primeiro.
            }
          </p>
        } @else {
          @if (error(); as err) {
            <div class="co-alert" role="alert">{{ err }}</div>
          }
          @if (startsAllPresent() && ctx.can('treinos', 'write')) {
            <p class="hint">Todos começam como presentes. Ajuste só quem faltou ou chegou atrasado.</p>
          }

          <co-panel-card title="Marcar presença" [kicker]="roster().length + ' convocados'">
            @if (ctx.can('treinos', 'write')) {
              <div class="tools">
                <button type="button" class="co-ghost-btn" (click)="markAllPresent()">Todos presentes</button>
              </div>
            }
            @for (a of roster(); track a.athleteUid) {
              <div class="athlete">
                <div class="who">
                  <co-athlete-avatar [initials]="a.initials" [size]="36" [status]="a.status" />
                  <div class="who-text">
                    <div class="name">
                      {{ a.displayName }}
                      @if (riskFor(a.athleteUid); as risk) {
                        <co-pill [tone]="risk.level === 'critico' ? 'red' : 'yellow'">{{ risk.streak }} faltas seguidas</co-pill>
                      }
                    </div>
                    @if (a.category) {
                      <div class="cat">{{ a.category }}</div>
                    }
                  </div>
                </div>
                <div class="options" role="group" [attr.aria-label]="'Presença de ' + a.displayName">
                  @if (ctx.can('treinos', 'write')) {
                    @for (s of statusOptions; track s) {
                      <button
                        type="button"
                        class="opt"
                        [class]="'opt ' + s"
                        [class.active]="statusFor(a.athleteUid) === s"
                        [attr.aria-pressed]="statusFor(a.athleteUid) === s"
                        (click)="setStatus(a.athleteUid, s)"
                      >
                        {{ STATUS_LABEL[s] }}
                      </button>
                    }
                  } @else {
                    <span class="opt readonly">{{ readonlyLabel(a.athleteUid) }}</span>
                  }
                </div>
              </div>
            } @empty {
              <p class="empty">Nenhum atleta vinculado a esta equipe ainda.</p>
            }
          </co-panel-card>

          <div class="savebar">
            <div class="summary" aria-live="polite">
              <span class="s-presente">{{ summary().presente }} presentes</span>
              <span class="s-ausente">{{ summary().ausente }} ausentes</span>
              <span class="s-atrasado">{{ summary().atrasado }} atrasados</span>
              <span>{{ summary().justificado }} justificados</span>
              @if (summary().semMarcacao > 0) {
                <span class="s-pendente">{{ summary().semMarcacao }} sem marcação</span>
              }
            </div>
            @if (ctx.can('treinos', 'write')) {
              @if (justSaved()) {
                <span class="saved" role="status">Presença salva</span>
              }
              <button type="button" class="co-mini-btn co-mini-btn-primary save-btn" [disabled]="saving() || !dirty()" (click)="save()">
                @if (saving()) {
                  Salvando…
                } @else {
                  Salvar presença
                }
              </button>
            }
          </div>
        }
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px var(--co-gutter) 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
    }
    .empty {
      color: var(--nx-text-mute);
      font-size: 13px;
    }
    .hint {
      margin: 0;
      color: var(--nx-text-dim);
      font-size: 12.5px;
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
    .tools {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 4px;
    }
    .athlete {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .athlete:last-child {
      border-bottom: none;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1 1 200px;
      min-width: 0;
    }
    .name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .cat {
      font-size: 11.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .opt {
      min-height: 44px;
      padding: 0 14px;
      border-radius: 999px;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-ui);
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
    }
    .opt.readonly {
      display: inline-flex;
      align-items: center;
      cursor: default;
    }
    .opt.active {
      border-color: transparent;
      color: #0b0b0c;
    }
    .opt.presente.active {
      background: var(--nx-green-500, #3ecf8e);
    }
    .opt.ausente.active {
      background: var(--nx-red-500, #ff5b5b);
    }
    .opt.atrasado.active {
      background: var(--nx-yellow-500, #f5c542);
    }
    .opt.justificado.active {
      background: var(--nx-text-dim);
    }
    .savebar {
      position: sticky;
      bottom: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 16px;
      margin: 0 calc(var(--co-gutter) * -1);
      padding: 12px var(--co-gutter);
      background: var(--nx-bg);
      border-top: 1px solid var(--nx-line);
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      flex: 1 1 280px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }
    .s-presente {
      color: var(--nx-green-500, #3ecf8e);
    }
    .s-ausente {
      color: var(--nx-red-500, #ff5b5b);
    }
    .s-atrasado {
      color: var(--nx-yellow-500, #f5c542);
    }
    .s-pendente {
      color: var(--nx-orange-500);
    }
    .saved {
      font-size: 12px;
      color: var(--nx-green-500, #3ecf8e);
    }
    .save-btn {
      min-height: 44px;
      padding: 0 20px;
    }
  `,
})
export class PanelPresencaComponent {
  protected readonly ctx = inject(CoachContextService);
  private readonly trainingsService = inject(TrainingsService);
  private readonly athletesService = inject(AthletesService);
  private readonly squadContext = inject(SquadContextService);

  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly statusOptions: AttendanceStatus[] = ['presente', 'ausente', 'atrasado', 'justificado'];

  protected readonly trainings = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    return this.trainingsService
      .trainings()
      .filter((t) => (!activeId || t.squadId === activeId) && t.status !== 'cancelado')
      .sort(compareTrainings);
  });

  protected readonly roster = computed(() => {
    const activeId = this.squadContext.activeSquadId();
    const all = this.athletesService.roster();
    return activeId ? all.filter((a) => a.squadId === activeId) : all;
  });

  /** `?treino=<id>` vem do atalho "Chamada" da lista de treinos. */
  protected readonly selectedTrainingId = signal<string | null>(
    inject(ActivatedRoute).snapshot.queryParamMap.get('treino'),
  );
  protected readonly draftAttendance = signal<Record<string, AttendanceStatus>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly justSaved = signal(false);
  /** Treino sem presença salva abre com o elenco todo `presente`. */
  protected readonly startsAllPresent = computed(() => {
    const t = this.selected();
    return !!t && Object.keys(t.attendance).length === 0 && this.roster().length > 0;
  });

  protected readonly selected = computed(() => {
    const list = this.trainings();
    const chosen = list.find((t) => t.id === this.selectedTrainingId());
    if (chosen) {
      return chosen;
    }
    // Sem escolha: o treino de hoje/mais próximo; se todos já passaram, o mais recente.
    const today = localIsoDate();
    return list.find((t) => t.date >= today) ?? list[list.length - 1] ?? null;
  });

  protected readonly selectedId = computed(() => this.selected()?.id ?? null);

  protected readonly subtitle = computed(() => {
    const t = this.selected();
    return t ? `${t.title} · ${t.date} · ${t.startTime}` : 'Selecione um treino';
  });

  /** Alerta de faltas seguidas, só com presenças já salvas (o rascunho da chamada não entra). */
  private readonly riskByUid = computed(
    () => new Map(athletesAtRisk(this.roster(), this.trainingsService.trainings()).map((r) => [r.athleteUid, r])),
  );

  protected riskFor(uid: string) {
    return this.riskByUid().get(uid) ?? null;
  }

  protected readonly rosterUids = computed(() => this.roster().map((a) => a.athleteUid));
  protected readonly summary = computed(() => summarizeAttendance(this.draftAttendance(), this.rosterUids()));
  protected readonly dirty = computed(() => {
    const t = this.selected();
    return !!t && !sameAttendance(this.draftAttendance(), t.attendance);
  });

  constructor() {
    effect(() => {
      const t = this.selected();
      const uids = this.rosterUids();
      this.error.set(null);
      this.justSaved.set(false);
      if (!t) {
        this.draftAttendance.set({});
      } else if (Object.keys(t.attendance).length === 0) {
        this.draftAttendance.set(defaultAttendance(uids));
      } else {
        this.draftAttendance.set({ ...t.attendance });
      }
    });
  }

  protected markAllPresent(): void {
    if (!this.ctx.can('treinos', 'write')) {
      return;
    }
    this.justSaved.set(false);
    this.draftAttendance.set(defaultAttendance(this.rosterUids()));
  }

  protected selectTraining(id: string): void {
    this.selectedTrainingId.set(id);
  }

  protected statusFor(athleteUid: string): AttendanceStatus | null {
    return this.draftAttendance()[athleteUid] ?? null;
  }

  protected readonlyLabel(athleteUid: string): string {
    const status = this.statusFor(athleteUid);
    return status ? STATUS_LABEL[status] : 'Sem registro';
  }

  protected setStatus(athleteUid: string, status: AttendanceStatus): void {
    if (!this.ctx.can('treinos', 'write')) {
      return;
    }
    this.justSaved.set(false);
    this.draftAttendance.update((map) => ({ ...map, [athleteUid]: status }));
  }

  protected async save(): Promise<void> {
    const t = this.selected();
    if (!t || !this.ctx.can('treinos', 'write')) {
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.trainingsService.setAttendance(t.id, this.draftAttendance());
      this.justSaved.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar a presença.');
    } finally {
      this.saving.set(false);
    }
  }
}
