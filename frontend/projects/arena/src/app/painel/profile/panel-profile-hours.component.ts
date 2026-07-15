import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { StatusDotComponent } from '../ui/status-dot.component';
import { ToggleComponent } from '../ui/toggle.component';
import {
  applyScheduleToAllCourts,
  ARENA_SLOT_DURATIONS,
  ARENA_WEEKDAY_LABEL,
  ARENA_WEEKDAYS,
  defaultWeekSchedule,
  fetchScheduleTemplate,
  type ArenaSlotDuration,
  type ArenaWeekday,
  type ArenaWeekSchedule,
} from './courts-schedule-repository';

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const SLOT_LABEL: Record<ArenaSlotDuration, string> = { 30: '30 min', 60: '1 hora', 120: '2 horas' };

/** Tela Horários de funcionamento: não existe horário no doc da arena — o horário real vive
 *  por quadra (`availabilitySchedule`), aplicado em lote a TODAS as quadras de uma vez (mesmo
 *  padrão do `CourtService.generateSlots` no Flutter). Sem feriados/exceções nem "permitir fora
 *  do horário" — nenhum dos dois existe no backend, eram só protótipo. Só funciona se a arena já
 *  tiver quadras cadastradas (a tela Quadras do painel ainda é mock, então isso normalmente vai
 *  aparecer vazio até essa outra tela também ser conectada). */
@Component({
  selector: 'ar-panel-profile-hours',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, StatusDotComponent, ToggleComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Horários de funcionamento" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || loading() || courtsCount() === 0" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar horários' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando horários…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (courtsCount() === 0) {
          <ar-panel-card pad="lg">
            <p class="state-text">
              Nenhuma quadra cadastrada ainda. O horário de funcionamento é definido por quadra — cadastre pelo menos uma em
              <a routerLink="/painel/quadras" class="link">Quadras</a> antes de configurar os horários.
            </p>
          </ar-panel-card>
        } @else {
          <div class="col-left">
            @if (saveError(); as serr) {
              <div class="error-banner">{{ serr }}</div>
            }

            <ar-panel-card title="Duração dos horários">
              <div class="chip-row">
                @for (d of slotDurations; track d) {
                  <button type="button" class="ar-chip" [class.active]="slotDuration() === d" (click)="slotDuration.set(d)">{{ slotLabel[d] }}</button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card [kicker]="openDaysCount() + ' de 7 dias abertos'" title="Semana padrão">
              <p class="hint">Aplicado a todas as {{ courtsCount() }} quadras da arena.</p>
              <div class="days">
                @for (day of weekdays; track day) {
                  <div class="day-row">
                    <ar-toggle [checked]="!schedule()[day].closed" [label]="'Ativar ' + weekdayLabel[day]" (changed)="setDayOpen(day, $event)" />
                    <span class="day-label">{{ weekdayLabel[day] }}</span>
                    <div class="interval-row">
                      <input
                        type="time"
                        class="input-box time-input"
                        [disabled]="schedule()[day].closed"
                        [value]="schedule()[day].open"
                        (input)="setDayTime(day, 'open', $any($event.target).value)"
                      />
                      <span class="ate">até</span>
                      <input
                        type="time"
                        class="input-box time-input"
                        [disabled]="schedule()[day].closed"
                        [value]="schedule()[day].close"
                        (input)="setDayTime(day, 'close', $any($event.target).value)"
                      />
                    </div>
                  </div>
                }
              </div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card title="Status agora">
              <div class="status-row">
                <ar-status-dot [tone]="isOpenNow() ? 'green' : 'red'" [size]="8" />
                <span class="status-text">{{ isOpenNow() ? 'Aberta agora' : 'Fechada agora' }}</span>
              </div>
              @if (statusCaption(); as caption) {
                <div class="status-caption">{{ caption }}</div>
              }
            </ar-panel-card>

            <div class="hint-box">Fora do horário de funcionamento, as quadras não aparecem disponíveis para reserva no app.</div>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: grid;
      grid-template-columns: 1fr 373px;
      gap: 16px;
      align-items: start;
      overflow: auto;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .link {
      color: var(--nx-orange-500);
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .hint {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 0 0 14px;
    }

    .chip-row {
      display: flex;
      gap: 8px;
    }

    .days {
      display: flex;
      flex-direction: column;
    }

    .day-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
      flex-wrap: wrap;
    }

    .day-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .day-row:first-child {
      padding-top: 0;
    }

    .day-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      width: 130px;
      flex: none;
    }

    .interval-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .input-box {
      height: 42px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 12px;
      box-sizing: border-box;
    }

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .input-box:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .time-input {
      width: 96px;
    }

    .ate {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .status-text {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .status-caption {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 8px;
    }

    .hint-box {
      padding: 14px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileHoursComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly weekdays = ARENA_WEEKDAYS;
  protected readonly weekdayLabel = ARENA_WEEKDAY_LABEL;
  protected readonly slotDurations = ARENA_SLOT_DURATIONS;
  protected readonly slotLabel = SLOT_LABEL;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · define quando os clientes podem reservar quadras`,
  );

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly courtsCount = signal(0);
  protected readonly slotDuration = signal<ArenaSlotDuration>(60);
  protected readonly schedule = signal<ArenaWeekSchedule>(defaultWeekSchedule());

  protected readonly openDaysCount = computed(() => this.weekdays.filter((d) => !this.schedule()[d].closed).length);

  private readonly currentWeekday = ARENA_WEEKDAYS[(new Date().getDay() + 6) % 7]!;
  private readonly currentMinutes = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();

  protected readonly isOpenNow = computed(() => {
    const today = this.schedule()[this.currentWeekday];
    if (today.closed) return false;
    return timeToMinutes(today.open) <= this.currentMinutes && this.currentMinutes < timeToMinutes(today.close);
  });

  protected readonly statusCaption = computed(() => {
    const today = this.schedule()[this.currentWeekday];
    const label = this.weekdayLabel[this.currentWeekday];
    if (today.closed) return `Fechada hoje · ${label}`;
    if (this.isOpenNow()) return `Fecha às ${today.close} · ${label}`;
    if (this.currentMinutes < timeToMinutes(today.open)) return `Abre às ${today.open} · ${label}`;
    return `Fechada hoje · ${label}`;
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const template = await fetchScheduleTemplate(arenaFirestore(), arenaId);
      this.courtsCount.set(template.courtsCount);
      this.slotDuration.set(template.slotDurationMinutes);
      this.schedule.set(template.schedule);
    } catch {
      this.loadError.set('Não foi possível carregar os horários.');
    } finally {
      this.loading.set(false);
    }
  }

  protected setDayOpen(day: ArenaWeekday, open: boolean): void {
    this.schedule.update((current) => ({ ...current, [day]: { ...current[day], closed: !open } }));
  }

  protected setDayTime(day: ArenaWeekday, field: 'open' | 'close', value: string): void {
    this.schedule.update((current) => ({ ...current, [day]: { ...current[day], [field]: value } }));
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.saveError.set(null);
    try {
      await applyScheduleToAllCourts(arenaFirestore(), arenaId, this.slotDuration(), this.schedule());
      await this.load(arenaId);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar os horários.');
    } finally {
      this.saving.set(false);
    }
  }
}
