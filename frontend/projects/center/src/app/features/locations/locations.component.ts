import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { LocationsActions } from '../../data/actions/locations.actions';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatDayWithWeekday, startOfWeek, todayKey, WEEK_ORDER, WEEKDAY_SHORT } from '../../domain/dates';
import { daysOutsideWindow, mapsUrl, windowLabel } from '../../domain/locations';
import { LOCATION_TYPES, personColor, type CenterLocation, type Court, type LocationType } from '../../domain/models';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, SegmentedComponent } from '../../ui/kit';
import { ArchiveLocationModalComponent } from './archive-location-modal.component';
import { courtOccupancy } from './court-occupancy';
import { CourtFormModalComponent } from './court-form-modal.component';
import { LocationFormModalComponent } from './location-form-modal.component';
import { isLiveClass, locationsSubtitle, locationUsage, weekByLocation } from './location-views';

type TypeFilter = 'all' | LocationType;

/** Cor neutra para aula sem local (centro de antes dos locais). */
const NO_LOCATION_COLOR = '#9AA0A6';

/** L1/L5 — locais do centro (próprios, parceiros, avulsos) e a semana por local. */
@Component({
  selector: 'ct-locations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, SegmentedComponent, IconComponent, LocationFormModalComponent, ArchiveLocationModalComponent, CourtFormModalComponent],
  templateUrl: './locations.component.html',
  styleUrl: './locations.component.scss',
})
export class LocationsComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(LocationsActions);

  readonly centerId = input.required<string>();

  protected readonly canEdit = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  private readonly today = computed(() => todayKey(this.ctx.center()?.timezone));

  protected readonly types = LOCATION_TYPES;
  protected readonly typeChips: { value: TypeFilter; label: string; color: string }[] = [
    { value: 'all', label: 'Todos', color: '' },
    { value: 'own', label: 'Próprios', color: LOCATION_TYPES.own.color },
    { value: 'partner', label: 'Parceiros', color: LOCATION_TYPES.partner.color },
    { value: 'adhoc', label: 'Avulsos', color: LOCATION_TYPES.adhoc.color },
  ];
  protected readonly statusTabs = [
    { value: 'active', label: 'Ativos' },
    { value: 'archived', label: 'Arquivados' },
  ];
  protected readonly viewTabs = [
    { value: 'locais', label: 'Locais' },
    { value: 'semana', label: 'Semana por local' },
  ];

  protected readonly typeFilter = signal<TypeFilter>('all');
  protected readonly statusTab = signal('active');
  protected readonly view = signal('locais');
  private readonly selectedId = signal('');

  protected readonly subtitle = computed(() => locationsSubtitle(this.store.locations()));

  /** Sem local próprio ativo = centro itinerante: a semana por local é a visão principal. */
  protected readonly itinerant = computed(() => !this.store.locations().some((l) => l.status === 'active' && l.type === 'own'));

  protected readonly cards = computed(() => {
    const classes = this.store.classes();
    const sessions = this.store.sessions();
    const courts = this.store.courts();
    return this.store
      .locations()
      .filter((l) => l.status === this.statusTab() && (this.typeFilter() === 'all' || l.type === this.typeFilter()))
      .map((l) => {
        const usage = locationUsage(l.id, classes, sessions, this.today());
        const n = courts.filter((c) => c.locationId === l.id).length;
        const place = l.type === 'own' ? `${n} ${n === 1 ? 'quadra' : 'quadras'}` : l.type === 'partner' ? `Janela · ${windowLabel(l.windows)}` : 'Sem quadra fixa';
        return {
          location: l,
          usage,
          color: LOCATION_TYPES[l.type].color,
          sub: [place, usage.classes ? `${usage.classes} turma(s) com local padrão` : ''].filter(Boolean).join(' · '),
        };
      });
  });

  protected readonly selected = computed<CenterLocation | undefined>(() => {
    const list = this.cards();
    return (list.find((c) => c.location.id === this.selectedId()) ?? list[0])?.location;
  });

  protected readonly selectedCourts = computed(() => {
    const l = this.selected();
    if (!l || l.type !== 'own') return [];
    const classes = this.store.classes();
    return this.store
      .courts()
      .filter((c) => c.locationId === l.id)
      .map((c) => {
        const inMaintenance = c.status === 'maintenance' && (!c.maintenanceUntil || c.maintenanceUntil >= this.today());
        return {
          court: c,
          occ: courtOccupancy(classes, c.id),
          inMaintenance,
          sub: [c.description, inMaintenance ? `manutenção${c.maintenanceUntil ? ' até ' + formatDayKey(c.maintenanceUntil) : ''}` : ''].filter(Boolean).join(' · '),
        };
      });
  });

  /** "Onde é usado": turmas com o local padrão + aulas alteradas só na data para este local. */
  protected readonly usedBy = computed(() => {
    const l = this.selected();
    if (!l) return [];
    const classes = this.store
      .classes()
      .filter((c) => c.locationId === l.id && isLiveClass(c))
      .map((c) => {
        const days = WEEK_ORDER.filter((d) => c.weekdays.includes(d)).map((d) => WEEKDAY_SHORT[d]).join('/');
        const outside = daysOutsideWindow(l, c.weekdays, c.startTime, c.durationMin);
        return {
          key: 'c' + c.id,
          title: c.name,
          sub: `Local padrão · ${days} ${c.startTime}${outside.length ? ' · fora da janela contratada' : ''}`,
          warn: outside.length > 0,
        };
      });
    const sessions = this.store
      .sessions()
      .filter((s) => s.changed && s.locationId === l.id && s.date >= this.today() && s.status === 'scheduled')
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((s) => ({ key: 's' + s.id, title: s.className, sub: `Só ${formatDayWithWeekday(s.date)} ${s.startTime} · aula alterada`, warn: false }));
    return [...classes, ...sessions];
  });

  protected readonly selectedInfo = computed(() => {
    const l = this.selected();
    if (!l) return null;
    return {
      kicker: `Local ${LOCATION_TYPES[l.type].label.toLowerCase()}`,
      map: l.address ? mapsUrl(l.address) : '',
      window: windowLabel(l.windows),
      contact: [l.contactName, l.contactPhone].filter(Boolean).join(' · '),
    };
  });

  // ── L5: semana por local ──
  private readonly weekStart = computed(() => startOfWeek(this.today()));
  protected readonly weekTitle = computed(() => `Semana de ${formatDayKey(this.weekStart())}`);
  private readonly week = computed(() => weekByLocation(this.store.sessions(), this.weekStart()));

  protected readonly weekDays = computed(() =>
    this.week().days.map((d) => ({
      ...d,
      items: d.items.map((it) => {
        const loc = it.session.locationId ? this.store.locationById(it.session.locationId) : undefined;
        return {
          ...it,
          color: it.session.locationId ? personColor(it.session.locationId) : NO_LOCATION_COLOR,
          place: loc?.name || it.session.locationName || 'Local a definir',
        };
      }),
    })),
  );

  /** Locais ativos + qualquer local com aula nesta semana (mesmo arquivado). */
  protected readonly weekLocations = computed(() => {
    const per = this.week().perLocation;
    return this.store
      .locations()
      .filter((l) => l.status === 'active' || per.has(l.id))
      .map((l) => ({ location: l, color: personColor(l.id), count: per.get(l.id) ?? 0 }));
  });

  // ── Modais ──
  protected readonly editing = signal<CenterLocation | 'new' | null>(null);
  protected readonly archiving = signal<CenterLocation | null>(null);
  protected readonly editingCourt = signal<{ location: CenterLocation; court: Court | null } | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected select(id: string): void {
    this.selectedId.set(id);
    this.error.set('');
  }

  protected setStatusTab(v: string): void {
    this.statusTab.set(v);
    this.selectedId.set('');
  }

  protected onSaved(id: string): void {
    this.editing.set(null);
    this.statusTab.set('active');
    this.typeFilter.set('all');
    this.selectedId.set(id);
  }

  protected async restore(l: CenterLocation): Promise<void> {
    if (this.busy() || !this.canEdit()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.restore(l);
      this.statusTab.set('active');
      this.selectedId.set(l.id);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
