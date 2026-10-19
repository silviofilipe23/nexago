import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { COURT_SPORT_OPTIONS } from '@nexago/arena-discovery';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { AulasPageComponent, TeacherAvatarComponent } from './aulas-ui';
import {
  CLASS_LEVELS,
  CLASS_LEVEL_LABEL,
  WEEKDAY_SHORT,
  endTimeFor,
  minutesOf,
  sportLabel,
  todayKeyLocal,
  weekdayDateLabel,
  weekdaysLabel,
  type ClassLevel,
  type ClassTeacher,
  type ClassType,
} from './class.model';
import { fetchClass, fetchTeachers, previewClassSchedule, upsertClass, type ClassConflict } from './classes-repository';

interface CourtOption {
  id: string;
  name: string;
  types: string[];
}

const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180];

/** 05 · Nova turma / editar — turma recorrente que bloqueia a quadra na agenda. A prévia
 *  consulta a agenda real e lista as datas em que a quadra já está ocupada. */
@Component({
  selector: 'ar-panel-aula-class-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, TeacherAvatarComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page [title]="isEdit() ? 'Editar turma' : 'Nova turma'" subtitle="Turma recorrente · bloqueia a quadra na agenda de reservas">
      <div page-actions style="display: flex; gap: 8px; flex-wrap: wrap">
        <button type="button" class="ar-mini-btn" (click)="goBack()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave() || readOnly()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : isEdit() ? 'Salvar alterações' : 'Criar turma' }}
        </button>
      </div>

      <div class="ar-split">
        <div class="col">
          @if (errorMessage(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          @if (isEdit()) {
            <div class="note">
              Mudar dias, horário, quadra ou datas remarca as próximas aulas que ainda não tiveram
              chamada. Nome, professor e vagas mudam também nas aulas já agendadas.
            </div>
          }

          <ar-panel-card title="Turma" kicker="01">
            <div class="row-2">
              <div>
                <div class="field-label">Nome da turma</div>
                <input class="input-box" type="text" maxlength="60" placeholder="Ex.: Intermediário Noite" [value]="name()" (input)="name.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Formato</div>
                <div class="chip-row">
                  @for (t of typeOptions; track t.value) {
                    <button type="button" class="ar-chip" [class.active]="type() === t.value" (click)="type.set(t.value)">{{ t.label }}</button>
                  }
                </div>
              </div>
            </div>
            <div class="field-label spaced">Modalidade</div>
            <div class="chip-row">
              @for (s of sportOptions(); track s.value) {
                <button type="button" class="ar-chip" [class.active]="sport() === s.value" (click)="sport.set(s.value)">{{ s.label }}</button>
              }
            </div>
            <div class="field-label spaced">Nível</div>
            <div class="chip-row">
              @for (l of levels; track l) {
                <button type="button" class="ar-chip" [class.active]="level() === l" (click)="level.set(l)">{{ levelLabel[l] }}</button>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card title="Professor" kicker="02">
            @if (activeTeachers().length === 0) {
              <p class="hint">
                Nenhum professor cadastrado.
                <a class="ar-text-link" routerLink="/painel/aulas/professores">Cadastre em Professores</a>
                e volte para criar a turma.
              </p>
            } @else {
              <div class="teachers">
                @for (t of activeTeachers(); track t.id) {
                  <button type="button" class="pick" [class.active]="teacherId() === t.id" (click)="teacherId.set(t.id)">
                    <ar-teacher-avatar [name]="t.name" [color]="t.color" [size]="30" />
                    <span class="pick-name">{{ t.name }}</span>
                    <span class="pick-sub">{{ t.specialty || 'Professor' }}</span>
                  </button>
                }
              </div>
            }
          </ar-panel-card>

          <ar-panel-card title="Quando acontece" kicker="03">
            <div class="field-label">Dias da semana</div>
            <div class="weekdays">
              @for (d of weekdays; track d) {
                <button type="button" class="weekday" [class.active]="selectedDays().has(d)" (click)="toggleDay(d)">{{ weekdayShort[d] }}</button>
              }
            </div>
            <div class="row-4">
              <div>
                <div class="field-label spaced">Início</div>
                <input class="input-box" type="time" step="900" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label spaced">Duração</div>
                <select class="input-box" (change)="duration.set(+$any($event.target).value)">
                  @for (m of durations(); track m) {
                    <option [value]="m" [selected]="m === duration()">{{ m }} min</option>
                  }
                </select>
              </div>
              <div>
                <div class="field-label spaced">Começa em</div>
                <input class="input-box" type="date" [min]="today" [value]="startDate()" (input)="startDate.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label spaced">Termina em</div>
                <input class="input-box" type="date" [min]="startDate()" [value]="endDate()" (input)="endDate.set($any($event.target).value)" />
              </div>
            </div>
            <p class="hint">Deixe "Termina em" vazio para a turma seguir sem data de fim.</p>
          </ar-panel-card>

          <ar-panel-card title="Quadra e vagas" kicker="04">
            @if (courts().length === 0) {
              <p class="hint">Nenhuma quadra cadastrada — cadastre em Quadras primeiro.</p>
            } @else {
              <div class="chip-row">
                @for (c of courts(); track c.id) {
                  <button type="button" class="ar-chip" [class.active]="courtId() === c.id" (click)="courtId.set(c.id)">{{ c.name }}</button>
                }
              </div>
            }
            @if (previewState() !== 'idle') {
              <div class="preview" [class.bad]="conflicts().length > 0" [class.loading]="previewState() === 'loading'">
                @switch (previewState()) {
                  @case ('loading') {
                    Conferindo a agenda da quadra…
                  }
                  @case ('error') {
                    {{ previewError() }}
                  }
                  @default {
                    @if (conflicts().length === 0) {
                      {{ courtName() }} livre nos próximos 35 dias · {{ previewTotal() }} aula{{ previewTotal() === 1 ? '' : 's' }}
                      bloqueada{{ previewTotal() === 1 ? '' : 's' }} na agenda de reservas
                    } @else {
                      <strong>{{ conflicts().length }} de {{ previewTotal() }} aulas sem quadra:</strong>
                      <ul>
                        @for (c of conflicts().slice(0, 6); track c.date) {
                          <li>{{ dateLabel(c.date) }} — {{ c.label }}</li>
                        }
                      </ul>
                      @if (conflicts().length > 6) {
                        <span>e mais {{ conflicts().length - 6 }}.</span>
                      }
                      <span class="preview-foot">Nessas datas a aula não é criada. Libere a quadra ou escolha outro horário.</span>
                    }
                  }
                }
              </div>
            }
            <div class="row-3 spaced-row">
              <div>
                <div class="field-label">Vagas</div>
                <div class="stepper">
                  <span>{{ capacity() }} aluno{{ capacity() === 1 ? '' : 's' }}</span>
                  <button type="button" aria-label="Menos vagas" (click)="capacity.set(Math.max(1, capacity() - 1))">–</button>
                  <button type="button" aria-label="Mais vagas" (click)="capacity.set(Math.min(40, capacity() + 1))">+</button>
                </div>
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card title="Observações" kicker="05">
            <textarea class="input-box" maxlength="500" placeholder="Ex.: trazer raquete; bolas da arena" [value]="notes()" (input)="notes.set($any($event.target).value)"></textarea>
          </ar-panel-card>
        </div>

        <div class="col">
          <ar-panel-card title="Resumo">
            <div class="sum-name">{{ name() || 'Nova turma' }}</div>
            <div class="sum-sub">{{ sportLabelOf(sport()) }} · {{ levelLabel[level()] }}</div>
            <div class="sum-rows">
              <div><span>Professor</span><strong>{{ teacherName() }}</strong></div>
              <div><span>Dias</span><strong>{{ daysSummary() }}</strong></div>
              <div><span>Horário</span><strong>{{ startTime() }}–{{ endTime() }}</strong></div>
              <div><span>Quadra</span><strong>{{ courtName() }}</strong></div>
              <div><span>Vagas</span><strong>{{ capacity() }} alunos</strong></div>
            </div>
          </ar-panel-card>
          <div class="info">
            Ao salvar, cada aula vira um bloqueio na agenda de reservas: o horário some do aluguel
            no app, no site da arena e no balcão. Cancelar uma aula libera a quadra na hora.
          </div>
        </div>
      </div>
    </ar-aulas-page>
  `,
  styles: `
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .note {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1);
      padding: 10px 14px; font-size: 12.5px; line-height: 1.5; color: var(--nx-text-mute);
    }
    .teachers { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .pick {
      display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px; text-align: left;
      border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); cursor: pointer;
    }
    .pick.active { background: var(--nx-orange-tint); border-color: rgba(255, 106, 26, 0.45); }
    .pick-name { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .pick-sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .weekdays { display: flex; gap: 6px; flex-wrap: wrap; }
    .weekday {
      width: 46px; height: 38px; border-radius: var(--nx-r-2); cursor: pointer;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display); font-weight: 700; font-size: 12px; color: var(--nx-text-mute);
    }
    .weekday.active { background: var(--nx-orange-500); border-color: var(--nx-orange-500); color: var(--nx-text-on-orange); }
    .preview {
      margin-top: 12px; padding: 10px 12px; border-radius: var(--nx-r-2); font-size: 12.5px; line-height: 1.5;
      background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.25); color: var(--nx-win);
    }
    .preview.bad { background: rgba(255, 59, 48, 0.08); border-color: rgba(255, 59, 48, 0.28); color: var(--nx-live); }
    .preview.loading { background: var(--nx-surface-1); border-color: var(--nx-line); color: var(--nx-text-dim); }
    .preview ul { margin: 6px 0; padding-left: 18px; }
    .preview-foot { display: block; margin-top: 4px; color: var(--nx-text-mute); }
    .spaced-row { margin-top: 14px; }
    .sum-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 15px; color: var(--nx-text); }
    .sum-sub { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); margin-top: 4px; }
    .sum-rows { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
    .sum-rows div { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
    .sum-rows span { color: var(--nx-text-dim); }
    .sum-rows strong { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); text-align: right; }
    .info {
      padding: 13px 15px; border-radius: var(--nx-r-3); border: 1px dashed var(--nx-line-strong);
      font-size: 12px; line-height: 1.5; color: var(--nx-text-dim);
    }
  `,
})
export class PanelAulaClassFormComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly Math = Math;
  protected readonly weekdays = [1, 2, 3, 4, 5, 6, 7];
  protected readonly weekdayShort = WEEKDAY_SHORT;
  protected readonly levels = CLASS_LEVELS;
  protected readonly levelLabel = CLASS_LEVEL_LABEL;
  protected readonly sportLabelOf = sportLabel;
  protected readonly dateLabel = weekdayDateLabel;
  protected readonly today = todayKeyLocal();
  protected readonly typeOptions: ReadonlyArray<{ value: ClassType; label: string }> = [
    { value: 'turma', label: 'Turma' },
    { value: 'particular', label: 'Particular fixa' },
    { value: 'dupla', label: 'Dupla fixa' },
  ];

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));

  protected readonly classId = signal<string | null>(this.route.snapshot.paramMap.get('classId'));
  protected readonly isEdit = computed(() => this.classId() != null);

  protected readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly courts = signal<CourtOption[]>([]);

  protected readonly name = signal('');
  protected readonly type = signal<ClassType>('turma');
  protected readonly sport = signal('beachTennis');
  protected readonly level = signal<ClassLevel>('iniciante');
  protected readonly teacherId = signal<string | null>(null);
  protected readonly selectedDays = signal<ReadonlySet<number>>(new Set([2, 4]));
  protected readonly startTime = signal('19:00');
  protected readonly duration = signal(60);
  protected readonly startDate = signal(this.today);
  protected readonly endDate = signal('');
  protected readonly courtId = signal<string | null>(null);
  protected readonly capacity = signal(6);
  protected readonly notes = signal('');

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly previewState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly previewTotal = signal(0);
  protected readonly conflicts = signal<ClassConflict[]>([]);
  protected readonly previewError = signal('');
  private previewSeq = 0;

  protected readonly activeTeachers = computed(() =>
    this.teachers().filter((t) => t.status === 'active' || t.id === this.teacherId()),
  );
  protected readonly endTime = computed(() => endTimeFor(this.startTime(), this.duration()));
  protected readonly durations = computed(() =>
    DURATIONS.includes(this.duration()) ? DURATIONS : [...DURATIONS, this.duration()].sort((a, b) => a - b),
  );
  protected readonly courtName = computed(() => this.courts().find((c) => c.id === this.courtId())?.name ?? '—');
  protected readonly teacherName = computed(() => this.teachers().find((t) => t.id === this.teacherId())?.name ?? '—');
  protected readonly daysSummary = computed(() => weekdaysLabel([...this.selectedDays()]) || '—');
  protected readonly sportOptions = computed(() => {
    const offered = new Set(this.courts().flatMap((c) => c.types));
    const fromCourts = COURT_SPORT_OPTIONS.filter((o) => offered.has(o.value));
    const list = fromCourts.length > 0 ? fromCourts : COURT_SPORT_OPTIONS;
    const current = this.sport();
    return list.some((o) => o.value === current) ? list : [...list, { value: current, label: sportLabel(current) }];
  });

  protected readonly canSave = computed(
    () =>
      !this.saving() &&
      this.name().trim().length >= 2 &&
      this.teacherId() != null &&
      this.courtId() != null &&
      this.selectedDays().size > 0 &&
      /^\d{2}:\d{2}$/.test(this.startTime()) &&
      this.endTime() !== '24:00' &&
      !!this.startDate() &&
      (!this.endDate() || this.endDate() >= this.startDate()),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    let timer: ReturnType<typeof setTimeout> | null = null;
    destroyRef.onDestroy(() => {
      if (timer) clearTimeout(timer);
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.loadOptions(arenaId);
    });

    const classId = this.classId();
    if (classId) void this.loadClass(classId);

    // Prévia da agenda: refaz 400 ms depois da última mudança de dia/horário/quadra/datas.
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const input = {
        weekdays: [...this.selectedDays()].sort((a, b) => a - b),
        startTime: this.startTime(),
        endTime: this.endTime(),
        courtId: this.courtId(),
        startDate: this.startDate(),
        endDate: this.endDate() || null,
        type: this.type(),
      };
      if (timer) clearTimeout(timer);
      if (!arenaId || !input.courtId || input.weekdays.length === 0 || !/^\d{2}:\d{2}$/.test(input.startTime) || !input.startDate) {
        untracked(() => this.previewState.set('idle'));
        return;
      }
      untracked(() => this.previewState.set('loading'));
      const seq = ++this.previewSeq;
      const classIdNow = untracked(() => this.classId());
      timer = setTimeout(() => {
        previewClassSchedule(arenaFunctions(), {
          ...input,
          courtId: input.courtId!,
          arenaId,
          classId: classIdNow ?? undefined,
        })
          .then((r) => {
            if (seq !== this.previewSeq) return;
            this.previewTotal.set(r.totalDates);
            this.conflicts.set(r.conflicts);
            this.previewState.set('ready');
          })
          .catch((err: unknown) => {
            if (seq !== this.previewSeq) return;
            this.previewError.set(err instanceof Error ? err.message : 'Não foi possível conferir a agenda.');
            this.previewState.set('error');
          });
      }, 400);
    });
  }

  private async loadOptions(arenaId: string): Promise<void> {
    const db = arenaFirestore();
    try {
      const [teachers, courts] = await Promise.all([fetchTeachers(db, arenaId), fetchCourtsList(db, arenaId)]);
      this.teachers.set(teachers);
      this.courts.set(courts.map((c) => ({ id: c.id, name: c.name, types: c.types })));
      if (!this.isEdit()) {
        const firstTeacher = teachers.find((t) => t.status === 'active');
        if (firstTeacher && !this.teacherId()) this.teacherId.set(firstTeacher.id);
        if (courts[0] && !this.courtId()) this.courtId.set(courts[0].id);
        const firstSport = courts.flatMap((c) => c.types)[0];
        if (firstSport) this.sport.set(firstSport);
      }
    } catch {
      this.errorMessage.set('Não foi possível carregar professores e quadras.');
    }
  }

  private async loadClass(classId: string): Promise<void> {
    try {
      const cls = await fetchClass(arenaFirestore(), classId);
      if (!cls) {
        this.errorMessage.set('Turma não encontrada.');
        return;
      }
      this.name.set(cls.name);
      this.type.set(cls.type);
      this.sport.set(cls.sport);
      this.level.set(cls.level);
      this.teacherId.set(cls.teacherId);
      this.selectedDays.set(new Set(cls.weekdays));
      this.startTime.set(cls.startTime);
      let dur = minutesOf(cls.endTime) - minutesOf(cls.startTime);
      if (dur <= 0) dur += 24 * 60;
      this.duration.set(dur);
      this.startDate.set(cls.startDate);
      this.endDate.set(cls.endDate ?? '');
      this.courtId.set(cls.courtId);
      this.capacity.set(cls.capacity);
      this.notes.set(cls.notes ?? '');
    } catch {
      this.errorMessage.set('Não foi possível carregar a turma.');
    }
  }

  protected toggleDay(day: number): void {
    const next = new Set(this.selectedDays());
    if (next.has(day)) next.delete(day);
    else next.add(day);
    this.selectedDays.set(next);
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || !this.canSave() || this.readOnly()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const result = await upsertClass(arenaFunctions(), {
        arenaId,
        classId: this.classId() ?? undefined,
        name: this.name().trim(),
        type: this.type(),
        sport: this.sport(),
        level: this.level(),
        teacherId: this.teacherId()!,
        weekdays: [...this.selectedDays()].sort((a, b) => a - b),
        startTime: this.startTime(),
        endTime: this.endTime(),
        courtId: this.courtId()!,
        capacity: this.capacity(),
        startDate: this.startDate(),
        endDate: this.endDate() || null,
        notes: this.notes().trim() || null,
      });
      void this.router.navigate(['/painel/aulas/turmas', result.classId]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar a turma.');
    } finally {
      this.saving.set(false);
    }
  }

  protected goBack(): void {
    const id = this.classId();
    void this.router.navigate(id ? ['/painel/aulas/turmas', id] : ['/painel/aulas/turmas']);
  }
}
