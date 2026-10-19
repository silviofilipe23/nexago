import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaStatComponent, AulasPageComponent, OccupancyBarComponent, TeacherAvatarComponent } from './aulas-ui';
import { TEACHER_COLORS, teacherStats, type ArenaClass, type ClassTeacher } from './class.model';
import { fetchClasses, fetchTeachers, upsertTeacher } from './classes-repository';

interface TeacherDraft {
  teacherId: string | null;
  name: string;
  specialty: string;
  phone: string;
  color: string;
}

/** 14 · Professores — cadastro simples (nome, modalidade, contato, cor) com aulas/semana,
 *  alunos e ocupação calculados das turmas ativas. Repasse fica para a fase 2. */
@Component({
  selector: 'ar-panel-aulas-teachers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AulasPageComponent,
    PanelCardComponent,
    AulaStatComponent,
    PillComponent,
    IconComponent,
    ModalComponent,
    TeacherAvatarComponent,
    OccupancyBarComponent,
  ],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Professores da arena · agenda e alunos" tab="professores" [empty]="!loading() && teachers().length === 0">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openNew()">
        <ar-icon name="plus" [size]="14" />
        Adicionar professor
      </button>

      @if (loading()) {
        <p class="state-text">Carregando professores…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="kpis">
          <ar-aula-stat label="Professores ativos" [value]="'' + activeTeachers().length" />
          <ar-aula-stat label="Aulas na semana" [value]="'' + totals().classesPerWeek" sub="das turmas ativas" />
          <ar-aula-stat label="Alunos nas turmas" [value]="'' + totals().students" />
          <ar-aula-stat label="Ocupação média" [value]="totals().pct + '%'" tone="orange" />
        </div>

        <ar-panel-card title="Professores" [kicker]="teachers().length + ' cadastrados'">
          <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Tabela de professores">
            <div class="ar-table-inner">
              <div class="table-head">
                <span>Professor</span><span>Modalidade</span><span>Aulas/sem</span><span>Alunos</span><span>Ocupação</span><span>Status</span><span></span>
              </div>
              @for (t of teachers(); track t.id) {
                <div class="table-row" [class.archived]="t.status === 'archived'">
                  <div class="who">
                    <ar-teacher-avatar [name]="t.name" [color]="t.color" [size]="36" />
                    <div>
                      <div class="name">{{ t.name }}</div>
                      <div class="sub">{{ t.phone || 'Sem telefone' }}</div>
                    </div>
                  </div>
                  <span class="cell">{{ t.specialty || '—' }}</span>
                  <span class="mono">{{ stats().get(t.id)?.classesPerWeek ?? 0 }}</span>
                  <span class="mono">{{ stats().get(t.id)?.students ?? 0 }}</span>
                  <div class="occ">
                    <ar-occupancy-bar [pct]="stats().get(t.id)?.occupancyPct ?? 0" [color]="t.color" />
                    <span class="mono">{{ stats().get(t.id)?.occupancyPct ?? 0 }}%</span>
                  </div>
                  <div>
                    <ar-pill [tone]="t.status === 'active' ? 'green' : 'dim'">{{ t.status === 'active' ? 'Ativo' : 'Arquivado' }}</ar-pill>
                  </div>
                  <div class="actions">
                    <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="openEdit(t)">Editar</button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty">Nenhum professor ainda. Cadastre quem dá aula na arena para montar as turmas.</p>
              }
            </div>
          </div>
        </ar-panel-card>
      }
    </ar-aulas-page>

    @if (draft(); as d) {
      <ar-modal (close)="closeModal()">
        <p class="modal-title">{{ d.teacherId ? 'Editar professor' : 'Novo professor' }}</p>
        <p class="modal-sub">A cor identifica as aulas dele na agenda.</p>
        @if (saveError(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        <div class="field-label spaced">Nome</div>
        <input class="input-box" type="text" maxlength="60" [value]="d.name" (input)="patch({ name: $any($event.target).value })" />
        <div class="row-2">
          <div>
            <div class="field-label spaced">Modalidade</div>
            <input class="input-box" type="text" maxlength="60" placeholder="Ex.: Beach Tennis · Kids" [value]="d.specialty" (input)="patch({ specialty: $any($event.target).value })" />
          </div>
          <div>
            <div class="field-label spaced">Telefone</div>
            <input class="input-box" type="tel" maxlength="30" [value]="d.phone" (input)="patch({ phone: $any($event.target).value })" />
          </div>
        </div>
        <div class="field-label spaced">Cor</div>
        <div class="color-row">
          @for (c of colors; track c) {
            <button type="button" class="color-swatch" [class.active]="d.color === c" [style.background]="c" [attr.aria-label]="'Cor ' + c" (click)="patch({ color: c })"></button>
          }
        </div>
        <div class="modal-actions">
          @if (d.teacherId) {
            <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="toggleArchive()">
              {{ editingArchived() ? 'Reativar' : 'Arquivar' }}
            </button>
            <span class="grow"></span>
          }
          <button type="button" class="ar-mini-btn" (click)="closeModal()">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || d.name.trim().length < 2" (click)="save()">
            {{ saving() ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .table-head, .table-row {
      display: grid;
      grid-template-columns: minmax(220px, 1.5fr) minmax(140px, 1fr) 80px 70px minmax(150px, 1fr) 100px 90px;
      gap: 12px;
      align-items: center;
    }
    .table-head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span {
      font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .table-row { padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .table-row:last-child { border-bottom: none; }
    .table-row.archived { opacity: 0.55; }
    .who { display: flex; align-items: center; gap: 11px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); }
    .sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .cell { font-size: 12.5px; color: var(--nx-text-mute); }
    .mono { font-family: var(--nx-font-mono); font-size: 12.5px; font-weight: 700; color: var(--nx-text); }
    .occ { display: flex; align-items: center; gap: 8px; }
    .actions { display: flex; justify-content: flex-end; }
    .grow { flex: 1; }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class PanelAulasTeachersComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly colors = TEACHER_COLORS;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  protected readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly classes = signal<ArenaClass[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly draft = signal<TeacherDraft | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly activeTeachers = computed(() => this.teachers().filter((t) => t.status === 'active'));
  protected readonly stats = computed(() => teacherStats(this.classes()));
  protected readonly totals = computed(() => {
    let classesPerWeek = 0;
    let students = 0;
    let capacity = 0;
    for (const s of this.stats().values()) {
      classesPerWeek += s.classesPerWeek;
      students += s.students;
      capacity += s.capacity;
    }
    return { classesPerWeek, students, pct: capacity > 0 ? Math.round((students / capacity) * 100) : 0 };
  });
  protected readonly editingArchived = computed(() => {
    const id = this.draft()?.teacherId;
    return id != null && this.teachers().find((t) => t.id === id)?.status === 'archived';
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const [teachers, classes] = await Promise.all([fetchTeachers(db, arenaId), fetchClasses(db, arenaId)]);
      this.teachers.set([...teachers].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)));
      this.classes.set(classes);
    } catch {
      this.loadError.set('Não foi possível carregar os professores.');
    } finally {
      this.loading.set(false);
    }
  }

  protected openNew(): void {
    if (this.readOnly()) return;
    const used = new Set(this.teachers().map((t) => t.color));
    const color = TEACHER_COLORS.find((c) => !used.has(c)) ?? TEACHER_COLORS[0]!;
    this.saveError.set(null);
    this.draft.set({ teacherId: null, name: '', specialty: '', phone: '', color });
  }

  protected openEdit(t: ClassTeacher): void {
    if (this.readOnly()) return;
    this.saveError.set(null);
    this.draft.set({ teacherId: t.id, name: t.name, specialty: t.specialty ?? '', phone: t.phone ?? '', color: t.color });
  }

  protected patch(change: Partial<TeacherDraft>): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, ...change });
  }

  protected closeModal(): void {
    if (!this.saving()) this.draft.set(null);
  }

  protected save(): Promise<void> {
    return this.persist(this.editingArchived() ? 'archived' : 'active');
  }

  protected toggleArchive(): Promise<void> {
    return this.persist(this.editingArchived() ? 'active' : 'archived');
  }

  private async persist(status: 'active' | 'archived'): Promise<void> {
    const d = this.draft();
    const arenaId = this.arenaContext.arenaId();
    if (!d || !arenaId || this.readOnly()) return;
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await upsertTeacher(arenaFunctions(), {
        arenaId,
        teacherId: d.teacherId ?? undefined,
        name: d.name.trim(),
        specialty: d.specialty.trim() || null,
        phone: d.phone.trim() || null,
        color: d.color,
        status,
      });
      this.draft.set(null);
      await this.load(arenaId);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar o professor.');
    } finally {
      this.saving.set(false);
    }
  }
}
