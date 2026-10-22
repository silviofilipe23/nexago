import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { writeErrorMessage } from '../../data/actions/actor';
import { LocationsActions, type ArchiveMode, type LocationImpact } from '../../data/actions/locations.actions';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey } from '../../domain/dates';
import { daysOutsideWindow, windowLabel } from '../../domain/locations';
import type { CenterLocation } from '../../domain/models';
import { BannerComponent, ModalComponent } from '../../ui/kit';

/** L4 — arquivar local: decidir o que acontece com as aulas futuras antes. */
@Component({
  selector: 'ct-archive-location-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, BannerComponent],
  templateUrl: './archive-location-modal.component.html',
  styles: `
    .opt { display: flex; align-items: flex-start; gap: 12px; width: 100%; }
    i.radio { font-style: normal; width: 18px; height: 18px; border-radius: 9px; border: 2px solid var(--nx-line-strong); display: grid; place-items: center; flex: none; margin-top: 1px; }
    .ct-option.on .radio { border-color: var(--nx-orange-500); }
    .ct-option.on .radio::after { content: ''; width: 8px; height: 8px; border-radius: 4px; background: var(--nx-orange-500); }
    .move { padding-left: 30px; display: flex; flex-direction: column; gap: 10px; }
  `,
})
export class ArchiveLocationModalComponent implements OnInit {
  private readonly actions = inject(LocationsActions);
  private readonly store = inject(CenterStore);

  readonly location = input.required<CenterLocation>();
  readonly closed = output<void>();
  readonly archived = output<void>();

  protected readonly impact = signal<LocationImpact | null>(null);
  protected readonly loadError = signal('');
  protected readonly mode = signal<ArchiveMode>('move');
  protected readonly targetId = signal('');
  protected readonly courtId = signal('');
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly targets = computed(() => this.store.locations().filter((l) => l.status === 'active' && l.id !== this.location().id));
  protected readonly target = computed(() => this.targets().find((l) => l.id === this.targetId()));
  protected readonly targetCourts = computed(() => {
    const t = this.target();
    return t?.type === 'own' ? this.store.courts().filter((c) => c.locationId === t.id) : [];
  });

  protected readonly affected = computed(() => {
    const i = this.impact();
    return i ? i.classes.length + i.sessions.length : 0;
  });

  protected readonly firstDate = computed(() => {
    const dates = (this.impact()?.sessions ?? []).map((s) => s.date).sort();
    return dates[0] ? formatDayKey(dates[0]) : '';
  });

  /** Turmas que cairiam fora da janela do parceiro de destino. */
  protected readonly outsideTarget = computed(() => {
    const t = this.target();
    if (!t) return [];
    return (this.impact()?.classes ?? []).filter((c) => daysOutsideWindow(t, c.weekdays, c.startTime, c.durationMin).length > 0);
  });

  protected readonly classNames = computed(() => (this.impact()?.classes ?? []).map((c) => c.name).join(', '));
  protected readonly outsideNames = computed(() => this.outsideTarget().map((c) => c.name).join(', '));
  protected readonly windowLabel = windowLabel;

  async ngOnInit(): Promise<void> {
    try {
      const impact = await this.actions.impact(this.location());
      this.impact.set(impact);
      if (impact.classes.length + impact.sessions.length === 0) this.mode.set('keep');
      this.targetId.set(this.targets()[0]?.id ?? '');
      if (this.targets().length === 0) this.mode.set('keep');
    } catch (err) {
      this.loadError.set(writeErrorMessage(err));
    }
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setTarget(id: string): void {
    this.targetId.set(id);
    this.courtId.set('');
  }

  protected confirmLabel(): string {
    const n = this.impact()?.sessions.length ?? 0;
    if (this.busy()) return 'Arquivando…';
    if (this.affected() === 0) return 'Arquivar local';
    if (this.mode() === 'move') return n ? `Mover ${n} ${n === 1 ? 'aula' : 'aulas'} e arquivar` : 'Mover turmas e arquivar';
    if (this.mode() === 'cancel') return `Cancelar ${n} ${n === 1 ? 'aula' : 'aulas'} e arquivar`;
    return 'Manter aulas e arquivar';
  }

  protected async confirm(): Promise<void> {
    if (this.busy() || !this.impact()) return;
    const mode = this.affected() === 0 ? 'keep' : this.mode();
    const target = this.target();
    if (mode === 'move' && !target) return this.error.set('Escolha o local de destino.');
    if (mode === 'cancel' && (this.impact()?.classes.length ?? 0) > 0) return this.error.set('Mova as turmas antes de cancelar as aulas.');
    this.busy.set(true);
    this.error.set('');
    try {
      const court = this.targetCourts().find((c) => c.id === this.courtId());
      await this.actions.archive(
        this.location(),
        mode,
        this.reason().trim(),
        mode === 'move' && target ? { location: target, courtId: court?.id ?? '', courtName: court?.name ?? '' } : undefined,
      );
      this.archived.emit();
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
