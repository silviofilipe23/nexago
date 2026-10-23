import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { ClassesActions, type SessionPatch } from '../../data/actions/classes.actions';
import { formatDayWithWeekday, isValidTime, todayKey } from '../../domain/dates';
import { holdsSeat } from '../../domain/enrollment';
import { placeLabel, sessionMoveChecks, type PlaceCheck } from '../../domain/locations';
import { LOCATION_TYPES, type ClassSession, type Court } from '../../domain/models';
import { endTime, overlaps } from '../../domain/schedule';
import { IconComponent } from '../../ui/icon.component';
import { ModalComponent } from '../../ui/kit';

type Action = 'cancel' | 'time' | 'coach' | 'court' | 'location';

const ACTIONS: { value: Action; label: string }[] = [
  { value: 'cancel', label: 'Cancelar' },
  { value: 'time', label: 'Mudar horário' },
  { value: 'coach', label: 'Trocar professor' },
  { value: 'court', label: 'Trocar quadra' },
  { value: 'location', label: 'Trocar local' },
];

/** W16 — mexer em UMA aula (cancelar/alterar) sem tocar na regra da turma. */
@Component({
  selector: 'ct-session-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, IconComponent],
  templateUrl: './session-modal.component.html',
  styles: `
    .move { display: grid; grid-template-columns: 1fr 24px 1fr; align-items: center; gap: 8px; }
    .place { padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); min-width: 0; }
    .place.to { background: rgba(255,106,26,0.07); border-color: rgba(255,106,26,0.45); }
    .place.to .ct-kick { color: var(--nx-orange-400); }
    .place .v { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; margin-top: 6px; color: var(--nx-text); }
    .place .sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .arrow { color: var(--nx-text-dim); justify-self: center; }
    .check { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--nx-line); font-size: 12.5px; }
    .check:first-child { border-top: none; }
    .check .k { flex: 1; color: var(--nx-text); }
    .check .d { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); text-align: right; }
    .ok { color: var(--nx-win); flex: none; }
    .bad { color: var(--nx-pending); flex: none; }
    .force { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 12.5px; color: var(--nx-text); cursor: pointer; }
    @media (max-width: 560px) { .move { grid-template-columns: 1fr; } .arrow { transform: rotate(90deg); } }
  `,
})
export class SessionModalComponent implements OnInit {
  private readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(ClassesActions);

  readonly session = input.required<ClassSession>();
  readonly canEdit = input(false);
  /** Professor da aula (com `attendance`) ou gestor, aula de hoje ou passada. */
  readonly canAttend = input(false);
  readonly closed = output<void>();
  /** Abre a chamada desta aula. */
  readonly attendance = output<void>();
  /** "Esta e as próximas": a tela pai leva para a edição da turma a partir deste dia. */
  readonly series = output<string>();

  protected readonly action = signal<Action>('cancel');
  protected readonly reason = signal('');
  protected readonly newTime = signal('');
  protected readonly newCoach = signal('');
  protected readonly newCourt = signal('');
  protected readonly newLocation = signal('');
  protected readonly newLocCourt = signal('');
  /** Checagem falhou e o gestor decidiu seguir assim mesmo. */
  protected readonly force = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  private readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly isPast = computed(() => this.session().date < this.today() || this.session().status === 'done');
  protected readonly editable = computed(() => this.canEdit() && !this.isPast());

  protected readonly kicker = computed(() => {
    const s = this.session();
    return `${formatDayWithWeekday(s.date)} · ${s.startTime}–${endTime(s.startTime, s.durationMin)} · ${placeLabel(s)}`;
  });

  protected readonly place = computed(() => placeLabel(this.session()));
  protected readonly locationTypes = LOCATION_TYPES;

  /** Quadras de um local próprio (quadra sem `locationId` é antiga e conta como do principal). */
  private courtsOf(locationId: string): Court[] {
    // Aula de antes dos locais: todas as quadras, como era.
    if (!locationId) return this.store.courts();
    const loc = this.store.locationById(locationId);
    if (!loc || loc.type !== 'own') return [];
    return this.store.courts().filter((c) => c.locationId === loc.id || (!c.locationId && loc.isPrimary));
  }

  /** "Trocar quadra" só faz sentido dentro do local próprio da aula. */
  protected readonly sessionCourts = computed(() => this.courtsOf(this.session().locationId));
  protected readonly actionOptions = computed(() =>
    ACTIONS.filter((a) => a.value !== 'court' || this.sessionCourts().length > 0),
  );

  // --- L3: trocar o local só desta aula ---
  protected readonly locationOptions = computed(() => this.store.locations().filter((l) => l.status === 'active'));
  protected readonly target = computed(() => this.store.locationById(this.newLocation()));
  protected readonly targetCourts = computed(() => this.courtsOf(this.newLocation()).filter((c) => c.status === 'active'));
  /** Local padrão da turma (a aula pode já estar sobrescrita). */
  protected readonly defaultPlace = computed(() => {
    const s = this.session();
    const c = this.store.classById(s.classId);
    return c ? placeLabel(c) : placeLabel(s);
  });
  protected readonly targetPlace = computed(() => {
    const loc = this.target();
    if (!loc) return 'Escolha o local';
    const court = this.targetCourts().find((c) => c.id === this.newLocCourt());
    return placeLabel({ locationName: loc.name, courtName: court?.name ?? '' });
  });
  protected readonly checks = computed<PlaceCheck[]>(() => {
    const loc = this.target();
    if (this.action() !== 'location' || !loc) return [];
    const court = this.targetCourts().find((c) => c.id === this.newLocCourt());
    return sessionMoveChecks(
      this.session(),
      { location: loc, courtId: court?.id ?? '', courtName: court?.name ?? '' },
      this.store.sessions(),
      this.ctx.center()?.policies.travelBufferMinutes ?? 0,
    );
  });
  protected readonly checksFailed = computed(() => this.checks().some((c) => !c.ok));

  /** Matrículas que ocupam vaga (pausadas não contam) + alunos de reposição nesta data. */
  protected readonly enrolled = computed(() =>
    this.store.enrollments().filter((e) => e.classId === this.session().classId && holdsSeat(e.status) && e.status !== 'paused').length,
  );
  protected readonly makeups = computed(() => this.session().makeupStudentIds.length);
  protected readonly autoMakeup = computed(() => this.ctx.center()?.policies.cancelledClassMakeup === 'auto');
  protected readonly marked = computed(() => Object.keys(this.session().attendance).length);
  /** "3 vão · 1 não vai" — respostas dos alunos pelo app; vazio sem resposta. */
  protected readonly rsvpSummary = computed(() => {
    const v = Object.values(this.session().rsvps);
    const going = v.filter((r) => r === 'going').length;
    const notGoing = v.length - going;
    return [
      going ? `${going} ${going === 1 ? 'vai' : 'vão'}` : '',
      notGoing ? `${notGoing} não ${notGoing === 1 ? 'vai' : 'vão'}` : '',
    ].filter(Boolean).join(' · ');
  });

  /** Choque com outra aula do mesmo dia (mesmo professor ou mesma quadra) depois da mudança. */
  protected readonly clash = computed(() => {
    const s = this.session();
    const a = this.action();
    if (a === 'cancel' || a === 'location') return '';
    const time = a === 'time' ? this.newTime() : s.startTime;
    const coach = a === 'coach' ? this.newCoach() : s.coachUid;
    const court = a === 'court' ? this.newCourt() : s.courtId;
    if (!isValidTime(time)) return '';
    const other = this.store
      .sessions()
      .find(
        (o) =>
          o.id !== s.id &&
          o.date === s.date &&
          o.status !== 'cancelled' &&
          overlaps(time, s.durationMin, o.startTime, o.durationMin) &&
          ((coach && o.coachUid === coach) || (court && o.courtId === court)),
      );
    if (!other) return '';
    const who = coach && other.coachUid === coach ? `${other.coachName || 'O professor'} já dá ${other.className}` : `${other.courtName || 'A quadra'} ocupada por ${other.className}`;
    return `${who} · ${other.startTime}–${endTime(other.startTime, other.durationMin)}`;
  });

  protected readonly patch = computed<SessionPatch | null>(() => {
    const s = this.session();
    switch (this.action()) {
      case 'time':
        return isValidTime(this.newTime()) && this.newTime() !== s.startTime ? { startTime: this.newTime() } : null;
      case 'coach': {
        const m = this.store.memberByUid(this.newCoach());
        return m && m.uid !== s.coachUid ? { coachUid: m.uid, coachName: m.displayName } : null;
      }
      case 'court': {
        const c = this.sessionCourts().find((x) => x.id === this.newCourt());
        return c && c.id !== s.courtId ? { courtId: c.id, courtName: c.name } : null;
      }
      case 'location': {
        const loc = this.target();
        const court = this.targetCourts().find((x) => x.id === this.newLocCourt());
        if (!loc || (loc.id === s.locationId && (court?.id ?? '') === s.courtId)) return null;
        return {
          locationId: loc.id,
          locationName: loc.name,
          locationAddress: loc.address,
          courtId: court?.id ?? '',
          courtName: court?.name ?? '',
        };
      }
      default:
        return null;
    }
  });

  protected readonly primaryLabel = computed(() => {
    if (this.action() === 'cancel') {
      const n = this.enrolled() + this.makeups();
      return n ? `Cancelar aula · ${n} aluno${n > 1 ? 's' : ''} afetado${n > 1 ? 's' : ''}` : 'Cancelar aula';
    }
    if (this.action() === 'location') {
      const n = this.enrolled() + this.makeups();
      return n ? `Mudar local e avisar ${n} aluno${n > 1 ? 's' : ''}` : 'Mudar local';
    }
    return 'Salvar só esta aula';
  });

  ngOnInit(): void {
    const s = this.session();
    this.newTime.set(s.startTime);
    this.newCoach.set(s.coachUid);
    this.newCourt.set(s.courtId);
    this.newLocation.set(s.locationId);
    this.newLocCourt.set(s.courtId);
  }

  protected setAction(a: Action): void {
    this.action.set(a);
    this.error.set('');
  }

  protected setLocation(id: string): void {
    this.newLocation.set(id);
    this.force.set(false);
    if (!this.targetCourts().some((c) => c.id === this.newLocCourt())) this.newLocCourt.set('');
  }

  protected setLocCourt(id: string): void {
    this.newLocCourt.set(id);
    this.force.set(false);
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(): Promise<void> {
    const s = this.session();
    const reason = this.reason().trim();
    if (reason.length < 3) {
      this.error.set('Informe o motivo (aparece para os alunos e na auditoria).');
      return Promise.resolve();
    }
    if (this.action() === 'cancel') {
      return this.run(() => this.actions.cancelSession(s, reason));
    }
    const patch = this.patch();
    if (!patch) {
      this.error.set('Escolha o novo valor.');
      return Promise.resolve();
    }
    // Decisão do gestor: checagem falhando não bloqueia, mas exige confirmação explícita.
    if (this.action() === 'location' && this.checksFailed() && !this.force()) {
      this.error.set('Confirme "mudar mesmo assim" para seguir com os avisos acima.');
      return Promise.resolve();
    }
    if (this.clash()) {
      this.error.set('A mudança gera conflito com outra aula.');
      return Promise.resolve();
    }
    return this.run(() => this.actions.changeSession(s, patch, reason));
  }

  protected restore(): Promise<void> {
    return this.run(() => this.actions.restoreSession(this.session()));
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      this.closed.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
