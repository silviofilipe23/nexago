import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PillComponent } from '../ui/pill.component';
import { AulaExtraModalComponent } from './aula-extra-modal.component';
import { AulaCancelModalComponent, type CancelOutcome } from './aula-modals.component';
import { removeExtra } from './billing-repository';
import { AulaTypeTagComponent, AulasPageComponent, OccupancyBarComponent } from './aulas-ui';
import {
  ATTENDANCE_LABEL,
  CANCEL_REASON_LABEL,
  attendanceCounts,
  isoWeekdayOf,
  sessionLiveState,
  studentAttendsWeekday,
  todayKeyLocal,
  weekdayDateLabel,
  type AttendanceMark,
  type CancelReason,
  type ClassSession,
  type ClassStudent,
} from './class.model';
import { saveAttendance, watchClassStudents, watchSession } from './classes-repository';

export interface RosterRow {
  id: string;
  name: string;
  hasAccount: boolean;
  /** Foto do aluno da turma (encaixe e quem só ficou na chamada não trazem). */
  photoUrl: string | null;
  /** Saiu da turma depois de ter presença nesta aula. */
  removed: boolean;
  /** Aluno da turma ou encaixe desta aula. */
  kind: 'regular' | 'makeup' | 'trial';
}

/**
 * Lista da chamada: alunos ativos que fazem aula nesse dia da semana, encaixes da aula
 * (reposição/experimental) e quem já tem marca nesta aula (mesmo se saiu ou pausou).
 */
export function buildRoster(
  students: readonly ClassStudent[],
  session: Pick<ClassSession, 'attendance' | 'extras' | 'date'>,
): RosterRow[] {
  const weekday = isoWeekdayOf(session.date);
  const rows = new Map<string, RosterRow>();
  for (const s of students) {
    const attends = s.status === 'active' && studentAttendsWeekday(s, weekday);
    if (attends || session.attendance[s.id]) {
      rows.set(s.id, { id: s.id, name: s.name, hasAccount: s.athleteId != null, photoUrl: s.photoUrl, removed: !attends, kind: 'regular' });
    }
  }
  for (const [id, extra] of Object.entries(session.extras)) {
    rows.set(id, { id, name: extra.name, hasAccount: extra.athleteId != null, photoUrl: null, removed: false, kind: extra.kind });
  }
  for (const [id, a] of Object.entries(session.attendance)) {
    if (!rows.has(id)) rows.set(id, { id, name: a.name, hasAccount: false, photoUrl: null, removed: true, kind: 'regular' });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function closeNotice(credited: number, debited: number): string {
  const parts = ['Chamada fechada'];
  if (credited > 0) parts.push(`${credited} crédito${credited === 1 ? '' : 's'} de reposição gerado${credited === 1 ? '' : 's'}`);
  if (debited > 0) parts.push(`${debited} aula${debited === 1 ? '' : 's'} descontada${debited === 1 ? '' : 's'} de pacote`);
  return `${parts.join(' · ')}.`;
}

const STATE_LABEL = { live: 'Em andamento', next: 'Próxima', done: 'Concluída', canceled: 'Cancelada' } as const;
const STATE_TONE = { live: 'red', next: 'orange', done: 'dim', canceled: 'dim' } as const;

/** 03 · Aula — chamada (presente/falta/justificada), nota do professor e cancelamento. */
@Component({
  selector: 'ar-panel-aula-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, PillComponent, IconComponent, AvatarComponent, AulaTypeTagComponent, OccupancyBarComponent, AulaCancelModalComponent, AulaExtraModalComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page [title]="title()" [subtitle]="subtitle()">
      <div page-actions style="display: flex; gap: 8px; flex-wrap: wrap">
        <button type="button" class="ar-mini-btn" (click)="back()">
          <ar-icon name="chevron-left" [size]="14" />
          Agenda
        </button>
        @if (session(); as s) {
          @if (s.status === 'scheduled' && s.date >= today) {
            <button type="button" class="ar-mini-btn" [disabled]="readOnly()" (click)="cancelOpen.set(true)">Cancelar aula</button>
          }
          @if (s.status !== 'canceled') {
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly() || !callOpen() || saving()" (click)="save(true)">
              <ar-icon name="check" [size]="14" />
              {{ s.status === 'completed' ? 'Salvar correções' : 'Fechar chamada' }}
            </button>
          }
        }
      </div>

      @if (missing()) {
        <p class="state-text">Aula não encontrada.</p>
      } @else if (session(); as s) {
        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (notice(); as n) {
          <div class="notice">{{ n }}</div>
        }
        @if (s.status === 'canceled') {
          <div class="banner">
            Aula cancelada{{ cancelLabel(s.cancelReason) ? ' · ' + cancelLabel(s.cancelReason) : '' }}. A quadra voltou para o aluguel.
          </div>
        } @else if (!callOpen()) {
          <div class="banner">A chamada abre no dia da aula. A lista abaixo é de quem está matriculado hoje.</div>
        }

        <div class="layout">
          <ar-panel-card title="Chamada" [kicker]="kicker()">
            <div card-actions class="card-actions">
              @if (canAddExtra()) {
                <button type="button" class="ar-mini-btn" [disabled]="readOnly() || spotsLeft() === 0" [title]="spotsLeft() === 0 ? 'Aula sem vaga' : ''" (click)="extraOpen.set(true)">
                  <ar-icon name="plus" [size]="14" />
                  Encaixar
                </button>
              }
              @if (s.status !== 'canceled' && callOpen()) {
                <button type="button" class="ar-mini-btn" [disabled]="readOnly() || counts().unmarked === 0" (click)="markRemainingPresent()">
                  <ar-icon name="check" [size]="14" />
                  Marcar restantes presentes
                </button>
              }
            </div>
            <div class="list">
              @for (r of roster(); track r.id; let i = $index) {
                <div class="row">
                  <span class="num">{{ (i + 1).toString().padStart(2, '0') }}</span>
                  <div class="who">
                    <ar-avatar [name]="r.name" [photoUrl]="r.photoUrl" [size]="32" zoomable personRole="Aluno" />
                    <div class="min0">
                      <div class="name">
                        {{ r.name }}
                        @if (r.kind !== 'regular') {
                          <span class="kind" [class.trial]="r.kind === 'trial'">{{ r.kind === 'makeup' ? 'Reposição' : 'Experimental' }}</span>
                        }
                      </div>
                      <div class="sub">
                        {{ r.removed ? 'Saiu da turma' : r.hasAccount ? 'Conta NexaGO' : 'Sem conta' }}
                        @if (r.kind !== 'regular' && s.status === 'scheduled' && !readOnly()) {
                          · <button type="button" class="link" [disabled]="saving()" (click)="dropExtra(r.id, r.name)">tirar</button>
                        }
                      </div>
                    </div>
                  </div>
                  <div class="marks" role="radiogroup" [attr.aria-label]="'Presença de ' + r.name">
                    @for (m of markOptions; track m) {
                      <button
                        type="button"
                        class="mark"
                        role="radio"
                        [class]="'mark tone-' + m"
                        [class.on]="marks()[r.id] === m"
                        [attr.aria-checked]="marks()[r.id] === m"
                        [disabled]="readOnly() || !callOpen() || s.status === 'canceled'"
                        (click)="toggleMark(r.id, m)"
                      >{{ markLabel[m] }}</button>
                    }
                  </div>
                </div>
              } @empty {
                <p class="state-text">Nenhum aluno na turma. Matricule alunos na página da turma.</p>
              }
            </div>
            @if (dirty() && s.status !== 'canceled') {
              <div class="dirty">
                <span>Alterações ainda não salvas.</span>
                <button type="button" class="ar-mini-btn" [disabled]="saving()" (click)="save(false)">{{ saving() ? 'Salvando…' : 'Salvar sem fechar' }}</button>
              </div>
            }
          </ar-panel-card>

          <div class="side">
            <ar-panel-card title="Aula">
              <div class="big">{{ presentCount() }}<span>/{{ roster().length }}</span></div>
              <div class="mono dim">presentes · {{ s.capacity }} vagas</div>
              <div class="bar"><ar-occupancy-bar [pct]="s.capacity > 0 ? (roster().length / s.capacity) * 100 : 0" /></div>
              <div class="facts">
                <div><span>Estado</span><ar-pill [tone]="stateTone[state()]">{{ stateLabel[state()] }}</ar-pill></div>
                <div><span>Tipo</span><ar-aula-type-tag [type]="s.type" /></div>
                <div><span>Professor</span><strong>{{ s.teacherName }}</strong></div>
                <div><span>Quadra</span><strong>{{ s.courtName }}</strong></div>
              </div>
            </ar-panel-card>
            <ar-panel-card title="Ao fechar a chamada">
              <p class="hint first">A presença entra na frequência de cada aluno e da turma. Dá para corrigir depois de fechada.</p>
              <p class="hint">Falta justificada gera 1 crédito de reposição (se a regra da arena estiver ligada e dentro do limite do plano). Aluno de pacote: presença ou falta sem aviso desconta 1 aula do pacote.</p>
            </ar-panel-card>
            <ar-panel-card title="Nota do professor">
              <textarea class="input-box" maxlength="1000" placeholder="Ex.: treino de saque viagem + transição" [disabled]="readOnly() || s.status === 'canceled'" [value]="note()" (input)="setNote($any($event.target).value)"></textarea>
            </ar-panel-card>
          </div>
        </div>
      } @else {
        <p class="state-text">Carregando aula…</p>
      }
    </ar-aulas-page>

    @if (cancelOpen() && session(); as s) {
      <ar-aula-cancel-modal [session]="s" (closed)="cancelOpen.set(false)" (canceled)="onCanceled($event)" />
    }
    @if (extraOpen() && session(); as s) {
      <ar-aula-extra-modal [session]="s" [spotsLeft]="spotsLeft()" [rosterIds]="rosterIds()" (closed)="extraOpen.set(false)" (added)="onExtraAdded()" />
    }
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .banner, .notice {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-line-strong); background: var(--nx-surface-1);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-text-mute); flex: none;
    }
    .notice { border-color: rgba(43, 209, 126, 0.3); color: var(--nx-win); background: rgba(43, 209, 126, 0.08); }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    .side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .list { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--nx-line); }
    .row:last-child { border-bottom: none; }
    .num { font-family: var(--nx-font-mono); font-size: 11px; color: var(--nx-text-dim); }
    .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .name { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .min0 { min-width: 0; }
    .card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .kind {
      height: 17px; padding: 0 6px; border-radius: 5px; display: inline-flex; align-items: center;
      font-family: var(--nx-font-mono); font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: var(--nx-win); background: rgba(43, 209, 126, 0.12);
    }
    .kind.trial { color: #f4c543; background: rgba(244, 197, 67, 0.12); }
    .link { background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: var(--nx-orange-500); text-decoration: underline; }
    .sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .marks { display: flex; gap: 4px; }
    .mark {
      height: 30px; padding: 0 11px; border-radius: 8px; cursor: pointer;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display); font-weight: 600; font-size: 11.5px; color: var(--nx-text-dim);
    }
    .mark:disabled { cursor: default; opacity: 0.6; }
    .mark.tone-present.on { color: var(--nx-win); border-color: var(--nx-win); background: rgba(43, 209, 126, 0.13); }
    .mark.tone-absent.on { color: var(--nx-live); border-color: var(--nx-live); background: rgba(255, 59, 48, 0.13); }
    .mark.tone-excused.on { color: var(--nx-pending); border-color: var(--nx-pending); background: rgba(244, 197, 67, 0.13); }
    .dirty { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--nx-line); font-size: 12.5px; color: var(--nx-pending); }
    .big { font-family: var(--nx-font-display); font-weight: 800; font-size: 30px; color: var(--nx-text); }
    .big span { font-size: 18px; color: var(--nx-text-dim); }
    .mono { font-family: var(--nx-font-mono); font-size: 11px; }
    .mono.dim { color: var(--nx-text-dim); }
    .bar { margin-top: 10px; }
    .facts { display: flex; flex-direction: column; gap: 9px; margin-top: 14px; }
    .facts div { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; }
    .facts span { color: var(--nx-text-dim); }
    .facts strong { font-family: var(--nx-font-display); font-weight: 600; color: var(--nx-text); }
    .first { margin-top: 0; }
    @media (max-width: 1180px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 640px) {
      .row { grid-template-columns: 28px minmax(0, 1fr); }
      .marks { grid-column: 1 / -1; }
    }
  `,
})
export class PanelAulaSessionComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly today = todayKeyLocal();
  protected readonly markOptions: readonly AttendanceMark[] = ['present', 'absent', 'excused'];
  protected readonly markLabel = ATTENDANCE_LABEL;
  protected readonly stateLabel = STATE_LABEL;
  protected readonly stateTone = STATE_TONE;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  private readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
  protected readonly session = signal<ClassSession | null>(null);
  protected readonly missing = signal(false);
  protected readonly students = signal<ClassStudent[]>([]);
  protected readonly marks = signal<Record<string, AttendanceMark | null>>({});
  protected readonly note = signal('');
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly cancelOpen = signal(false);
  protected readonly extraOpen = signal(false);

  protected readonly roster = computed(() => {
    const s = this.session();
    return s ? buildRoster(this.students(), s) : [];
  });
  protected readonly counts = computed(() => {
    const local = this.marks();
    const attendance: ClassSession['attendance'] = {};
    for (const [id, mark] of Object.entries(local)) if (mark) attendance[id] = { mark, name: '' };
    return attendanceCounts({ attendance }, this.roster().map((r) => r.id));
  });
  protected readonly presentCount = computed(() => this.counts().present);
  protected readonly rosterIds = computed(() => this.roster().map((r) => r.id));
  /** Vaga do dia: capacidade menos quem está na lista (alunos do dia e encaixes). */
  protected readonly spotsLeft = computed(() => {
    const s = this.session();
    return s ? Math.max(0, s.capacity - this.roster().filter((r) => !r.removed).length) : 0;
  });
  protected readonly canAddExtra = computed(() => {
    const s = this.session();
    return s != null && s.status === 'scheduled' && s.date >= this.today;
  });
  protected readonly callOpen = computed(() => {
    const s = this.session();
    return s != null && s.date <= this.today;
  });
  protected readonly state = computed(() => {
    const s = this.session();
    return s ? sessionLiveState(s, new Date(), this.today) : 'next';
  });
  protected readonly title = computed(() => {
    const s = this.session();
    return s ? `${s.className} · ${weekdayDateLabel(s.date)}` : 'Aula';
  });
  protected readonly subtitle = computed(() => {
    const s = this.session();
    return s ? `${s.startTime}–${s.endTime} · ${s.courtName} · ${s.teacherName}` : '';
  });
  protected readonly kicker = computed(() => {
    const c = this.counts();
    return `${c.present} presentes · ${c.absent} falta${c.absent === 1 ? '' : 's'} · ${c.excused} justificada${c.excused === 1 ? '' : 's'} · ${c.unmarked} sem marcação`;
  });

  private unsubs: Unsubscribe[] = [];
  private studentsFor: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unsubs.forEach((u) => u()));
    if (this.sessionId) {
      this.unsubs.push(
        watchSession(arenaFirestore(), this.sessionId, (s) => {
          if (!s) {
            this.missing.set(true);
            return;
          }
          this.session.set(s);
          // Só substitui o rascunho local quando não há alteração pendente.
          if (!this.dirty()) {
            const marks: Record<string, AttendanceMark | null> = {};
            for (const [id, a] of Object.entries(s.attendance)) marks[id] = a.mark;
            this.marks.set(marks);
            this.note.set(s.teacherNote ?? '');
          }
        }),
      );
    } else {
      this.missing.set(true);
    }

    effect(() => {
      const s = this.session();
      const arenaId = this.arenaContext.arenaId();
      if (!s || !arenaId || this.studentsFor === s.classId) return;
      this.studentsFor = s.classId;
      this.unsubs.push(watchClassStudents(arenaFirestore(), arenaId, s.classId, (list) => this.students.set(list)));
    });
  }

  protected cancelLabel(reason: string | null): string {
    return reason ? CANCEL_REASON_LABEL[reason as CancelReason] ?? '' : '';
  }

  protected toggleMark(studentId: string, mark: AttendanceMark): void {
    if (this.readOnly() || !this.callOpen()) return;
    const current = this.marks()[studentId] ?? null;
    this.marks.set({ ...this.marks(), [studentId]: current === mark ? null : mark });
    this.dirty.set(true);
    this.notice.set(null);
  }

  protected markRemainingPresent(): void {
    const next = { ...this.marks() };
    for (const r of this.roster()) if (!next[r.id]) next[r.id] = 'present';
    this.marks.set(next);
    this.dirty.set(true);
    this.notice.set(null);
  }

  protected setNote(value: string): void {
    this.note.set(value);
    this.dirty.set(true);
  }

  protected async save(close: boolean): Promise<void> {
    const s = this.session();
    if (!s || this.readOnly()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      // Manda a marca de todo aluno da lista (null limpa) para o servidor espelhar a tela.
      const payload: Record<string, AttendanceMark | null> = {};
      for (const r of this.roster()) payload[r.id] = this.marks()[r.id] ?? null;
      const result = await saveAttendance(arenaFunctions(), s.id, payload, this.note().trim() || null, close);
      this.dirty.set(false);
      this.notice.set(close ? closeNotice(result.credited ?? 0, result.debited ?? 0) : 'Chamada salva.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar a chamada.');
    } finally {
      this.saving.set(false);
    }
  }

  protected onCanceled({ notified, credited }: CancelOutcome): void {
    this.cancelOpen.set(false);
    // O banner de aula cancelada já diz que a quadra voltou para o aluguel.
    const parts: string[] = [];
    if (notified > 0) parts.push(`${notified} aluno${notified === 1 ? '' : 's'} avisado${notified === 1 ? '' : 's'} no app`);
    if (credited > 0) parts.push(`${credited} crédito${credited === 1 ? '' : 's'} de reposição gerado${credited === 1 ? '' : 's'}`);
    this.notice.set(parts.length > 0 ? `${parts.join(' · ')}.` : null);
  }

  protected onExtraAdded(): void {
    this.extraOpen.set(false);
    this.notice.set('Aluno encaixado na aula.');
  }

  protected async dropExtra(studentId: string, name: string): Promise<void> {
    const s = this.session();
    if (!s || this.readOnly()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await removeExtra(arenaFunctions(), s.id, studentId);
      const { [studentId]: _, ...rest } = this.marks();
      this.marks.set(rest);
      this.notice.set(`${name} saiu da aula.`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível tirar o encaixe.');
    } finally {
      this.saving.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate(['/painel/aulas/agenda']);
  }
}
