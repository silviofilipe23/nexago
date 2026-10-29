import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ArenaCourt } from '../courts/court.model';
import { fetchCourtsList } from '../courts/courts-repository';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { formatBRL } from '../bookings/arena-booking.model';
import { AvatarComponent } from '../ui/avatar.component';
import { DatePickerComponent } from '../ui/date-picker.component';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { ToggleComponent } from '../ui/toggle.component';
import {
  activateArenaRainMode,
  endArenaRainMode,
  getArenaWeatherForecast,
  previewArenaRainMode,
  watchRainModeEvents,
  type RainModeWindow,
} from './weather-repository';
import { WxHourlyComponent, WxIconComponent } from './weather-ui';
import {
  MANUAL_REASON_LABEL,
  RAIN_MODE_FIRST_HOUR,
  RAIN_MODE_LAST_HOUR,
  affectedIsUnpaid,
  affectedValueLabel,
  applyHourClick,
  clockLabel,
  dateKeyFrom,
  dayHeadingLabel,
  defaultRainModePeriod,
  hourRange,
  hoursBetween,
  policyCourtIncluded,
  rainModeActivationMessage,
  rainModeDefaultMessage,
  rainModeEventCountsLabel,
  rainModeNotifiedAthletes,
  rainModeTotalsSentence,
  shortCourtName,
  suggestRainWindow,
  timeOfHour,
  weatherPolicyFromArenaDoc,
  type RainModeActivation,
  type RainModeAffected,
  type RainModeEvent,
  type RainModePreview,
  type WeatherForecast,
} from './weather.model';

const PREVIEW_DEBOUNCE_MS = 300;

/** 02 · Modo chuva (`/painel/agenda/chuva`): a arena marca data, período e quadras, vê as
 *  reservas que a chuva pega (`previewArenaRainMode`) e ativa (`activateArenaRainMode`): os
 *  atletas são avisados e escolhem remarcar ou crédito. As ativações do dia ficam listadas,
 *  com "Liberar novas reservas" (`endArenaRainMode`) enquanto o bloqueio estiver de pé. */
@Component({
  selector: 'ar-panel-weather-rain-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    PillComponent,
    ToggleComponent,
    ModalComponent,
    AvatarComponent,
    DatePickerComponent,
    IconComponent,
    WxIconComponent,
    WxHourlyComponent,
  ],
  styleUrl: './weather.scss',
  template: `
    <ar-panel-shell>
      <ar-page-header title="Modo chuva" [subtitle]="'Agenda · ' + dayHeading()">
        <div class="header-actions">
          <button type="button" class="ar-ghost-btn" [disabled]="isToday()" (click)="setDate(todayKey)">Hoje</button>
          <ar-date-picker [selected]="date()" (dateChange)="setDate($event)" />
          <a class="ar-mini-btn" routerLink="/painel/agenda/chuva/solicitacoes">Solicitações</a>
          <a class="ar-mini-btn" routerLink="/painel/agenda/chuva/politica">
            <ar-icon name="gear" [size]="13" />
            Política de clima
          </a>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else {
          @if (!policy().enabled) {
            <div class="warn-banner policy-off">
              <span><strong>Cancelamento por chuva desligado.</strong> Ligue a política de clima para poder ativar o Modo chuva.</span>
              <a class="banner-link" routerLink="/painel/agenda/chuva/politica">Abrir política</a>
            </div>
          }
          @if (readOnly()) {
            <div class="info-banner">Seu cargo pode ver o Modo chuva, mas não ativar.</div>
          }
          @if (dateNotice(); as n) {
            <div class="info-banner" role="status">{{ n }}</div>
          }
          @if (eventsError(); as err) {
            <div class="error-banner" role="alert">{{ err }}</div>
          }

          @if (events().length > 0) {
            <ar-panel-card title="Modo chuva ativado" [kicker]="dayHeading()">
              <div class="events">
                @for (ev of events(); track ev.id) {
                  <div class="event-row">
                    <div class="wx-icon-tile event-icon"><ar-wx-icon name="rain" [size]="18" /></div>
                    <div class="event-text">
                      <div class="event-title">
                        {{ ev.startTime }}–{{ ev.endTime }} · {{ eventCourtsLabel(ev) }}
                        <ar-pill [tone]="ev.status === 'active' ? 'blue' : 'dim'">{{ ev.status === 'active' ? 'Ativo' : 'Encerrado' }}</ar-pill>
                      </div>
                      <div class="event-sub">
                        {{ eventCountsLabel(ev.counts) }}
                        @if (ev.blockNewBookings && ev.status === 'active') {
                          · novas reservas bloqueadas
                        }
                      </div>
                    </div>
                    @if (ev.blockNewBookings && ev.status === 'active') {
                      <button
                        type="button"
                        class="ar-mini-btn end-btn"
                        [disabled]="readOnly() || endingEventId() != null"
                        (click)="endEvent(ev)"
                      >
                        {{ endingEventId() === ev.id ? 'Liberando…' : 'Liberar novas reservas' }}
                      </button>
                    }
                  </div>
                }
              </div>
            </ar-panel-card>
          }

          <div class="ar-split" style="--ar-split-aside: 380px">
            <div class="col">
              <ar-panel-card [title]="isToday() ? 'Previsão para hoje' : 'Previsão'" [kicker]="city()">
                @if (forecast()?.fetchedAt; as at) {
                  <span card-actions class="fetched">atualizada {{ clock(at) }}</span>
                }
                @if (forecastLoading()) {
                  <p class="state-text">Carregando previsão…</p>
                } @else if (forecastError(); as err) {
                  <p class="fine forecast-error">{{ err }}</p>
                } @else if (forecastLoaded() && forecast() == null) {
                  <div class="info-banner no-forecast">Sem previsão para a localização da arena. Confira o endereço no perfil da arena.</div>
                } @else if (forecastLoaded() && visibleHours().length === 0) {
                  <div class="info-banner no-forecast">Sem previsão por hora para esta data.</div>
                } @else if (visibleHours().length > 0) {
                  <ar-wx-hourly [hours]="visibleHours()" [startHour]="startHour()" [endHour]="endHour()" (hourClick)="onHourClick($event)" />
                  <p class="fine hourly-hint">Toque numa hora para começar o período e noutra para fechar.</p>
                }

                <div class="controls">
                  <div>
                    <div class="wx-kicker">Período</div>
                    <div class="period">
                      <select class="time-select start-select" aria-label="Início do período" (change)="setStart(+$any($event.target).value)">
                        @for (h of startOptions; track h) {
                          <option [value]="h" [selected]="h === startHour()">{{ timeOfHour(h) }}</option>
                        }
                      </select>
                      <span class="until">até</span>
                      <select class="time-select end-select" aria-label="Fim do período" (change)="setEnd(+$any($event.target).value)">
                        @for (h of endOptions(); track h) {
                          <option [value]="h" [selected]="h === endHour()">{{ timeOfHour(h) }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  <div class="courts-control">
                    <div class="wx-kicker">Quadras</div>
                    <div class="chip-row court-chips">
                      @for (c of courts(); track c.id) {
                        <button
                          type="button"
                          class="ar-chip wx-blue court-chip"
                          [class.active]="isCourtSelected(c.id)"
                          [attr.aria-pressed]="isCourtSelected(c.id)"
                          [title]="c.name"
                          (click)="toggleCourt(c.id)"
                        >
                          {{ courtChipLabel(c) }}
                        </button>
                      } @empty {
                        <span class="fine">{{ courtsLoading() ? 'Carregando quadras…' : 'Nenhuma quadra cadastrada.' }}</span>
                      }
                    </div>
                  </div>
                </div>
              </ar-panel-card>

              <ar-panel-card title="Reservas afetadas">
                <ar-pill card-actions tone="dim">{{ affectedCountLabel() }}</ar-pill>
                @if (previewError(); as err) {
                  <div class="error-banner" role="alert">{{ err }}</div>
                } @else if (selectedCourtIds().length === 0) {
                  <p class="state-text">Marque ao menos uma quadra.</p>
                } @else if (previewLoading() && preview() == null) {
                  <p class="state-text">Buscando reservas…</p>
                } @else {
                  <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Tabela de reservas afetadas pela chuva">
                    <div class="affected-table" [class.stale]="previewLoading()">
                      <div class="table-head affected-grid">
                        <span class="wx-kicker">Atleta</span>
                        <span class="wx-kicker">Quadra</span>
                        <span class="wx-kicker">Horário</span>
                        <span class="wx-kicker">Pago</span>
                        <span class="wx-kicker right">Valor</span>
                      </div>
                      @for (a of affected(); track a.bookingId) {
                        <div class="table-row affected-grid affected-row">
                          <div class="who">
                            <ar-avatar [name]="a.athleteName ?? '—'" [size]="28" />
                            <span class="who-name">{{ a.athleteName ?? '—' }}</span>
                          </div>
                          <span class="cell-ui">{{ a.courtName }}</span>
                          <span class="cell-mono">{{ a.startTime }}–{{ a.endTime }}</span>
                          <span>
                            @if (isUnpaid(a)) {
                              <ar-pill tone="yellow">Não pago</ar-pill>
                            } @else {
                              <span class="cell-ui">{{ a.paymentLabel || '—' }}</span>
                            }
                          </span>
                          <span class="value-cell">
                            @if (a.treatment === 'manual') {
                              <span class="cell-ui">Tratar à parte</span>
                              @if (a.manualReason) {
                                <ar-pill tone="dim">{{ manualReasonLabel[a.manualReason] }}</ar-pill>
                              }
                            } @else {
                              <span class="cell-money">{{ valueLabel(a) }}</span>
                            }
                          </span>
                        </div>
                      } @empty {
                        <p class="state-text empty-text">Nenhuma reserva neste período e nestas quadras.</p>
                      }
                    </div>
                  </div>
                }
              </ar-panel-card>
            </div>

            <div class="col">
              <ar-panel-card title="Mensagem para os atletas" kicker="Push + aviso no app">
                <textarea
                  class="input-box message-input"
                  maxlength="240"
                  aria-label="Mensagem para os atletas (opcional)"
                  [placeholder]="defaultMessage()"
                  [disabled]="readOnly()"
                  [value]="message()"
                  (input)="message.set($any($event.target).value)"
                ></textarea>
                <p class="fine message-hint">Opcional. Em branco, vai a mensagem acima.</p>
                <div class="block-row">
                  <span class="cell-ui">Bloquear novas reservas no período</span>
                  <ar-toggle
                    label="Bloquear novas reservas no período"
                    [checked]="blockNewBookings()"
                    [disabled]="readOnly()"
                    (changed)="blockNewBookings.set($event)"
                  />
                </div>
              </ar-panel-card>

              <ar-panel-card title="Impacto">
                <div class="wx-lines">
                  <div class="wx-line"><span>Reservas pagas (liberadas)</span><span class="v">{{ totals().release }}</span></div>
                  <div class="wx-line"><span>Chuva no meio do jogo (proporcional)</span><span class="v">{{ totals().partial }}</span></div>
                  <div class="wx-line"><span>Não pagas (só cancela)</span><span class="v">{{ totals().cancel }}</span></div>
                  <div class="wx-line"><span>Tratar à parte</span><span class="v">{{ totals().manual }}</span></div>
                  <div class="wx-divider"></div>
                  <div class="wx-line"><span>Valor que pode virar crédito</span><span class="v strong creditable">{{ formatBRL(totals().creditableReais) }}</span></div>
                  <p class="fine">Nada sai do caixa. Quem não escolher em 24h recebe o crédito automaticamente.</p>
                </div>
              </ar-panel-card>

              <!-- Junto do botão: no topo da página o resultado ficava fora da vista de quem ativou. -->
              @if (activation(); as r) {
                <div class="notice activation-result" role="status">{{ activationMessage(r) }}</div>
              }
              <button type="button" class="wx-btn-blue activate-btn" [disabled]="!canActivate()" (click)="openConfirm()">
                <ar-wx-icon name="rain" [size]="17" [strokeWidth]="2" />
                {{ activateLabel() }}
              </button>
            </div>
          </div>
        }
      </div>

      @if (confirmOpen()) {
        <ar-modal (close)="closeConfirm()">
          <h2 class="modal-title">Ativar o Modo chuva?</h2>
          <p class="modal-body">
            {{ dayHeading() }} · {{ timeOfHour(startHour()) }}–{{ timeOfHour(endHour()) }} · {{ selectedCourtsLabel() }}.
            {{ totalsSentence() }}. Os atletas recebem push e aviso no app{{ blockNewBookings() ? ', e o período fica fechado para novas reservas' : '' }}.
            Não dá para desfazer.
          </p>
          @if (activateError(); as err) {
            <div class="error-banner modal-error" role="alert">{{ err }}</div>
          }
          <div class="modal-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="activating()" (click)="closeConfirm()">Voltar</button>
            <button type="button" class="wx-btn-blue confirm-btn" [disabled]="activating()" (click)="activate()">
              {{ activating() ? 'Ativando…' : activateLabel() }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .fetched {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .hourly-hint {
      margin-top: 8px;
    }

    .controls {
      display: flex;
      gap: 24px;
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
      align-items: flex-end;
      flex-wrap: wrap;
    }

    .courts-control {
      min-width: 0;
      flex: 1 1 220px;
    }

    .period {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .until {
      color: var(--nx-text-dim);
      font-size: 12.5px;
    }

    .time-select {
      height: 34px;
      padding: 0 10px;
      border-radius: 9px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
    }

    .court-chips {
      margin-top: 8px;
    }

    .affected-grid {
      grid-template-columns: minmax(140px, 1.4fr) minmax(76px, 0.8fr) 96px minmax(84px, 0.9fr) minmax(190px, 1.3fr);
    }

    /* Vence o "min-width: max-content" global do .ar-table-scroll: com colunas fr ele media a
       tabela pelo maior texto de cada coluna (~830px) e escondia "Valor" dentro do card. */
    .affected-table {
      min-width: 640px;
    }

    .affected-table.stale {
      opacity: 0.55;
      transition: opacity 140ms var(--nx-ease-out);
    }

    .right {
      text-align: right;
    }

    .value-cell {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      text-align: right;
      white-space: nowrap;
    }

    .empty-text {
      padding: 14px 0 4px;
    }

    .message-input {
      min-height: 96px;
    }

    .message-hint {
      margin-top: 6px;
    }

    .block-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 14px;
    }

    .events {
      display: flex;
      flex-direction: column;
    }

    .event-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
      flex-wrap: wrap;
    }

    .event-row:last-child {
      border-bottom: none;
    }

    .event-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
    }

    .event-text {
      flex: 1 1 220px;
      min-width: 0;
    }

    .event-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .event-sub {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .modal-error {
      margin-bottom: 16px;
    }

    .confirm-btn {
      width: auto;
      height: 44px;
      padding: 0 18px;
    }
  `,
})
export class PanelWeatherRainModeComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly formatBRL = formatBRL;
  protected readonly timeOfHour = timeOfHour;
  protected readonly clock = clockLabel;
  protected readonly manualReasonLabel = MANUAL_REASON_LABEL;
  protected readonly activationMessage = rainModeActivationMessage;
  protected readonly eventCountsLabel = rainModeEventCountsLabel;
  protected readonly startOptions = hourRange(RAIN_MODE_FIRST_HOUR, RAIN_MODE_LAST_HOUR - 1);

  protected readonly todayKey = dateKeyFrom(new Date());

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'arena');
  protected readonly policy = computed(() => weatherPolicyFromArenaDoc(this.arenaContext.arenaDocData()));
  protected readonly city = computed(() => {
    const city = this.arenaContext.arenaDocData()?.['city'];
    return typeof city === 'string' ? city.trim() : '';
  });

  protected readonly date = signal(this.todayKey);
  protected readonly isToday = computed(() => this.date() === this.todayKey);
  protected readonly dayHeading = computed(() => dayHeadingLabel(this.date(), this.todayKey));
  protected readonly dateNotice = signal<string | null>(null);

  protected readonly startHour = signal(defaultRainModePeriod(this.todayKey, this.todayKey, new Date()).startHour);
  protected readonly endHour = signal(defaultRainModePeriod(this.todayKey, this.todayKey, new Date()).endHour);
  protected readonly endOptions = computed(() => hourRange(this.startHour() + 1, RAIN_MODE_LAST_HOUR));
  private readonly anchorHour = signal<number | null>(null);
  /** A arena mexeu no período: a sugestão da previsão não sobrescreve mais. */
  private periodTouched = false;

  protected readonly courts = signal<ArenaCourt[]>([]);
  protected readonly courtsLoading = signal(false);
  /** `null` = segue as quadras da política. */
  private readonly courtSelection = signal<string[] | null>(null);
  protected readonly selectedCourtIds = computed(() => {
    const picked = this.courtSelection();
    if (picked) return picked;
    const policyCourts = this.policy().courtIds;
    return this.courts()
      .filter((c) => policyCourtIncluded(policyCourts, c.id))
      .map((c) => c.id);
  });

  protected readonly forecast = signal<WeatherForecast | null>(null);
  protected readonly forecastLoading = signal(false);
  protected readonly forecastLoaded = signal(false);
  protected readonly forecastError = signal<string | null>(null);
  protected readonly visibleHours = computed(() => hoursBetween(this.forecast()?.hours ?? [], RAIN_MODE_FIRST_HOUR, RAIN_MODE_LAST_HOUR - 1));
  private forecastSeq = 0;

  protected readonly preview = signal<RainModePreview | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewError = signal<string | null>(null);
  private readonly refreshTick = signal(0);
  private previewSeq = 0;
  protected readonly affected = computed<RainModeAffected[]>(() => this.preview()?.bookings ?? []);
  protected readonly totals = computed(
    () => this.preview()?.totals ?? { release: 0, partial: 0, cancel: 0, manual: 0, creditableReais: 0 },
  );
  protected readonly affectedCountLabel = computed(() => {
    const n = this.affected().length;
    return n === 1 ? '1 reserva' : `${n} reservas`;
  });
  protected readonly notifyCount = computed(() => rainModeNotifiedAthletes(this.affected()));
  protected readonly totalsSentence = computed(() => rainModeTotalsSentence(this.totals()));

  protected readonly message = signal('');
  protected readonly blockNewBookings = signal(true);
  protected readonly defaultMessage = computed(() =>
    rainModeDefaultMessage(this.arenaName(), this.date(), this.todayKey, this.policy().allowReschedule),
  );

  protected readonly confirmOpen = signal(false);
  protected readonly activating = signal(false);
  protected readonly activateError = signal<string | null>(null);
  protected readonly activation = signal<RainModeActivation | null>(null);

  protected readonly events = signal<RainModeEvent[]>([]);
  protected readonly eventsError = signal<string | null>(null);
  protected readonly endingEventId = signal<string | null>(null);

  protected readonly activateLabel = computed(() => {
    const n = this.notifyCount();
    if (n === 0) return 'Ativar Modo chuva';
    return n === 1 ? 'Ativar e avisar 1 atleta' : `Ativar e avisar ${n} atletas`;
  });

  /** Sem arena não há prévia (`previewKey` nulo), então `preview() != null` já cobre isso. */
  protected readonly canActivate = computed(
    () =>
      !this.readOnly() &&
      this.policy().enabled &&
      !this.activating() &&
      !this.previewLoading() &&
      this.preview() != null &&
      this.previewError() == null &&
      this.selectedCourtIds().length > 0 &&
      this.endHour() > this.startHour(),
  );

  protected readonly selectedCourtsLabel = computed(() => {
    const ids = new Set(this.selectedCourtIds());
    const names = this.courts()
      .filter((c) => ids.has(c.id))
      .map((c) => shortCourtName(c.name));
    return names.length === this.courts().length && names.length > 0 ? 'todas as quadras' : names.join(', ');
  });

  /** Chave da prévia: só refaz a consulta quando algo que muda o resultado muda de fato (o doc
   *  da arena é ao vivo e reemite o mesmo conjunto de quadras). */
  private readonly previewKey = computed(() => {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return null;
    return JSON.stringify({
      arenaId,
      date: this.date(),
      startTime: timeOfHour(this.startHour()),
      endTime: timeOfHour(this.endHour()),
      courtIds: this.selectedCourtIds(),
      tick: this.refreshTick(),
    });
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.loadCourts(arenaId);
    });

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      const date = this.date();
      if (arenaId) void this.loadForecast(arenaId, date);
    });

    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      const date = this.date();
      this.events.set([]);
      this.eventsError.set(null);
      if (!arenaId) return;
      const unsub = watchRainModeEvents(
        arenaFirestore(),
        arenaId,
        date,
        (events) => {
          this.events.set(events);
          this.eventsError.set(null);
        },
        (message) => this.eventsError.set(message),
      );
      onCleanup(() => unsub());
    });

    effect((onCleanup) => {
      const key = this.previewKey();
      if (key == null) return;
      const win = JSON.parse(key) as RainModeWindow & { tick: number };
      const seq = ++this.previewSeq;
      if (win.courtIds.length === 0 || win.endTime <= win.startTime) {
        this.preview.set(null);
        this.previewLoading.set(false);
        this.previewError.set(null);
        return;
      }
      this.previewLoading.set(true);
      const timer = setTimeout(() => void this.loadPreview(seq, win), PREVIEW_DEBOUNCE_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private async loadCourts(arenaId: string): Promise<void> {
    this.courtsLoading.set(true);
    try {
      this.courts.set(await fetchCourtsList(arenaFirestore(), arenaId));
    } catch {
      this.courts.set([]);
    } finally {
      this.courtsLoading.set(false);
    }
  }

  private async loadForecast(arenaId: string, date: string): Promise<void> {
    const seq = ++this.forecastSeq;
    this.forecastLoading.set(true);
    this.forecastLoaded.set(false);
    this.forecastError.set(null);
    try {
      const forecast = await getArenaWeatherForecast(arenaFunctions(), arenaId, date);
      if (seq !== this.forecastSeq) return;
      this.forecast.set(forecast);
      this.forecastLoaded.set(true);
      if (forecast && !this.periodTouched) {
        const minHour = date === this.todayKey ? new Date().getHours() : RAIN_MODE_FIRST_HOUR;
        const suggestion = suggestRainWindow(forecast.hours, Math.max(minHour, RAIN_MODE_FIRST_HOUR));
        if (suggestion) {
          this.startHour.set(Math.min(suggestion.startHour, RAIN_MODE_LAST_HOUR - 1));
          this.endHour.set(Math.max(suggestion.endHour, suggestion.startHour + 1));
        }
      }
    } catch (err) {
      if (seq !== this.forecastSeq) return;
      this.forecast.set(null);
      this.forecastError.set(err instanceof Error ? err.message : 'Não foi possível carregar a previsão.');
    } finally {
      if (seq === this.forecastSeq) this.forecastLoading.set(false);
    }
  }

  private async loadPreview(seq: number, win: RainModeWindow): Promise<void> {
    try {
      const preview = await previewArenaRainMode(arenaFunctions(), {
        arenaId: win.arenaId,
        date: win.date,
        startTime: win.startTime,
        endTime: win.endTime,
        courtIds: win.courtIds,
      });
      if (seq !== this.previewSeq) return;
      this.preview.set(preview);
      this.previewError.set(null);
    } catch (err) {
      if (seq !== this.previewSeq) return;
      this.preview.set(null);
      this.previewError.set(err instanceof Error ? err.message : 'Não foi possível listar as reservas afetadas.');
    } finally {
      if (seq === this.previewSeq) this.previewLoading.set(false);
    }
  }

  protected setDate(dateKey: string): void {
    if (dateKey < this.todayKey) {
      this.dateNotice.set('O Modo chuva vale para hoje ou datas futuras.');
      return;
    }
    this.dateNotice.set(null);
    if (dateKey === this.date()) return;
    this.date.set(dateKey);
    this.activation.set(null);
    this.anchorHour.set(null);
    this.periodTouched = false;
    const period = defaultRainModePeriod(dateKey, this.todayKey, new Date());
    this.startHour.set(period.startHour);
    this.endHour.set(period.endHour);
  }

  protected setStart(hour: number): void {
    if (!Number.isInteger(hour)) return;
    this.periodTouched = true;
    this.anchorHour.set(null);
    this.startHour.set(hour);
    if (this.endHour() <= hour) this.endHour.set(Math.min(hour + 1, RAIN_MODE_LAST_HOUR));
  }

  protected setEnd(hour: number): void {
    if (!Number.isInteger(hour) || hour <= this.startHour()) return;
    this.periodTouched = true;
    this.anchorHour.set(null);
    this.endHour.set(hour);
  }

  protected onHourClick(hour: number): void {
    if (hour < RAIN_MODE_FIRST_HOUR || hour >= RAIN_MODE_LAST_HOUR) return;
    this.periodTouched = true;
    const next = applyHourClick(this.anchorHour(), hour);
    this.startHour.set(next.startHour);
    this.endHour.set(next.endHour);
    this.anchorHour.set(next.anchor);
  }

  protected isCourtSelected(courtId: string): boolean {
    return this.selectedCourtIds().includes(courtId);
  }

  protected toggleCourt(courtId: string): void {
    const current = this.selectedCourtIds();
    const next = current.includes(courtId) ? current.filter((id) => id !== courtId) : [...current, courtId];
    const order = this.courts().map((c) => c.id);
    this.courtSelection.set(order.filter((id) => next.includes(id)));
  }

  protected courtChipLabel(court: ArenaCourt): string {
    const short = shortCourtName(court.name);
    return policyCourtIncluded(this.policy().courtIds, court.id) ? short : `${short} · fora da política`;
  }

  protected eventCourtsLabel(ev: RainModeEvent): string {
    if (ev.courtIds.length === 0) return 'todas as quadras';
    const byId = new Map(this.courts().map((c) => [c.id, shortCourtName(c.name)]));
    return ev.courtIds.map((id) => byId.get(id) ?? 'Quadra').join(', ');
  }

  protected isUnpaid(a: RainModeAffected): boolean {
    return affectedIsUnpaid(a);
  }

  protected valueLabel(a: RainModeAffected): string {
    return affectedValueLabel(a);
  }

  protected openConfirm(): void {
    if (!this.canActivate()) return;
    this.activateError.set(null);
    this.confirmOpen.set(true);
  }

  protected closeConfirm(): void {
    if (this.activating()) return;
    this.confirmOpen.set(false);
  }

  protected async activate(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.activating()) return;
    this.activating.set(true);
    this.activateError.set(null);
    const message = this.message().trim();
    try {
      const result = await activateArenaRainMode(arenaFunctions(), {
        arenaId,
        date: this.date(),
        startTime: timeOfHour(this.startHour()),
        endTime: timeOfHour(this.endHour()),
        courtIds: this.selectedCourtIds(),
        blockNewBookings: this.blockNewBookings(),
        ...(message ? { message } : {}),
      });
      this.activation.set(result);
      this.confirmOpen.set(false);
      this.message.set('');
      // As reservas liberadas agora voltam como "Já liberada": refaz a prévia.
      this.refreshTick.update((n) => n + 1);
    } catch (err) {
      this.activateError.set(err instanceof Error ? err.message : 'Não foi possível ativar o Modo chuva.');
    } finally {
      this.activating.set(false);
    }
  }

  protected async endEvent(ev: RainModeEvent): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || this.endingEventId() != null) return;
    this.endingEventId.set(ev.id);
    this.eventsError.set(null);
    try {
      await endArenaRainMode(arenaFunctions(), arenaId, ev.id);
      this.dateNotice.set(`Novas reservas liberadas de novo entre ${ev.startTime} e ${ev.endTime}.`);
    } catch (err) {
      this.eventsError.set(err instanceof Error ? err.message : 'Não foi possível liberar as novas reservas.');
    } finally {
      this.endingEventId.set(null);
    }
  }
}
