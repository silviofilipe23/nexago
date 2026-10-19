import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { fetchCourtsList } from '../courts/courts-repository';
import { searchAthletes, type AthleteSearchResult } from '../clubinho/clubs-repository';
import { ModalComponent } from '../ui/modal.component';
import { CLASS_TYPE_LABEL, endTimeFor, todayKeyLocal, type ClassTeacher, type ClassType } from './class.model';
import { fetchTeachers, previewClassSchedule, upsertClass, type NewStudentInput } from './classes-repository';

interface DraftStudent {
  key: string;
  athleteId: string | null;
  name: string;
}

const SINGLE_TYPES: readonly ClassType[] = ['particular', 'dupla', 'experimental'];
const CAPACITY_BY_TYPE: Record<ClassType, number> = { turma: 6, particular: 1, dupla: 2, experimental: 6 };

/** "Agendar aula" — aula avulsa de um dia (particular, dupla ou experimental). Vira uma
 *  `arenaClasses` sem dias da semana; a quadra é conferida antes de salvar. */
@Component({
  selector: 'ar-aula-single-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, RouterLink],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-modal (close)="dismiss()">
      <p class="modal-title">Agendar aula</p>
      <p class="modal-sub">Aula avulsa de um dia — a quadra sai do aluguel no horário.</p>
      @if (error(); as err) {
        <div class="error-banner">{{ err }}</div>
      }
      <div class="field-label">Tipo</div>
      <div class="chip-row">
        @for (t of types; track t) {
          <button type="button" class="ar-chip" [class.active]="type() === t" (click)="setType(t)">{{ typeLabel[t] }}</button>
        }
      </div>

      <div class="field-label spaced">Aluno{{ maxStudents() > 1 ? 's' : '' }} ({{ students().length }}/{{ maxStudents() }})</div>
      @for (s of students(); track s.key) {
        <div class="student">
          <span>{{ s.name }}</span>
          <span class="tag">{{ s.athleteId ? 'NexaGO' : 'sem conta' }}</span>
          <button type="button" class="ar-ghost-btn" (click)="removeStudent(s.key)">Remover</button>
        </div>
      }
      @if (students().length < maxStudents()) {
        <input class="input-box" type="search" placeholder="Buscar atleta NexaGO ou digitar o nome" [value]="term()" (input)="onTerm($any($event.target).value)" />
        <div class="results">
          @for (a of results(); track a.id) {
            <button type="button" class="result" (click)="addAthlete(a)">{{ a.name }}</button>
          }
          @if (term().trim().length >= 2) {
            <button type="button" class="result guest" (click)="addGuest()">+ Adicionar "{{ term().trim() }}" sem conta</button>
          }
        </div>
      }

      <div class="row-2">
        <div>
          <div class="field-label spaced">Professor</div>
          @if (!optionsLoaded()) {
            <p class="hint first">Carregando…</p>
          } @else if (activeTeachers().length === 0) {
            <p class="hint first">Cadastre um professor em <a class="ar-text-link" routerLink="/painel/aulas/professores">Professores</a>.</p>
          } @else {
            <select class="input-box" (change)="teacherId.set($any($event.target).value)">
              @for (t of activeTeachers(); track t.id) {
                <option [value]="t.id" [selected]="t.id === teacherId()">{{ t.name }}</option>
              }
            </select>
          }
        </div>
        <div>
          <div class="field-label spaced">Quadra</div>
          <select class="input-box" (change)="courtId.set($any($event.target).value)">
            @for (c of courts(); track c.id) {
              <option [value]="c.id" [selected]="c.id === courtId()">{{ c.name }}</option>
            }
          </select>
        </div>
      </div>
      <div class="row-3">
        <div>
          <div class="field-label spaced">Data</div>
          <input class="input-box" type="date" [min]="today" [value]="date()" (input)="date.set($any($event.target).value)" />
        </div>
        <div>
          <div class="field-label spaced">Início</div>
          <input class="input-box" type="time" step="900" [value]="startTime()" (input)="startTime.set($any($event.target).value)" />
        </div>
        <div>
          <div class="field-label spaced">Duração</div>
          <select class="input-box" (change)="duration.set(+$any($event.target).value)">
            @for (m of durations; track m) {
              <option [value]="m" [selected]="m === duration()">{{ m }} min</option>
            }
          </select>
        </div>
      </div>
      @if (conflict(); as c) {
        <div class="error-banner spaced-top">Quadra ocupada nesse horário: {{ c }}</div>
      } @else if (checking()) {
        <p class="hint">Conferindo a agenda da quadra…</p>
      }
      <div class="modal-actions">
        <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="dismiss()">Cancelar</button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!canSave()" (click)="save()">
          {{ busy() ? 'Agendando…' : 'Agendar aula' }}
        </button>
      </div>
    </ar-modal>
  `,
  styles: `
    .student {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; margin-bottom: 6px;
      border-radius: var(--nx-r-2); background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text);
    }
    .student span:first-child { flex: 1; }
    .tag { font-family: var(--nx-font-mono); font-size: 9.5px; color: var(--nx-text-dim); text-transform: uppercase; letter-spacing: 0.1em; }
    .results { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
    .result {
      text-align: left; padding: 8px 10px; border-radius: var(--nx-r-2); cursor: pointer;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line); color: var(--nx-text); font-size: 13px;
    }
    .result.guest { color: var(--nx-orange-500); }
    .first { margin-top: 0; }
    .spaced-top { margin-top: 12px; }
  `,
})
export class AulaSingleModalComponent {
  readonly arenaId = input.required<string>();
  /** Data sugerida (dia aberto na agenda). */
  readonly initialDate = input<string | null>(null);
  readonly closed = output<void>();
  readonly created = output<string>();

  protected readonly types = SINGLE_TYPES;
  protected readonly typeLabel = CLASS_TYPE_LABEL;
  protected readonly durations = [30, 45, 60, 90, 120];
  protected readonly today = todayKeyLocal();

  protected readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly courts = signal<Array<{ id: string; name: string; types: string[] }>>([]);
  protected readonly type = signal<ClassType>('particular');
  protected readonly students = signal<DraftStudent[]>([]);
  protected readonly term = signal('');
  protected readonly results = signal<AthleteSearchResult[]>([]);
  protected readonly teacherId = signal('');
  protected readonly courtId = signal('');
  protected readonly date = signal(this.today);
  protected readonly startTime = signal('10:00');
  protected readonly duration = signal(60);
  protected readonly capacity = signal(CAPACITY_BY_TYPE.particular);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly checking = signal(false);
  protected readonly conflict = signal<string | null>(null);

  protected readonly optionsLoaded = signal(false);
  protected readonly activeTeachers = computed(() => this.teachers().filter((t) => t.status === 'active'));
  protected readonly maxStudents = computed(() => CAPACITY_BY_TYPE[this.type()]);
  protected readonly canSave = computed(
    () =>
      !this.busy() &&
      !this.checking() &&
      this.conflict() == null &&
      this.students().length > 0 &&
      !!this.teacherId() &&
      !!this.courtId() &&
      !!this.date() &&
      /^\d{2}:\d{2}$/.test(this.startTime()),
  );

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private studentSeq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (this.previewTimer) clearTimeout(this.previewTimer);
    });

    effect(() => {
      const arenaId = this.arenaId();
      const initial = this.initialDate();
      untracked(() => {
        if (initial && initial >= this.today) this.date.set(initial);
        void this.loadOptions(arenaId);
      });
    });

    effect(() => {
      const input = {
        arenaId: this.arenaId(),
        courtId: this.courtId(),
        date: this.date(),
        startTime: this.startTime(),
        endTime: endTimeFor(this.startTime(), this.duration()),
        type: this.type(),
      };
      if (this.previewTimer) clearTimeout(this.previewTimer);
      untracked(() => this.conflict.set(null));
      if (!input.courtId || !input.date || !/^\d{2}:\d{2}$/.test(input.startTime)) return;
      untracked(() => this.checking.set(true));
      const seq = ++this.seq;
      this.previewTimer = setTimeout(() => {
        previewClassSchedule(arenaFunctions(), {
          arenaId: input.arenaId,
          type: input.type,
          weekdays: [],
          startTime: input.startTime,
          endTime: input.endTime,
          courtId: input.courtId,
          startDate: input.date,
          endDate: input.date,
        })
          .then((r) => {
            if (seq === this.seq) this.conflict.set(r.conflicts[0]?.label ?? null);
          })
          .catch((err: unknown) => {
            if (seq === this.seq) this.error.set(err instanceof Error ? err.message : 'Não foi possível conferir a agenda.');
          })
          .finally(() => {
            if (seq === this.seq) this.checking.set(false);
          });
      }, 350);
    });
  }

  private async loadOptions(arenaId: string): Promise<void> {
    const db = arenaFirestore();
    try {
      const [teachers, courts] = await Promise.all([fetchTeachers(db, arenaId), fetchCourtsList(db, arenaId)]);
      this.teachers.set(teachers);
      this.courts.set(courts.map((c) => ({ id: c.id, name: c.name, types: c.types })));
      const firstTeacher = teachers.find((t) => t.status === 'active');
      if (firstTeacher) this.teacherId.set(firstTeacher.id);
      if (courts[0]) this.courtId.set(courts[0].id);
    } catch {
      this.error.set('Não foi possível carregar professores e quadras.');
    } finally {
      this.optionsLoaded.set(true);
    }
  }

  protected setType(t: ClassType): void {
    this.type.set(t);
    this.capacity.set(CAPACITY_BY_TYPE[t]);
    if (this.students().length > CAPACITY_BY_TYPE[t]) this.students.set(this.students().slice(0, CAPACITY_BY_TYPE[t]));
  }

  protected onTerm(value: string): void {
    this.term.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (value.trim().length < 2) {
      this.results.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      searchAthletes(arenaFirestore(), value)
        .then((r) => this.results.set(r.filter((a) => !this.students().some((s) => s.athleteId === a.id))))
        .catch(() => this.results.set([]));
    }, 300);
  }

  protected addAthlete(a: AthleteSearchResult): void {
    this.students.set([...this.students(), { key: `a-${a.id}`, athleteId: a.id, name: a.name }]);
    this.term.set('');
    this.results.set([]);
  }

  protected addGuest(): void {
    const name = this.term().trim();
    if (name.length < 2) return;
    this.students.set([...this.students(), { key: `g-${++this.studentSeq}`, athleteId: null, name }]);
    this.term.set('');
    this.results.set([]);
  }

  protected removeStudent(key: string): void {
    this.students.set(this.students().filter((s) => s.key !== key));
  }

  protected dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const students: NewStudentInput[] = this.students().map((s) => (s.athleteId ? { athleteId: s.athleteId } : { name: s.name }));
      const court = this.courts().find((c) => c.id === this.courtId());
      const names = this.students().map((s) => s.name.split(' ')[0]);
      const result = await upsertClass(arenaFunctions(), {
        arenaId: this.arenaId(),
        // O rótulo da agenda já diz o tipo ("Aula particular · …"), então o nome é só quem treina.
        name: (this.type() === 'experimental' ? names.join(', ') : names.join(' & ')).slice(0, 60),
        type: this.type(),
        sport: court?.types[0] ?? 'beachTennis',
        level: 'livre',
        teacherId: this.teacherId(),
        weekdays: [],
        startTime: this.startTime(),
        endTime: endTimeFor(this.startTime(), this.duration()),
        courtId: this.courtId(),
        capacity: Math.max(this.capacity(), students.length),
        startDate: this.date(),
        endDate: this.date(),
        students,
      });
      this.created.emit(result.classId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível agendar a aula.');
    } finally {
      this.busy.set(false);
    }
  }
}
