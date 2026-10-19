import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaSingleModalComponent } from './aula-single-modal.component';
import { AulaStatComponent, AulaTypeTagComponent, AulasPageComponent, OccupancyBarComponent, TeacherAvatarComponent } from './aulas-ui';
import {
  addDaysKey,
  classesOccupancy,
  compareSessions,
  sessionLiveState,
  teacherStats,
  todayKeyLocal,
  weekdayDateLabel,
  type ArenaClass,
  type ClassSession,
  type ClassTeacher,
  type SessionLiveState,
} from './class.model';
import { fetchClasses, fetchSessionsBetween, fetchTeachers, watchSessionsBetween } from './classes-repository';

const STATE_LABEL: Record<SessionLiveState, string> = { done: 'Concluída', live: 'Em andamento', next: 'Próxima', canceled: 'Cancelada' };
const STATE_TONE = { done: 'dim', live: 'red', next: 'orange', canceled: 'dim' } as const;

interface Pending {
  tone: 'red' | 'yellow' | 'orange';
  title: string;
  sub: string;
  cta: string;
  route: unknown[];
}

/** 01 · Visão geral — aulas de hoje, pendências e ocupação por professor. Receita e
 *  inadimplência entram com a cobrança (fase 2). */
@Component({
  selector: 'ar-panel-aulas-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AulasPageComponent,
    PanelCardComponent,
    PillComponent,
    IconComponent,
    AulaStatComponent,
    AulaTypeTagComponent,
    TeacherAvatarComponent,
    OccupancyBarComponent,
    AulaSingleModalComponent,
  ],
  template: `
    <ar-aulas-page title="Aulas" [subtitle]="subtitle()" tab="visao" [empty]="!loading() && classes().length === 0">
      <div page-actions style="display: flex; gap: 8px; flex-wrap: wrap">
        <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="singleOpen.set(true)">
          <ar-icon name="plus" [size]="14" />
          Aula avulsa
        </button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="go(['/painel/aulas/turmas/nova'])">
          <ar-icon name="plus" [size]="14" />
          Criar turma
        </button>
      </div>

      @if (loading()) {
        <p class="state-text">Carregando aulas…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else {
        <div class="stats">
          <ar-aula-stat label="Aulas hoje" [value]="'' + today().length" [sub]="todaySub()" />
          <ar-aula-stat label="Alunos nas turmas" [value]="'' + occupancy().students" [sub]="activeClasses().length + ' turma(s) ativa(s)'" />
          <ar-aula-stat label="Ocupação das turmas" [value]="occupancy().pct + '%'" [sub]="occupancy().students + ' de ' + occupancy().capacity + ' vagas'" tone="orange" />
          <ar-aula-stat label="Aulas sem quadra" [value]="'' + conflictCount()" [tone]="conflictCount() > 0 ? 'red' : 'default'" sub="horário já ocupado" />
        </div>

        <div class="layout">
          <ar-panel-card title="Aulas de hoje" [kicker]="'Agora ' + nowLabel()">
            <button card-actions type="button" class="ar-ghost-btn" (click)="go(['/painel/aulas/agenda'])">Ver agenda</button>
            @for (s of today(); track s.id) {
              <button type="button" class="row" [class.faded]="state(s) === 'done' || state(s) === 'canceled'" (click)="go(['/painel/aulas/aula', s.id])">
                <div class="time">
                  <div class="t1">{{ s.startTime }}</div>
                  <div class="t2">até {{ s.endTime }}</div>
                </div>
                <span class="bar" [style.background]="s.teacherColor"></span>
                <div class="what">
                  <div class="title-row">
                    <span class="title">{{ s.className }}</span>
                    <ar-aula-type-tag [type]="s.type" />
                  </div>
                  <div class="sub">{{ s.courtName }}</div>
                </div>
                <div class="teacher">
                  <ar-teacher-avatar [name]="s.teacherName" [color]="s.teacherColor" [size]="24" />
                  <span>{{ s.teacherName.split(' ')[0] }}</span>
                </div>
                <span class="count">{{ countLabel(s) }}</span>
                <span class="pill-cell"><ar-pill [tone]="stateTone[state(s)]">{{ stateLabel[state(s)] }}</ar-pill></span>
              </button>
            } @empty {
              <p class="state-text">Nenhuma aula hoje.</p>
            }
            <p class="foot">As quadras das aulas ficam bloqueadas na agenda de reservas automaticamente.</p>
          </ar-panel-card>

          <div class="side">
            <ar-panel-card title="Precisa de atenção" [kicker]="pending().length + ' pendência' + (pending().length === 1 ? '' : 's')">
              @for (p of pending(); track p.title) {
                <div class="pend">
                  <span class="pdot" [class]="'pdot tone-' + p.tone"></span>
                  <div class="pend-text">
                    <div class="pend-title">{{ p.title }}</div>
                    <div class="pend-sub">{{ p.sub }}</div>
                  </div>
                  <button type="button" class="ar-mini-btn" (click)="go(p.route)">{{ p.cta }}</button>
                </div>
              } @empty {
                <p class="state-text">Tudo em dia.</p>
              }
            </ar-panel-card>

            <ar-panel-card title="Ocupação por professor" kicker="Turmas ativas">
              @for (t of teacherRows(); track t.teacher.id) {
                <div class="occ-row">
                  <ar-teacher-avatar [name]="t.teacher.name" [color]="t.teacher.color" [size]="26" />
                  <span class="occ-name">{{ t.teacher.name.split(' ')[0] }}</span>
                  <ar-occupancy-bar [pct]="t.pct" [color]="t.teacher.color" />
                  <span class="occ-pct">{{ t.pct }}%</span>
                </div>
              } @empty {
                <p class="state-text">Sem professores com turma ativa.</p>
              }
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-aulas-page>

    @if (singleOpen() && arenaId(); as id) {
      <ar-aula-single-modal [arenaId]="id" (closed)="singleOpen.set(false)" (created)="singleOpen.set(false)" />
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .row {
      display: grid; grid-template-columns: 64px 4px minmax(0, 1fr) 130px 70px 120px; gap: 14px; align-items: center;
      width: 100%; padding: 11px 0; background: none; border: none; border-bottom: 1px solid var(--nx-line);
      text-align: left; cursor: pointer; color: inherit;
    }
    .row:hover .title { color: var(--nx-orange-500); }
    .row.faded { opacity: 0.62; }
    .t1 { font-family: var(--nx-font-mono); font-size: 13px; font-weight: 700; color: var(--nx-text); }
    .t2 { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); }
    .bar { align-self: stretch; border-radius: 2px; }
    .what { min-width: 0; }
    .title-row { display: flex; align-items: center; gap: 8px; }
    .title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13.5px; color: var(--nx-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); margin-top: 3px; }
    .teacher { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--nx-text-mute); }
    .count { font-family: var(--nx-font-mono); font-size: 12px; font-weight: 700; color: var(--nx-text); }
    .pill-cell { display: flex; justify-content: flex-end; }
    .foot { font-size: 12px; color: var(--nx-text-dim); margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .pend { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--nx-line); }
    .pend:last-child { border-bottom: none; }
    .pdot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .pdot.tone-red { background: var(--nx-live); }
    .pdot.tone-yellow { background: var(--nx-pending); }
    .pdot.tone-orange { background: var(--nx-orange-500); }
    .pend-text { flex: 1; min-width: 0; }
    .pend-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .pend-sub { font-size: 11.5px; color: var(--nx-text-dim); margin-top: 2px; }
    .occ-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--nx-line); }
    .occ-row:last-child { border-bottom: none; }
    .occ-name { width: 90px; font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .occ-pct { width: 40px; text-align: right; font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; color: var(--nx-text); }
    @media (max-width: 1180px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      .row { grid-template-columns: 56px 4px minmax(0, 1fr) auto; }
      .teacher, .count { display: none; }
    }
  `,
})
export class PanelAulasOverviewComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);

  protected readonly stateLabel = STATE_LABEL;
  protected readonly stateTone = STATE_TONE;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda') || !this.arenaContext.hasCapability('aulas'));
  protected readonly arenaId = computed(() => this.arenaContext.arenaId());

  private readonly todayKey = todayKeyLocal();
  private readonly now = signal(new Date());
  protected readonly classes = signal<ArenaClass[]>([]);
  protected readonly teachers = signal<ClassTeacher[]>([]);
  protected readonly todaySessions = signal<ClassSession[]>([]);
  protected readonly recent = signal<ClassSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly singleOpen = signal(false);

  private readonly classById = computed(() => new Map(this.classes().map((c) => [c.id, c])));
  protected readonly today = computed(() => [...this.todaySessions()].sort(compareSessions));
  protected readonly activeClasses = computed(() => this.classes().filter((c) => c.status === 'active' && c.weekdays.length > 0));
  protected readonly occupancy = computed(() => classesOccupancy(this.classes()));
  protected readonly conflictCount = computed(() =>
    this.classes()
      .filter((c) => c.status === 'active')
      .reduce((n, c) => n + c.conflictDates.filter((d) => d >= this.todayKey).length, 0),
  );
  protected readonly nowLabel = computed(() => {
    const n = this.now();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  });
  protected readonly subtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · ${weekdayDateLabel(this.todayKey)} · ${this.teachers().length} professores · ${this.activeClasses().length} turmas`,
  );
  protected readonly todaySub = computed(() => {
    const states = this.today().map((s) => this.state(s));
    const done = states.filter((s) => s === 'done').length;
    const live = states.filter((s) => s === 'live').length;
    return `${done} concluída${done === 1 ? '' : 's'} · ${live} agora`;
  });
  protected readonly teacherRows = computed(() => {
    const stats = teacherStats(this.classes());
    return this.teachers()
      .filter((t) => stats.has(t.id))
      .map((t) => ({ teacher: t, pct: stats.get(t.id)!.occupancyPct }))
      .sort((a, b) => b.pct - a.pct);
  });
  protected readonly pending = computed<Pending[]>(() => {
    const out: Pending[] = [];
    for (const c of this.classes()) {
      const n = c.status === 'active' ? c.conflictDates.filter((d) => d >= this.todayKey).length : 0;
      if (n > 0) {
        out.push({
          tone: 'red',
          title: `${c.name}: ${n} aula${n === 1 ? '' : 's'} sem quadra`,
          sub: 'O horário já estava reservado ou bloqueado',
          cta: 'Resolver',
          route: ['/painel/aulas/turmas', c.id],
        });
      }
    }
    const open = this.recent().filter((s) => s.status === 'scheduled' && this.state(s) === 'done');
    if (open.length > 0) {
      const first = open[open.length - 1]!;
      out.push({
        tone: 'yellow',
        title: `${open.length} chamada${open.length === 1 ? '' : 's'} sem fechar`,
        sub: `Mais recente: ${first.className} · ${weekdayDateLabel(first.date)}`,
        cta: 'Fazer chamada',
        route: ['/painel/aulas/aula', first.id],
      });
    }
    const empty = this.activeClasses().filter((c) => c.studentCount === 0);
    if (empty.length > 0) {
      out.push({
        tone: 'orange',
        title: `${empty.length} turma${empty.length === 1 ? '' : 's'} sem alunos`,
        sub: empty.slice(0, 2).map((c) => c.name).join(', '),
        cta: 'Matricular',
        route: ['/painel/aulas/turmas', empty[0]!.id],
      });
    }
    return out;
  });

  private unsub: Unsubscribe | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const tick = setInterval(() => this.now.set(new Date()), 60_000);
    destroyRef.onDestroy(() => {
      clearInterval(tick);
      this.unsub?.();
    });
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
      this.unsub?.();
      this.unsub = watchSessionsBetween(arenaFirestore(), arenaId, this.todayKey, this.todayKey, (list) => this.todaySessions.set(list));
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const [classes, teachers, recent] = await Promise.all([
        fetchClasses(db, arenaId),
        fetchTeachers(db, arenaId),
        fetchSessionsBetween(db, arenaId, addDaysKey(this.todayKey, -7), this.todayKey),
      ]);
      this.classes.set(classes);
      this.teachers.set(teachers.filter((t) => t.status === 'active'));
      this.recent.set(recent);
    } catch {
      this.loadError.set('Não foi possível carregar as aulas.');
    } finally {
      this.loading.set(false);
    }
  }

  protected state(s: ClassSession): SessionLiveState {
    return sessionLiveState(s, this.now(), this.todayKey);
  }

  protected countLabel(s: ClassSession): string {
    const enrolled = this.classById().get(s.classId)?.studentCount ?? 0;
    const marked = Object.values(s.attendance);
    if (marked.length === 0) return `${enrolled} aluno${enrolled === 1 ? '' : 's'}`;
    const present = marked.filter((a) => a.mark === 'present').length;
    return `${present}/${Math.max(enrolled, marked.length)}`;
  }

  protected go(route: unknown[]): void {
    void this.router.navigate(route);
  }
}
