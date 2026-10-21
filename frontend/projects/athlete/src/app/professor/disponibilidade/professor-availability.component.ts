import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { AtPanelShellComponent } from '../../painel/at-panel-shell.component';
import { NxBannerComponent, NxInlineMessageComponent, NxToastService } from '../../shared/feedback';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../../shared/loading/nx-spinner.component';
import { ProfessorConfirmDialogComponent } from '../professor-confirm-dialog.component';
import { professorErrorMessage } from '../professor-links.model';
import {
  DEFAULT_SETTINGS,
  DURATION_OPTIONS,
  FREE_CANCEL_OPTIONS,
  GRID_HOURS,
  NOTICE_OPTIONS,
  buildOverlay,
  cellKey,
  currentWeek,
  durationLabel,
  freeCancelLabel,
  hoursLabel,
  isOpen,
  lessonQueues,
  noticeLabel,
  openHoursCount,
  optionsWith,
  ownPendingReschedule,
  paintModeFor,
  sameSettings,
  setCell,
  spInstant,
  toggleCell,
  weekStats,
  whenLabel,
  type AvailabilitySettings,
  type BusyBlock,
  type OverlayCell,
  type OwnClassSlot,
  type PrivateLesson,
} from './professor-availability.model';
import { ProfessorAvailabilityService } from './professor-availability.service';

type ToggleKey = 'autoConfirm' | 'acceptPairs' | 'showOnProfile';
type NumberKey = 'durationMin' | 'minNoticeHours' | 'freeCancelHours';

interface Cell {
  day: number;
  hour: number;
  open: boolean;
  overlay: OverlayCell | null;
  label: string;
}

/**
 * "Disponibilidade" (protótipo `PrDisponibilidadeScreen`): grade semanal de horas abertas para
 * particular, com as ocupações DESTA semana por cima (turma própria, particular, bloqueio), as
 * regras de agendamento e os pedidos/próximas particulares. Publicar manda tudo de uma vez.
 */
@Component({
  selector: 'app-professor-availability',
  imports: [
    AtPanelShellComponent,
    NxBannerComponent,
    NxInlineMessageComponent,
    NxPageLoadingComponent,
    NxSpinnerComponent,
    ProfessorConfirmDialogComponent,
  ],
  providers: [ProfessorAvailabilityService],
  templateUrl: './professor-availability.component.html',
  styleUrl: './professor-availability.component.scss',
  host: {
    '(window:pointerup)': 'endDrag()',
    '(window:blur)': 'endDrag()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorAvailabilityComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(ProfessorAvailabilityService);
  private readonly toasts = inject(NxToastService);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  private readonly now = signal(Date.now());
  protected readonly week = computed(() => currentWeek(this.now()));
  private readonly weekStart = computed(() => spInstant(this.week()[0]!.dayKey, 0));

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly lessonsError = signal(false);

  /** O que está gravado (base do "alterações não publicadas"). */
  private readonly saved = signal<AvailabilitySettings>(DEFAULT_SETTINGS);
  protected readonly savedPublished = signal(false);
  protected readonly settings = signal<AvailabilitySettings>(DEFAULT_SETTINGS);

  private readonly ownClasses = signal<readonly OwnClassSlot[]>([]);
  private readonly arenaClasses = signal<readonly OwnClassSlot[]>([]);
  private readonly blocks = signal<readonly BusyBlock[]>([]);
  private readonly lessons = signal<readonly PrivateLesson[]>([]);

  protected readonly dirty = computed(() => !this.savedPublished() || !sameSettings(this.settings(), this.saved()));
  protected readonly publishing = signal(false);
  protected readonly publishError = signal<string | null>(null);
  protected readonly publishedBanner = signal(false);

  protected readonly hours = GRID_HOURS;
  protected readonly durationOptions = computed(() => optionsWith(DURATION_OPTIONS, this.settings().durationMin));
  protected readonly noticeOptions = computed(() => optionsWith(NOTICE_OPTIONS, this.settings().minNoticeHours));
  protected readonly cancelOptions = computed(() => optionsWith(FREE_CANCEL_OPTIONS, this.settings().freeCancelHours));
  protected readonly durationLabel = durationLabel;
  protected readonly noticeLabel = noticeLabel;
  protected readonly freeCancelLabel = freeCancelLabel;
  protected readonly whenLabel = whenLabel;

  protected readonly overlay = computed(() =>
    buildOverlay(this.week(), {
      ownClasses: this.ownClasses(),
      arenaClasses: this.arenaClasses(),
      lessons: this.lessons(),
      blocks: this.blocks(),
    }),
  );

  protected readonly rows = computed(() => {
    const weekly = this.settings().weekly;
    const overlay = this.overlay();
    const week = this.week();
    return this.hours.map((hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}h`,
      cells: week.map((d): Cell => {
        const open = isOpen(weekly, d.isoDay, hour);
        const ov = overlay.get(cellKey(d.isoDay, hour)) ?? null;
        const when = `${d.short} ${d.dateLabel}, ${String(hour).padStart(2, '0')}h`;
        return {
          day: d.isoDay,
          hour,
          open,
          overlay: ov,
          label: ov ? `${when}: ${ov.detail}` : `${when}: ${open ? 'livre para particular' : 'fechado'}`,
        };
      }),
    }));
  });

  protected readonly stats = computed(() => {
    const s = weekStats(this.settings().weekly, this.week(), this.overlay(), this.lessons());
    return { free: hoursLabel(s.freeHours), booked: hoursLabel(s.bookedHours) };
  });
  protected readonly openCount = computed(() => openHoursCount(this.settings().weekly));

  protected readonly queues = computed(() => lessonQueues(this.lessons(), this.uid() ?? '', this.now()));
  protected readonly hasQueue = computed(() => {
    const q = this.queues();
    return q.requests.length + q.reschedules.length + q.upcoming.length > 0;
  });

  /** Ação em andamento numa particular (`id:ação`). */
  protected readonly acting = signal<string | null>(null);
  protected readonly cancelTarget = signal<PrivateLesson | null>(null);
  protected readonly cancelError = signal<string | null>(null);

  private drag: { open: boolean } | null = null;
  private touchStart: { day: number; hour: number } | null = null;

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    effect((onCleanup) => {
      const uid = this.uid();
      const from = this.weekStart();
      if (!uid) return;
      void this.load(uid, from);
      void this.loadArenaClasses();
      const stop = this.service.watchLessons(
        uid,
        from,
        (lessons) => {
          this.lessons.set(lessons);
          this.lessonsError.set(false);
        },
        () => this.lessonsError.set(true),
      );
      onCleanup(stop);
    });
  }

  private async load(uid: string, from: number): Promise<void> {
    this.loadError.set(false);
    try {
      const [state, ownClasses, blocks] = await Promise.all([
        this.service.loadAvailability(uid),
        // Ocupações são só contexto: se uma falhar, a grade ainda abre.
        this.service.loadOwnClasses(uid).catch(() => [] as OwnClassSlot[]),
        this.service.loadBlocks(uid, from).catch(() => [] as BusyBlock[]),
      ]);
      // Não pisa no que o professor já pintou se a semana virar com a tela aberta.
      if (this.loading() || !this.dirty()) this.settings.set(state.settings);
      this.saved.set(state.settings);
      this.savedPublished.set(state.published);
      this.ownClasses.set(ownClasses);
      this.blocks.set(blocks);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** Uma vez por carga; se falhar, a grade segue sem as turmas da arena (sem aviso). */
  private async loadArenaClasses(): Promise<void> {
    try {
      this.arenaClasses.set(await this.service.loadArenaClasses());
    } catch {
      this.arenaClasses.set([]);
    }
  }

  protected retry(): void {
    const uid = this.uid();
    if (!uid) return;
    this.loading.set(true);
    void this.load(uid, this.weekStart());
  }

  // ── grade ──────────────────────────────────────────────────

  private paint(day: number, hour: number, open: boolean): void {
    this.settings.update((s) => {
      const weekly = setCell(s.weekly, day, hour, open);
      return weekly === s.weekly ? s : { ...s, weekly };
    });
    this.publishedBanner.set(false);
  }

  protected onPointerDown(event: PointerEvent, cell: Cell): void {
    if (cell.overlay || event.button > 0) return;
    if (event.pointerType === 'touch') {
      // Toque: só alterna no "soltar" — arrastar o dedo rola a grade em vez de pintar.
      this.touchStart = { day: cell.day, hour: cell.hour };
      return;
    }
    event.preventDefault();
    const open = paintModeFor(this.settings().weekly, cell.day, cell.hour);
    this.drag = { open };
    this.paint(cell.day, cell.hour, open);
  }

  protected onPointerEnter(cell: Cell): void {
    if (!this.drag || cell.overlay) return;
    this.paint(cell.day, cell.hour, this.drag.open);
  }

  protected onPointerUp(event: PointerEvent, cell: Cell): void {
    if (event.pointerType !== 'touch') return;
    const start = this.touchStart;
    this.touchStart = null;
    if (start && start.day === cell.day && start.hour === cell.hour && !cell.overlay) {
      this.paint(cell.day, cell.hour, paintModeFor(this.settings().weekly, cell.day, cell.hour));
    }
  }

  protected onPointerCancel(): void {
    this.touchStart = null;
  }

  protected onKeyToggle(event: Event, cell: Cell): void {
    event.preventDefault();
    if (cell.overlay) return;
    this.settings.update((s) => ({ ...s, weekly: toggleCell(s.weekly, cell.day, cell.hour) }));
    this.publishedBanner.set(false);
  }

  protected endDrag(): void {
    this.drag = null;
  }

  // ── regras ─────────────────────────────────────────────────

  protected setNumber(key: NumberKey, value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.settings.update((s) => ({ ...s, [key]: n }));
    this.publishedBanner.set(false);
  }

  protected toggle(key: ToggleKey): void {
    this.settings.update((s) => ({ ...s, [key]: !s[key] }));
    this.publishedBanner.set(false);
  }

  protected async publish(): Promise<void> {
    if (this.publishing()) return;
    const snapshot = this.settings();
    this.publishing.set(true);
    this.publishError.set(null);
    try {
      await this.service.publish(snapshot);
      this.saved.set(snapshot);
      this.savedPublished.set(true);
      this.publishedBanner.set(true);
    } catch (err) {
      this.publishError.set(professorErrorMessage(err, 'Não foi possível publicar seus horários agora. Tente de novo.'));
    } finally {
      this.publishing.set(false);
    }
  }

  // ── particulares ───────────────────────────────────────────

  protected ownReschedule(l: PrivateLesson) {
    return ownPendingReschedule(l, this.uid() ?? '');
  }

  protected isActing(l: PrivateLesson, action: string): boolean {
    return this.acting() === `${l.id}:${action}`;
  }

  private async act(l: PrivateLesson, action: string, run: () => Promise<void>, done: string, fallback: string) {
    if (this.acting()) return;
    this.acting.set(`${l.id}:${action}`);
    try {
      await run();
      this.toasts.success(done, `${l.athleteName} recebe um aviso.`);
    } catch (err) {
      this.toasts.error('Não deu certo', professorErrorMessage(err, fallback));
    } finally {
      this.acting.set(null);
    }
  }

  protected respond(l: PrivateLesson, accept: boolean): void {
    void this.act(
      l,
      accept ? 'accept' : 'decline',
      () => this.service.respondLesson(l.id, accept),
      accept ? 'Particular confirmada' : 'Pedido recusado',
      'Não foi possível responder o pedido agora. Tente de novo.',
    );
  }

  protected respondReschedule(l: PrivateLesson, accept: boolean): void {
    void this.act(
      l,
      accept ? 'r-accept' : 'r-decline',
      () => this.service.respondReschedule(l.id, accept),
      accept ? 'Remarcação aceita' : 'Remarcação recusada',
      'Não foi possível responder a remarcação agora. Tente de novo.',
    );
  }

  protected askCancel(l: PrivateLesson): void {
    this.cancelError.set(null);
    this.cancelTarget.set(l);
  }

  protected closeCancel(): void {
    if (this.acting()) return;
    this.cancelTarget.set(null);
    this.cancelError.set(null);
  }

  protected async confirmCancel(): Promise<void> {
    const l = this.cancelTarget();
    if (!l || this.acting()) return;
    this.acting.set(`${l.id}:cancel`);
    this.cancelError.set(null);
    try {
      await this.service.cancelLesson(l.id);
      this.acting.set(null);
      this.cancelTarget.set(null);
      this.toasts.info('Particular cancelada', `${l.athleteName} recebe um aviso.`);
    } catch (err) {
      this.acting.set(null);
      this.cancelError.set(professorErrorMessage(err, 'Não foi possível cancelar a particular agora. Tente de novo.'));
    }
  }
}
