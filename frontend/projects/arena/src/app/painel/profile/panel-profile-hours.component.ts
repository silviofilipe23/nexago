import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { StatusDotComponent } from '../ui/status-dot.component';
import { ToggleComponent } from '../ui/toggle.component';

interface DayInterval {
  start: string;
  end: string;
}

interface DaySchedule {
  key: string;
  label: string;
  abbrev: string;
  open: boolean;
  intervals: DayInterval[];
}

interface Exception {
  id: string;
  name: string;
  monthAbbrev: string;
  day: string;
  fullDate: string;
}

const MONTH_ABBREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const JS_DAY_TO_KEY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { key: 'seg', label: 'Segunda-feira', abbrev: 'Seg', open: true, intervals: [{ start: '07:00', end: '22:00' }] },
  { key: 'ter', label: 'Terça-feira', abbrev: 'Ter', open: true, intervals: [{ start: '07:00', end: '22:00' }] },
  { key: 'qua', label: 'Quarta-feira', abbrev: 'Qua', open: true, intervals: [{ start: '07:00', end: '22:00' }] },
  { key: 'qui', label: 'Quinta-feira', abbrev: 'Qui', open: true, intervals: [{ start: '07:00', end: '22:00' }] },
  { key: 'sex', label: 'Sexta-feira', abbrev: 'Sex', open: true, intervals: [{ start: '07:00', end: '23:00' }] },
  { key: 'sab', label: 'Sábado', abbrev: 'Sáb', open: true, intervals: [{ start: '06:00', end: '20:00' }] },
  { key: 'dom', label: 'Domingo', abbrev: 'Dom', open: true, intervals: [{ start: '06:00', end: '18:00' }] },
];

const DEFAULT_EXCEPTIONS: Exception[] = [
  { id: 'ex1', name: 'Natal', monthAbbrev: 'DEZ', day: '25', fullDate: '25 Dez 2026' },
  { id: 'ex2', name: 'Ano Novo', monthAbbrev: 'JAN', day: '01', fullDate: '01 Jan 2027' },
  { id: 'ex3', name: 'Tiradentes', monthAbbrev: 'ABR', day: '21', fullDate: '21 Abr 2026' },
];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Tela Horários de funcionamento do painel (protótipo ArHorariosScreen): semana padrão, feriados/exceções e status ao vivo. */
@Component({
  selector: 'ar-panel-profile-hours',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, StatusDotComponent, ToggleComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Horários de funcionamento" [subtitle]="arenaName() + ' · define quando os clientes podem reservar quadras'">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="save()">
          <ar-icon name="check" [size]="14" />
          Salvar horários
        </button>
      </ar-page-header>

      <div class="body">
        <div class="col-left">
          <ar-panel-card [kicker]="openDaysCount() + ' de 7 dias abertos'" title="Semana padrão">
            <div class="days">
              @for (day of schedule(); track day.key) {
                <div class="day-block" [class.last]="$last">
                  <div class="day-row">
                    <ar-toggle [checked]="day.open" [label]="'Ativar ' + day.label" (changed)="setDayOpen(day.key, $event)" />
                    <span class="day-label">{{ day.label }}</span>

                    <div class="intervals">
                      @for (iv of day.intervals; track $index; let i = $index) {
                        <div class="interval-row">
                          <input
                            type="time"
                            class="input-box time-input"
                            [disabled]="!day.open"
                            [value]="iv.start"
                            (input)="setIntervalTime(day.key, i, 'start', $any($event.target).value)"
                          />
                          <span class="ate">até</span>
                          <input
                            type="time"
                            class="input-box time-input"
                            [disabled]="!day.open"
                            [value]="iv.end"
                            (input)="setIntervalTime(day.key, i, 'end', $any($event.target).value)"
                          />
                          @if (i > 0) {
                            <button type="button" class="remove-interval" (click)="removeInterval(day.key, i)" aria-label="Remover intervalo">×</button>
                          }
                        </div>
                      }
                    </div>

                    <button type="button" class="add-interval" [disabled]="!day.open" (click)="addInterval(day.key)">
                      <ar-icon name="plus" [size]="12" />
                      Adicionar intervalo
                    </button>
                  </div>
                </div>
              }
            </div>
          </ar-panel-card>

          <ar-panel-card [kicker]="exceptions().length + ' datas cadastradas'" title="Feriados e exceções">
            <button type="button" class="ar-mini-btn" card-actions (click)="showAddException.set(true)">
              <ar-icon name="plus" [size]="14" />
              Adicionar data
            </button>

            <div class="exception-list">
              @for (ex of exceptions(); track ex.id) {
                <div class="exception-row">
                  <div class="date-badge">
                    <span class="date-month">{{ ex.monthAbbrev }}</span>
                    <span class="date-day">{{ ex.day }}</span>
                  </div>
                  <div class="exception-body">
                    <div class="exception-name">{{ ex.name }}</div>
                    <div class="exception-date">{{ ex.fullDate }}</div>
                  </div>
                  <ar-pill tone="red">Fechado</ar-pill>
                  <button type="button" class="remove-btn" (click)="removeException(ex.id)" aria-label="Remover data">×</button>
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

          <ar-panel-card title="Reservas fora do horário">
            <div class="setting-row">
              <p class="setting-text">Permitir clientes reservarem fora do horário cadastrado</p>
              <ar-toggle [checked]="allowOutsideHours()" (changed)="allowOutsideHours.set($event)" />
            </div>
          </ar-panel-card>

          <div class="hint-box">
            Fora do horário de funcionamento, as quadras não aparecem disponíveis para reserva no app.
          </div>
        </div>
      </div>

      @if (showAddException()) {
        <ar-modal (close)="showAddException.set(false)">
          <h2 class="modal-title">Adicionar data</h2>
          <p class="modal-subtitle">Marque um feriado ou exceção como fechado</p>

          <div class="field-label">Nome</div>
          <input type="text" class="input-box name-input" placeholder="Ex.: Carnaval" [value]="newExceptionName()" (input)="newExceptionName.set($any($event.target).value)" />

          <div class="field-label">Data</div>
          <input type="date" class="input-box date-input" [value]="newExceptionDate()" (input)="newExceptionDate.set($any($event.target).value)" />

          <div class="actions">
            <button type="button" class="ar-ghost-btn" (click)="showAddException.set(false)">Cancelar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-btn" [disabled]="!canAddException()" (click)="addException()">
              Adicionar
            </button>
          </div>
        </ar-modal>
      }
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

    .days {
      display: flex;
      flex-direction: column;
    }

    .day-block {
      padding: 16px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .day-block.last {
      border-bottom: none;
      padding-bottom: 0;
    }

    .day-block:first-child {
      padding-top: 0;
    }

    .day-row {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .day-label {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
      color: var(--nx-text);
      width: 130px;
      flex: none;
    }

    .intervals {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .interval-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .time-input {
      width: 96px;
    }

    .ate {
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .remove-interval {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-live);
      font-size: 15px;
      line-height: 1;
      display: grid;
      place-items: center;
    }

    .remove-interval:hover {
      background: rgba(255, 59, 48, 0.12);
    }

    .add-interval {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      padding: 4px 0;
    }

    .add-interval:hover:not(:disabled) {
      color: var(--nx-text);
    }

    .add-interval:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .exception-list {
      display: flex;
      flex-direction: column;
      margin-top: 6px;
    }

    .exception-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .exception-row:last-child {
      border-bottom: none;
    }

    .date-badge {
      width: 46px;
      height: 46px;
      flex: none;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .date-month {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--nx-text-dim);
    }

    .date-day {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 15px;
      color: var(--nx-text);
    }

    .exception-body {
      flex: 1;
      min-width: 0;
    }

    .exception-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .exception-date {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .remove-btn {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--nx-live);
      font-size: 16px;
      line-height: 1;
      display: grid;
      place-items: center;
    }

    .remove-btn:hover {
      background: rgba(255, 59, 48, 0.12);
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

    .setting-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .setting-text {
      flex: 1;
      font-size: 13px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      margin: 0;
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

    .input-box {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
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

    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .modal-subtitle {
      font-size: 13px;
      color: var(--nx-text-dim);
      margin: 4px 0 20px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .name-input,
    .date-input {
      width: 100%;
    }

    .name-input {
      margin-bottom: 18px;
    }

    .date-input {
      margin-bottom: 24px;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .confirm-btn {
      height: 44px;
      padding: 0 20px;
    }

    @media (max-width: 1180px) {
      .body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileHoursComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly schedule = signal<DaySchedule[]>(DEFAULT_SCHEDULE);
  protected readonly exceptions = signal<Exception[]>(DEFAULT_EXCEPTIONS);
  protected readonly allowOutsideHours = signal(false);

  protected readonly showAddException = signal(false);
  protected readonly newExceptionName = signal('');
  protected readonly newExceptionDate = signal('');

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly openDaysCount = computed(() => this.schedule().filter((d) => d.open).length);

  private readonly currentDayKey = JS_DAY_TO_KEY[new Date().getDay()];
  private readonly currentMinutes = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();

  private readonly todaySchedule = computed(() => this.schedule().find((d) => d.key === this.currentDayKey) ?? null);

  private readonly activeInterval = computed(() => {
    const today = this.todaySchedule();
    if (!today || !today.open) {
      return null;
    }
    return today.intervals.find((iv) => timeToMinutes(iv.start) <= this.currentMinutes && this.currentMinutes < timeToMinutes(iv.end)) ?? null;
  });

  protected readonly isOpenNow = computed(() => this.activeInterval() !== null);

  protected readonly statusCaption = computed(() => {
    const today = this.todaySchedule();
    if (!today) {
      return '';
    }
    const interval = this.activeInterval();
    if (interval) {
      return `Fecha às ${interval.end} · ${today.abbrev}`;
    }
    if (today.open && today.intervals.length) {
      const next = today.intervals.find((iv) => timeToMinutes(iv.start) > this.currentMinutes);
      if (next) {
        return `Abre às ${next.start} · ${today.abbrev}`;
      }
    }
    return `Fechada hoje · ${today.abbrev}`;
  });

  protected readonly canAddException = computed(() => this.newExceptionName().trim().length > 0 && this.newExceptionDate().length > 0);

  protected setDayOpen(key: string, open: boolean): void {
    this.schedule.update((current) => current.map((d) => (d.key === key ? { ...d, open } : d)));
  }

  protected setIntervalTime(key: string, index: number, field: 'start' | 'end', value: string): void {
    this.schedule.update((current) =>
      current.map((d) => {
        if (d.key !== key) {
          return d;
        }
        const intervals = d.intervals.map((iv, i) => (i === index ? { ...iv, [field]: value } : iv));
        return { ...d, intervals };
      }),
    );
  }

  protected addInterval(key: string): void {
    this.schedule.update((current) =>
      current.map((d) => (d.key === key ? { ...d, intervals: [...d.intervals, { start: '08:00', end: '12:00' }] } : d)),
    );
  }

  protected removeInterval(key: string, index: number): void {
    this.schedule.update((current) =>
      current.map((d) => (d.key === key ? { ...d, intervals: d.intervals.filter((_, i) => i !== index) } : d)),
    );
  }

  protected removeException(id: string): void {
    this.exceptions.update((current) => current.filter((ex) => ex.id !== id));
  }

  protected addException(): void {
    if (!this.canAddException()) {
      return;
    }
    const date = new Date(this.newExceptionDate() + 'T00:00:00');
    const exception: Exception = {
      id: `ex-${Date.now()}`,
      name: this.newExceptionName().trim(),
      monthAbbrev: MONTH_ABBREV[date.getMonth()].toUpperCase(),
      day: String(date.getDate()).padStart(2, '0'),
      fullDate: `${String(date.getDate()).padStart(2, '0')} ${MONTH_ABBREV[date.getMonth()]} ${date.getFullYear()}`,
    };
    this.exceptions.update((current) => [...current, exception]);
    this.showAddException.set(false);
    this.newExceptionName.set('');
    this.newExceptionDate.set('');
  }

  protected save(): void {
    this.router.navigate(['/painel/perfil']);
  }
}
