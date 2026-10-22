import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { writeErrorMessage } from '../../data/actions/actor';
import { LocationsActions } from '../../data/actions/locations.actions';
import { CenterStore } from '../../data/center-store.service';
import { WEEK_ORDER, WEEKDAY_SHORT, type Weekday } from '../../domain/dates';
import { LOCATION_TYPES, type CenterLocation, type LocationType } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { ModalComponent, ToggleComponent } from '../../ui/kit';
import { windowsFromDrafts, type WindowDraft } from './location-views';

/** L2 — novo local / editar local. */
@Component({
  selector: 'ct-location-form-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ToggleComponent, IconComponent],
  templateUrl: './location-form-modal.component.html',
  styles: `
    .types { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
    .win { padding: 12px; border-radius: var(--nx-r-3); border: 1px solid var(--nx-line); background: var(--nx-surface-0); display: flex; flex-direction: column; gap: 10px; }
    .days { display: flex; gap: 6px; flex-wrap: wrap; }
    .days .ct-day { width: 44px; height: 32px; }
    .primary { display: flex; align-items: center; gap: 12px; padding-top: 4px; font-size: 12.5px; color: var(--nx-text-mute); }
  `,
})
export class LocationFormModalComponent implements OnInit {
  private readonly actions = inject(LocationsActions);
  private readonly store = inject(CenterStore);

  /** null = novo local. */
  readonly location = input<CenterLocation | null>(null);
  readonly closed = output<void>();
  readonly saved = output<string>();

  protected readonly types: { value: LocationType; label: string; hint: string }[] = (['own', 'partner', 'adhoc'] as const).map((t) => ({
    value: t,
    label: LOCATION_TYPES[t].label,
    hint: LOCATION_TYPES[t].hint,
  }));
  protected readonly week = WEEK_ORDER.map((d) => ({ value: d, label: WEEKDAY_SHORT[d] }));

  protected readonly type = signal<LocationType>('own');
  protected readonly name = signal('');
  protected readonly address = signal('');
  protected readonly notes = signal('');
  protected readonly windows = signal<WindowDraft[]>([]);
  protected readonly courtsLabel = signal('');
  protected readonly contactName = signal('');
  protected readonly contactPhone = signal('');
  protected readonly isPrimary = signal(false);

  protected readonly busy = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    const l = this.location();
    if (!l) {
      // Primeiro local do centro nasce principal.
      this.isPrimary.set(this.store.locations().every((x) => x.status === 'archived'));
      this.windows.set([{ weekdays: [], times: '' }]);
      return;
    }
    this.type.set(l.type);
    this.name.set(l.name);
    this.address.set(l.address);
    this.notes.set(l.notes);
    this.windows.set(l.windows.map((w) => ({ weekdays: [...w.weekdays], times: `${w.start}–${w.end}` })));
    this.courtsLabel.set(l.courtsLabel);
    this.contactName.set(l.contactName);
    this.contactPhone.set(l.contactPhone);
    this.isPrimary.set(l.isPrimary);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected toggleDay(i: number, d: Weekday): void {
    this.windows.update((list) =>
      list.map((w, k) => (k === i ? { ...w, weekdays: w.weekdays.includes(d) ? w.weekdays.filter((x) => x !== d) : [...w.weekdays, d] } : w)),
    );
  }

  protected setTimes(i: number, times: string): void {
    this.windows.update((list) => list.map((w, k) => (k === i ? { ...w, times } : w)));
  }

  protected addWindow(): void {
    this.windows.update((list) => [...list, { weekdays: [], times: '' }]);
  }

  protected removeWindow(i: number): void {
    this.windows.update((list) => list.filter((_, k) => k !== i));
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    const current = this.location();
    const name = this.name().trim();
    const partner = this.type() === 'partner';
    if (name.length < 2) return this.error.set('Informe o nome do local.');
    if (this.store.locations().some((l) => l.name.toLowerCase() === name.toLowerCase() && l.id !== current?.id)) {
      return this.error.set('Já existe um local com esse nome.');
    }
    if (this.address().trim().length < 5) return this.error.set('Informe o endereço — é o que o aluno recebe para chegar.');
    // Janela em branco (sem dia e sem horário) é ignorada: parceiro sem janela não restringe horário.
    const drafts = partner ? this.windows().filter((w) => w.weekdays.length > 0 || w.times.trim()) : [];
    const parsed = windowsFromDrafts(drafts);
    if ('error' in parsed) return this.error.set(parsed.error);
    this.busy.set(true);
    this.error.set('');
    try {
      const id = await this.actions.save(current?.id ?? null, {
        name,
        type: this.type(),
        address: this.address(),
        notes: this.notes(),
        isPrimary: this.isPrimary(),
        windows: parsed.windows,
        courtsLabel: this.courtsLabel(),
        contactName: partner ? this.contactName().trim() : '',
        contactPhone: partner ? this.contactPhone().trim() : '',
      });
      this.saved.emit(id);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
