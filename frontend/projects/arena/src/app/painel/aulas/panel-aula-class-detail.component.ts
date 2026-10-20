import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import type { AthleteSearchResult } from '../clubinho/clubs-repository';
import { AulaAthletePickerComponent, AulaCancelModalComponent, AulaEnrollModalComponent } from './aula-modals.component';
import { AulaStatComponent, AulaTypeTagComponent, AulasPageComponent, OccupancyBarComponent, TeacherAvatarComponent } from './aulas-ui';
import { whatsappLink, type WaitlistEntry } from './billing.model';
import { addWaitlist, removeWaitlist, watchWaitlist } from './billing-repository';
import {
  CANCEL_REASON_LABEL,
  CLASS_LEVEL_LABEL,
  WEEKDAY_SHORT,
  addDaysKey,
  classScheduleLabel,
  shortDate,
  sportLabel,
  studentAttendsWeekday,
  todayKeyLocal,
  weekdayDateLabel,
  weekdaysLabel,
  type ArenaClass,
  type CancelReason,
  type ClassSession,
  type ClassStudent,
} from './class.model';
import {
  fetchClass,
  fetchClassSessions,
  removeClassStudent,
  scheduleClassDate,
  setClassStatus,
  watchClassStudents,
} from './classes-repository';

/** Frequência por aluno nas aulas com chamada: presença / aulas marcadas. */
export function studentFrequency(sessions: readonly ClassSession[], studentId: string): number | null {
  let marked = 0;
  let present = 0;
  for (const s of sessions) {
    const mark = s.attendance[studentId]?.mark;
    if (!mark) continue;
    marked += 1;
    if (mark === 'present') present += 1;
  }
  return marked > 0 ? Math.round((present / marked) * 100) : null;
}

type ConfirmAction = { kind: 'pause' | 'resume' | 'archive' } | { kind: 'remove'; student: ClassStudent };

interface WaitForm {
  mode: 'athlete' | 'guest';
  picked: AthleteSearchResult | null;
  name: string;
  phone: string;
  note: string;
}

/** Vagas por dia da semana: quem faz só terça não ocupa a quinta. */
export function spotsByWeekday(cls: Pick<ArenaClass, 'weekdays' | 'capacity'>, students: readonly ClassStudent[]): Array<{ weekday: number; left: number }> {
  const active = students.filter((s) => s.status === 'active');
  return cls.weekdays.map((weekday) => ({
    weekday,
    left: Math.max(0, cls.capacity - active.filter((s) => studentAttendsWeekday(s, weekday)).length),
  }));
}

/** 06 · Turma — alunos, próximas aulas e datas em conflito. */
@Component({
  selector: 'ar-panel-aula-class-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AulasPageComponent,
    PanelCardComponent,
    IconComponent,
    AvatarComponent,
    ModalComponent,
    AulaStatComponent,
    AulaTypeTagComponent,
    TeacherAvatarComponent,
    OccupancyBarComponent,
    AulaCancelModalComponent,
    AulaEnrollModalComponent,
    AulaAthletePickerComponent,
  ],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page [title]="cls()?.name ?? 'Turma'" [subtitle]="subtitle()">
      <div page-actions style="display: flex; gap: 8px; flex-wrap: wrap">
        <button type="button" class="ar-mini-btn" (click)="back()">
          <ar-icon name="chevron-left" [size]="14" />
          Turmas
        </button>
        @if (cls(); as c) {
          @if (c.status !== 'archived') {
            <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="edit()">
              <ar-icon name="edit" [size]="14" />
              Editar turma
            </button>
            <button type="button" class="ar-mini-btn" [disabled]="cargoReadOnly()" (click)="ask({ kind: c.status === 'paused' ? 'resume' : 'pause' })">
              <ar-icon [name]="c.status === 'paused' ? 'play' : 'pause'" [size]="14" />
              {{ c.status === 'paused' ? 'Reativar' : 'Pausar' }}
            </button>
            @if (c.weekdays.length > 0) {
              <button type="button" class="ar-mini-btn" [disabled]="cargoReadOnly() || full()" [title]="'Aluno sem plano e sem cobrança — todos os dias da turma'" (click)="enrollOpen.set(true)">
                Adicionar sem plano
              </button>
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="cargoReadOnly() || c.status !== 'active'" (click)="goEnroll({ classId: c.id })">
                <ar-icon name="plus" [size]="14" />
                Matricular aluno
              </button>
            } @else {
              <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="cargoReadOnly() || full()" (click)="enrollOpen.set(true)">
                <ar-icon name="plus" [size]="14" />
                Adicionar aluno
              </button>
            }
          }
        }
      </div>

      @if (loading()) {
        <p class="state-text">Carregando turma…</p>
      } @else if (loadError(); as err) {
        <p class="state-text">{{ err }}</p>
      } @else if (cls(); as c) {
        @if (actionError(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (c.status === 'paused') {
          <div class="banner">Turma pausada: as aulas saíram da agenda e a quadra está livre para aluguel. Reative para agendar de novo.</div>
        } @else if (c.status === 'archived') {
          <div class="banner">Turma encerrada. O histórico de aulas e presença continua aqui.</div>
        }

        <div class="stats">
          <ar-aula-stat label="Alunos" [value]="c.studentCount + '/' + c.capacity" [sub]="spotsSub()" />
          <ar-aula-stat label="Próxima aula" [value]="nextSession() ? dateLabel(nextSession()!.date) : '—'" [sub]="nextSession() ? nextSession()!.startTime + ' · ' + nextSession()!.courtName : 'Nada agendado'" />
          <ar-aula-stat label="Frequência · 30 dias" [value]="classFrequency() == null ? '—' : classFrequency() + '%'" [sub]="closedCount() + ' aula(s) com chamada'" />
          <ar-aula-stat label="Sem quadra" [value]="'' + futureConflicts().length" [tone]="futureConflicts().length > 0 ? 'red' : 'default'" sub="datas com horário ocupado" />
        </div>

        <div class="layout">
          <div class="main">
          <ar-panel-card title="Alunos matriculados" [kicker]="activeStudents().length + ' aluno(s) · ' + c.capacity + ' vagas por aula'">
            <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Alunos da turma">
              <div class="ar-table-inner">
                <div class="table-head"><span>Aluno</span><span>Plano · dias</span><span>Contato</span><span>Frequência</span><span></span></div>
                @for (s of listedStudents(); track s.id) {
                  <div class="table-row" [class.off]="s.status === 'paused'">
                    <div class="who">
                      <ar-avatar [name]="s.name" [photoUrl]="s.photoUrl" [size]="32" zoomable personRole="Aluno" [meta]="s.planName" />
                      <div class="min0">
                        <div class="name">{{ s.name }}</div>
                        <div class="sub">{{ s.status === 'paused' ? 'Plano pausado' : s.athleteId ? 'Conta NexaGO' : 'Sem conta' }}</div>
                      </div>
                    </div>
                    <div class="min0">
                      <div class="plan">{{ s.planName ?? 'Sem plano' }}</div>
                      <div class="sub">{{ s.weekdays ? daysLabel(s.weekdays) : 'Todos os dias' }}</div>
                    </div>
                    <span class="mono dim">{{ s.phone || '—' }}</span>
                    <div class="freq">
                      @let f = frequency(s.id);
                      @if (f != null) {
                        <ar-occupancy-bar [pct]="f" />
                        <span class="mono">{{ f }}%</span>
                      } @else {
                        <span class="mono dim">sem chamada</span>
                      }
                    </div>
                    <div class="actions">
                      @if (s.enrollmentId) {
                        <button type="button" class="ar-ghost-btn" (click)="openStudent(s.enrollmentId)">Ver aluno</button>
                      } @else {
                        @if (c.weekdays.length > 0 && c.status === 'active') {
                          <button type="button" class="ar-ghost-btn" [disabled]="cargoReadOnly()" (click)="goEnroll({ classId: c.id, studentId: s.id })">Matricular</button>
                        }
                        <button type="button" class="ar-ghost-btn" [disabled]="cargoReadOnly()" (click)="ask({ kind: 'remove', student: s })">Remover</button>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="state-text empty">Nenhum aluno ainda. Matricule para montar a chamada.</p>
                }
              </div>
            </div>
          </ar-panel-card>

          @if (c.weekdays.length > 0 && c.status !== 'archived') {
            <ar-panel-card title="Lista de espera" [kicker]="waitlist().length + ' na fila'">
              <button card-actions type="button" class="ar-mini-btn" [disabled]="cargoReadOnly()" (click)="openWaitlistForm()">
                <ar-icon name="plus" [size]="14" />
                Adicionar
              </button>
              @for (w of waitlist(); track w.id; let i = $index) {
                <div class="wait-row">
                  <span class="num">{{ i + 1 }}</span>
                  <div class="min0 grow">
                    <div class="name">{{ w.name }}</div>
                    <div class="sub">{{ w.note || 'Qualquer dia' }}{{ w.createdAt ? ' · desde ' + shortDate(dayKey(w.createdAt)) : '' }}{{ w.phone ? ' · ' + w.phone : '' }}</div>
                  </div>
                  <div class="actions">
                    @if (offerLink(w); as link) {
                      <a class="ar-ghost-btn small link-btn" [href]="link" target="_blank" rel="noopener">Oferecer vaga</a>
                    }
                    <button type="button" class="ar-mini-btn small" [disabled]="cargoReadOnly() || c.status !== 'active'" (click)="goEnroll({ classId: c.id, waitlist: w.id })">Matricular</button>
                    <button type="button" class="ar-ghost-btn small" [disabled]="cargoReadOnly() || busy()" (click)="dropWaitlist(w)">Tirar</button>
                  </div>
                </div>
              } @empty {
                <p class="hint first">Ninguém esperando. Quando a turma lotar, anote aqui quem quer vaga e ofereça pelo WhatsApp quando abrir.</p>
              }
            </ar-panel-card>
          }
          </div>

          <div class="side">
            <ar-panel-card title="Próximas aulas" [kicker]="upcoming().length + ' agendadas'">
              @for (s of upcoming().slice(0, 8); track s.id) {
                <div class="next-row" [class.off]="s.status === 'canceled'">
                  <button type="button" class="next-date" (click)="openSession(s.id)">{{ dateLabel(s.date) }}</button>
                  <span class="next-info">
                    @if (s.status === 'canceled') {
                      Cancelada{{ s.cancelReason && reasonLabel(s.cancelReason) ? ' · ' + reasonLabel(s.cancelReason) : '' }}
                    } @else if (s.status === 'completed') {
                      Chamada fechada
                    } @else {
                      {{ s.courtName }} · {{ s.teacherName.split(' ')[0] }}
                    }
                  </span>
                  <span class="mono dim">{{ s.startTime }}</span>
                  @if (s.status === 'scheduled' && s.date >= today) {
                    <button type="button" class="ar-ghost-btn small" [disabled]="cargoReadOnly()" (click)="cancelTarget.set(s)">Cancelar</button>
                  }
                </div>
              } @empty {
                <p class="state-text">Nenhuma aula nos próximos dias.</p>
              }
            </ar-panel-card>

            @if (futureConflicts().length > 0) {
              <ar-panel-card title="Datas sem quadra" kicker="Conflito na agenda">
                <p class="hint first">A quadra já estava reservada ou bloqueada nesses dias, então a aula não foi criada. Libere o horário na Agenda e tente de novo.</p>
                @for (d of futureConflicts(); track d) {
                  <div class="next-row">
                    <span class="next-date static">{{ dateLabel(d) }}</span>
                    <span class="next-info">{{ c.startTime }}–{{ c.endTime }}</span>
                    <button type="button" class="ar-ghost-btn small" [disabled]="readOnly() || retrying() === d" (click)="retry(d)">
                      {{ retrying() === d ? 'Agendando…' : 'Tentar de novo' }}
                    </button>
                  </div>
                }
              </ar-panel-card>
            }

            <ar-panel-card title="Professor">
              <div class="teacher">
                <ar-teacher-avatar [name]="c.teacherName" [color]="c.teacherColor" [size]="34" />
                <div>
                  <div class="name">{{ c.teacherName }}</div>
                  <div class="sub">{{ c.courtName }} · {{ schedule() }}</div>
                </div>
                @if (c.type !== 'turma') {
                  <ar-aula-type-tag [type]="c.type" />
                }
              </div>
              @if (c.notes) {
                <p class="hint">{{ c.notes }}</p>
              }
              @if (c.status !== 'archived') {
                <button type="button" class="ar-ghost-btn archive" [disabled]="cargoReadOnly()" (click)="ask({ kind: 'archive' })">Encerrar turma</button>
              }
            </ar-panel-card>
          </div>
        </div>
      }
    </ar-aulas-page>

    @if (waitForm(); as f) {
      <ar-modal (close)="waitForm.set(null)">
        <p class="modal-title">Lista de espera</p>
        <p class="modal-sub">{{ cls()?.name }}</p>
        @if (waitError(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        <div class="chip-row">
          <button type="button" class="ar-chip" [class.active]="f.mode === 'athlete'" (click)="patchWait({ mode: 'athlete' })">Atleta NexaGO</button>
          <button type="button" class="ar-chip" [class.active]="f.mode === 'guest'" (click)="patchWait({ mode: 'guest' })">Sem conta</button>
        </div>
        @if (f.mode === 'athlete') {
          <div class="field-label spaced">Buscar atleta</div>
          <ar-aula-athlete-picker placeholder="Nome do atleta" emptyHint="Nenhum atleta encontrado. Use “Sem conta” para anotar só o nome." (selected)="patchWait({ picked: $event })" />
        } @else {
          <div class="field-label spaced">Nome</div>
          <input class="input-box" type="text" maxlength="80" [value]="f.name" (input)="patchWait({ name: $any($event.target).value })" />
        }
        <div class="field-label spaced">Telefone (WhatsApp)</div>
        <input class="input-box" type="tel" maxlength="30" [value]="f.phone" (input)="patchWait({ phone: $any($event.target).value })" />
        <div class="field-label spaced">Dia que prefere (opcional)</div>
        <div class="chip-row">
          @for (d of classWeekdays(); track d) {
            <button type="button" class="ar-chip" [class.active]="f.note === dayName(d)" (click)="patchWait({ note: f.note === dayName(d) ? '' : dayName(d) })">{{ dayName(d) }}</button>
          }
        </div>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="waitForm.set(null)">Cancelar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy() || !waitValid()" (click)="saveWaitlist()">{{ busy() ? 'Salvando…' : 'Adicionar' }}</button>
        </div>
      </ar-modal>
    }
    @if (enrollOpen() && cls(); as c) {
      <ar-aula-enroll-modal [classId]="c.id" [className]="c.name" [spotsLeft]="c.capacity - c.studentCount" (closed)="enrollOpen.set(false)" (enrolled)="onEnrolled()" />
    }
    @if (cancelTarget(); as s) {
      <ar-aula-cancel-modal [session]="s" (closed)="cancelTarget.set(null)" (canceled)="onCanceled()" />
    }
    @if (confirm(); as a) {
      <ar-modal (close)="confirm.set(null)">
        <p class="modal-title">{{ confirmTitle(a) }}</p>
        <p class="modal-sub">{{ confirmText(a) }}</p>
        <div class="modal-actions">
          <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="confirm.set(null)">Voltar</button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="runConfirm(a)">{{ busy() ? 'Aguarde…' : 'Confirmar' }}</button>
        </div>
      </ar-modal>
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .state-text.empty { margin: 14px 0 4px; }
    .banner {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-text-mute); flex: none;
    }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; flex: none; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .table-head, .table-row { display: grid; grid-template-columns: minmax(190px, 1.3fr) minmax(120px, 1fr) 120px minmax(120px, 1fr) 170px; gap: 12px; align-items: center; }
    .table-row.off { opacity: 0.6; }
    .main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .min0 { min-width: 0; }
    .grow { flex: 1; }
    .plan { font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text); }
    .wait-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--nx-line); }
    .wait-row:last-child { border-bottom: none; }
    .num { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); width: 18px; flex: none; }
    .link-btn { text-decoration: none; display: inline-flex; align-items: center; }
    .table-head { padding-bottom: 9px; border-bottom: 1px solid var(--nx-line-strong); }
    .table-head span { font-family: var(--nx-font-mono); font-size: 9px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .table-row { padding: 11px 0; border-bottom: 1px solid var(--nx-line); }
    .table-row:last-child { border-bottom: none; }
    .who, .teacher { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .teacher > div { flex: 1; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .mono { font-family: var(--nx-font-mono); font-size: 11.5px; font-weight: 700; color: var(--nx-text); }
    .mono.dim { font-weight: 500; color: var(--nx-text-dim); }
    .freq { display: flex; align-items: center; gap: 8px; }
    .actions { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }
    .next-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--nx-line); }
    .next-row:last-child { border-bottom: none; }
    .next-row.off { opacity: 0.55; }
    .next-date {
      width: 84px; flex: none; text-align: left; background: none; border: none; padding: 0; cursor: pointer;
      font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; color: var(--nx-text);
    }
    .next-date.static { cursor: default; }
    .next-date:not(.static):hover { color: var(--nx-orange-500); }
    .next-info { flex: 1; min-width: 0; font-size: 12px; color: var(--nx-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .small { height: 26px; font-size: 11.5px; }
    .first { margin-top: 0; }
    .archive { margin-top: 14px; align-self: flex-start; color: var(--nx-live); }
    @media (max-width: 1180px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class PanelAulaClassDetailComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly today = todayKeyLocal();
  protected readonly dateLabel = weekdayDateLabel;
  protected readonly cargoReadOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly readOnly = computed(() => this.cargoReadOnly() || !this.arenaContext.hasCapability('aulas'));

  private readonly classId = this.route.snapshot.paramMap.get('classId') ?? '';
  protected readonly cls = signal<ArenaClass | null>(null);
  protected readonly students = signal<ClassStudent[]>([]);
  protected readonly sessions = signal<ClassSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly enrollOpen = signal(false);
  protected readonly cancelTarget = signal<ClassSession | null>(null);
  protected readonly confirm = signal<ConfirmAction | null>(null);
  protected readonly busy = signal(false);
  protected readonly retrying = signal<string | null>(null);

  protected readonly activeStudents = computed(() => this.students().filter((s) => s.status === 'active'));
  protected readonly listedStudents = computed(() => this.students().filter((s) => s.status === 'active' || s.status === 'paused'));
  protected readonly daySpots = computed(() => {
    const c = this.cls();
    return c ? spotsByWeekday(c, this.students()) : [];
  });
  /** "Adicionar sem plano" põe o aluno em todos os dias — precisa de vaga em todos. */
  protected readonly full = computed(() => {
    const c = this.cls();
    if (!c) return false;
    if (c.weekdays.length === 0) return c.studentCount >= c.capacity;
    return this.daySpots().some((d) => d.left === 0);
  });
  protected readonly spotsSub = computed(() => {
    const c = this.cls();
    if (!c) return '';
    if (c.weekdays.length === 0) return c.studentCount >= c.capacity ? 'Turma lotada' : `${c.capacity - c.studentCount} vaga(s) livre(s)`;
    const spots = this.daySpots();
    if (spots.every((d) => d.left === 0)) return 'Turma lotada';
    return 'Vagas: ' + spots.map((d) => `${WEEKDAY_SHORT[d.weekday]} ${d.left}`).join(' · ');
  });
  protected readonly classWeekdays = computed(() => this.cls()?.weekdays ?? []);
  protected readonly waitlist = signal<WaitlistEntry[]>([]);
  protected readonly waitForm = signal<WaitForm | null>(null);
  protected readonly waitError = signal<string | null>(null);
  protected readonly waitValid = computed(() => {
    const f = this.waitForm();
    if (!f) return false;
    return f.mode === 'athlete' ? f.picked != null : f.name.trim().length >= 2;
  });
  protected readonly shortDate = shortDate;
  protected readonly upcoming = computed(() => this.sessions().filter((s) => s.date >= this.today));
  protected readonly past = computed(() => this.sessions().filter((s) => s.date < this.today || s.status === 'completed'));
  protected readonly nextSession = computed(() => this.upcoming().find((s) => s.status === 'scheduled') ?? null);
  protected readonly closedCount = computed(() => this.past().filter((s) => Object.keys(s.attendance).length > 0).length);
  protected readonly futureConflicts = computed(() => (this.cls()?.conflictDates ?? []).filter((d) => d >= this.today));
  protected readonly classFrequency = computed(() => {
    let marked = 0;
    let present = 0;
    for (const s of this.past()) {
      for (const a of Object.values(s.attendance)) {
        marked += 1;
        if (a.mark === 'present') present += 1;
      }
    }
    return marked > 0 ? Math.round((present / marked) * 100) : null;
  });
  protected readonly schedule = computed(() => {
    const c = this.cls();
    return c ? classScheduleLabel(c) : '';
  });
  protected readonly subtitle = computed(() => {
    const c = this.cls();
    if (!c) return '';
    return `${sportLabel(c.sport)} · ${CLASS_LEVEL_LABEL[c.level]} · ${classScheduleLabel(c)} · ${c.courtName}`;
  });

  private unsubStudents: Unsubscribe | null = null;
  private unsubWaitlist: Unsubscribe | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.unsubStudents?.();
      this.unsubWaitlist?.();
    });
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId || !this.classId) return;
      void this.load(arenaId);
      const db = arenaFirestore();
      this.unsubStudents?.();
      this.unsubStudents = watchClassStudents(db, arenaId, this.classId, (list) => this.students.set(list));
      this.unsubWaitlist?.();
      this.unsubWaitlist = watchWaitlist(db, arenaId, this.classId, (list) => this.waitlist.set(list));
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const [cls, sessions] = await Promise.all([
        fetchClass(db, this.classId),
        fetchClassSessions(db, arenaId, this.classId, addDaysKey(this.today, -30)),
      ]);
      if (!cls || cls.arenaId !== arenaId) {
        this.loadError.set('Turma não encontrada.');
      } else {
        this.cls.set(cls);
        this.sessions.set(sessions);
      }
    } catch {
      this.loadError.set('Não foi possível carregar a turma.');
    } finally {
      this.loading.set(false);
    }
  }

  private reload(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    return arenaId ? this.load(arenaId) : Promise.resolve();
  }

  protected frequency(studentId: string): number | null {
    return studentFrequency(this.past(), studentId);
  }

  protected reasonLabel(reason: string): string {
    return CANCEL_REASON_LABEL[reason as CancelReason] ?? '';
  }

  protected ask(action: ConfirmAction): void {
    this.actionError.set(null);
    this.confirm.set(action);
  }

  protected confirmTitle(a: ConfirmAction): string {
    switch (a.kind) {
      case 'pause': return 'Pausar turma?';
      case 'resume': return 'Reativar turma?';
      case 'archive': return 'Encerrar turma?';
      case 'remove': return `Remover ${a.student.name}?`;
    }
  }

  protected confirmText(a: ConfirmAction): string {
    switch (a.kind) {
      case 'pause': return 'As próximas aulas sem chamada saem da agenda e a quadra volta para o aluguel. Os alunos continuam matriculados.';
      case 'resume': return 'As aulas dos próximos 35 dias voltam para a agenda. Datas em que a quadra já foi alugada ficam sem aula.';
      case 'archive': return 'As próximas aulas saem da agenda e a turma não recebe mais alunos. Não dá para reativar depois.';
      case 'remove': return 'A vaga abre na hora. O histórico de presença do aluno nas aulas já feitas continua.';
    }
  }

  protected async runConfirm(a: ConfirmAction): Promise<void> {
    if (this.cargoReadOnly()) return;
    this.busy.set(true);
    this.actionError.set(null);
    try {
      const fns = arenaFunctions();
      if (a.kind === 'remove') await removeClassStudent(fns, this.classId, a.student.id);
      else await setClassStatus(fns, this.classId, a.kind === 'resume' ? 'active' : a.kind === 'pause' ? 'paused' : 'archived');
      this.confirm.set(null);
      await this.reload();
    } catch (err) {
      this.confirm.set(null);
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async retry(date: string): Promise<void> {
    this.retrying.set(date);
    this.actionError.set(null);
    try {
      await scheduleClassDate(arenaFunctions(), this.classId, date);
      await this.reload();
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível agendar.');
    } finally {
      this.retrying.set(null);
    }
  }

  protected onEnrolled(): void {
    this.enrollOpen.set(false);
    void this.reload();
  }

  protected onCanceled(): void {
    this.cancelTarget.set(null);
    void this.reload();
  }

  protected daysLabel(weekdays: readonly number[]): string {
    return weekdaysLabel(weekdays);
  }

  protected dayName(weekday: number): string {
    return WEEKDAY_SHORT[weekday] ?? '';
  }

  protected dayKey(date: Date): string {
    return todayKeyLocal(date);
  }

  protected offerLink(w: WaitlistEntry): string | null {
    const c = this.cls();
    if (!c) return null;
    const arena = this.arenaContext.arenaName() ?? 'arena';
    return whatsappLink(
      w.phone,
      `Olá, ${w.name.split(' ')[0]}! Aqui é da ${arena}. Abriu vaga na turma ${c.name} (${classScheduleLabel(c)}). Quer garantir a sua?`,
    );
  }

  protected openWaitlistForm(): void {
    this.waitError.set(null);
    this.waitForm.set({ mode: 'athlete', picked: null, name: '', phone: '', note: '' });
  }

  protected patchWait(change: Partial<WaitForm>): void {
    const f = this.waitForm();
    if (f) this.waitForm.set({ ...f, ...change });
  }

  protected async saveWaitlist(): Promise<void> {
    const f = this.waitForm();
    if (!f || !this.waitValid() || this.cargoReadOnly()) return;
    this.busy.set(true);
    this.waitError.set(null);
    try {
      await addWaitlist(arenaFunctions(), {
        classId: this.classId,
        ...(f.mode === 'athlete' ? { athleteId: f.picked!.id } : { name: f.name.trim() }),
        phone: f.phone.trim() || undefined,
        note: f.note || undefined,
      });
      this.waitForm.set(null);
    } catch (err) {
      this.waitError.set(err instanceof Error ? err.message : 'Não foi possível adicionar.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async dropWaitlist(w: WaitlistEntry): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await removeWaitlist(arenaFunctions(), this.classId, w.id);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível tirar da lista.');
    } finally {
      this.busy.set(false);
    }
  }

  protected goEnroll(params: { classId: string; studentId?: string; waitlist?: string }): void {
    void this.router.navigate(['/painel/aulas/matricula'], { queryParams: params });
  }

  protected openStudent(enrollmentId: string): void {
    void this.router.navigate(['/painel/aulas/alunos', enrollmentId]);
  }

  protected openSession(id: string): void {
    void this.router.navigate(['/painel/aulas/aula', id]);
  }

  protected edit(): void {
    if (!this.readOnly()) void this.router.navigate(['/painel/aulas/turmas', this.classId, 'editar']);
  }

  protected back(): void {
    void this.router.navigate(['/painel/aulas/turmas']);
  }
}
