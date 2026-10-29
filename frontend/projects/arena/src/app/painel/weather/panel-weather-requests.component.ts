import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatBRL, displayBookingCode } from '../bookings/arena-booking.model';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { decideArenaWeatherRequest, watchWeatherRequests } from './weather-repository';
import { WxIconComponent } from './weather-ui';
import {
  WEATHER_REQUEST_STATUS_PILL,
  WEATHER_REQUEST_TABS,
  bookingRefLabel,
  clockLabel,
  formatMm,
  hasRecordedRain,
  pendingWithRecordedRain,
  rainIntensityLabel,
  relativeTimeLabel,
  shortDateLabel,
  weatherPolicyFromArenaDoc,
  weatherRequestTabCounts,
  weatherRequestsForTab,
  type WeatherRequest,
  type WeatherRequestTab,
} from './weather.model';

/** 03 · Solicitações de clima (`/painel/agenda/chuva/solicitacoes`): pedidos "liberar por chuva"
 *  dos atletas (`arenaWeatherRequests`). Aprovar libera a reserva como no Modo chuva; recusar
 *  avisa o atleta com o motivo. O pedido não segura horário enquanto espera. */
@Component({
  selector: 'ar-panel-weather-requests',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, ModalComponent, AvatarComponent, IconComponent, WxIconComponent],
  styleUrl: './weather.scss',
  template: `
    <ar-panel-shell>
      <ar-page-header title="Solicitações de clima" subtitle="Agenda · Pedidos de cancelamento por chuva">
        <div class="header-actions">
          <a class="ar-ghost-btn" routerLink="/painel/agenda/chuva">Modo chuva</a>
          <a class="ar-ghost-btn" routerLink="/painel/agenda/chuva/politica">Política de clima</a>
          <button
            type="button"
            class="ar-mini-btn bulk-btn"
            [disabled]="readOnly() || bulkTargets().length === 0 || bulkRunning() || deciding() != null"
            (click)="openBulk()"
          >
            <ar-icon name="check" [size]="13" />
            Aprovar todas com chuva registrada
            @if (bulkTargets().length > 0) {
              <span class="bulk-count">{{ bulkTargets().length }}</span>
            }
          </button>
        </div>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else {
          @if (policy().trigger === 'arena') {
            <div class="info-banner trigger-hint">
              Hoje quem aciona é a arena (Modo chuva). Os atletas só conseguem pedir quando a política está em "O atleta solicita" ou
              "Automático pela previsão".
            </div>
          }
          @if (readOnly()) {
            <div class="info-banner">Seu cargo pode ver os pedidos, mas não decidir.</div>
          }
          @if (error(); as err) {
            <div class="error-banner" role="alert">{{ err }}</div>
          }
          @if (notice(); as n) {
            <div class="notice" role="status">{{ n }}</div>
          }

          <div class="ar-split" style="--ar-split-aside: 380px">
            <ar-panel-card pad="sm" class="list-card">
              <div class="tabs" role="tablist" aria-label="Situação dos pedidos">
                @for (t of tabs; track t.id) {
                  <button
                    type="button"
                    role="tab"
                    class="tab"
                    [class.active]="tab() === t.id"
                    [attr.aria-selected]="tab() === t.id"
                    (click)="setTab(t.id)"
                  >
                    {{ t.label }}<span class="tab-count">{{ counts()[t.id] }}</span>
                  </button>
                }
              </div>

              @if (loading()) {
                <p class="state-text list-state">Carregando pedidos…</p>
              } @else {
                <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Tabela de pedidos de cancelamento por chuva">
                  <div class="req-table">
                    <div class="table-head req-grid">
                      <span class="wx-kicker">Atleta</span>
                      <span class="wx-kicker">Reserva</span>
                      <span class="wx-kicker">Pago</span>
                      <span class="wx-kicker">Chuva no horário</span>
                      <span></span>
                    </div>
                    @for (r of tabList(); track r.id) {
                      <button
                        type="button"
                        class="table-row req-grid req-row"
                        [class.selected]="selected()?.id === r.id"
                        [attr.aria-pressed]="selected()?.id === r.id"
                        (click)="select(r.id)"
                      >
                        <span class="who">
                          <ar-avatar [name]="r.athleteName" [size]="30" />
                          <span class="who-text">
                            <span class="who-name">{{ r.athleteName }}</span>
                            <span class="who-sub">{{ relative(r.createdAt) }}</span>
                          </span>
                        </span>
                        <span class="cell-mono">{{ ref(r) }}</span>
                        <span class="cell-mono">{{ formatBRL(r.paidReais) }}</span>
                        <span class="rain-cell" [class.rained]="rained(r)">
                          @if (r.weather?.precipitationMm != null) {
                            <ar-wx-icon name="rain" [size]="14" />
                            <span>{{ mm(r.weather!.precipitationMm) }} mm</span>
                          } @else {
                            <span class="no-data">sem dado</span>
                          }
                          @if (r.autoApproved) {
                            <ar-pill tone="blue">Automático</ar-pill>
                          }
                        </span>
                        <ar-icon class="chevron" name="chevron-right" [size]="14" />
                      </button>
                    } @empty {
                      <p class="state-text list-state">{{ emptyText() }}</p>
                    }
                  </div>
                </div>
              }
            </ar-panel-card>

            <div class="col">
              @if (selected(); as s) {
                <ar-panel-card pad="sm">
                  <div class="detail-head">
                    <ar-avatar [name]="s.athleteName" [size]="40" />
                    <div class="detail-name">
                      <div class="detail-title">{{ s.athleteName }}</div>
                      <div class="who-sub">{{ code(s.bookingId) }} · {{ relative(s.createdAt) }}</div>
                    </div>
                    <div class="detail-pills">
                      @if (s.autoApproved) {
                        <ar-pill tone="blue">Automático</ar-pill>
                      }
                      <ar-pill [tone]="statusPill[s.status].tone">{{ statusPill[s.status].label }}</ar-pill>
                    </div>
                  </div>
                  <div class="note" [class.empty]="!s.note">{{ s.note ? '“' + s.note + '”' : 'Sem observação do atleta.' }}</div>
                </ar-panel-card>

                <ar-panel-card title="Clima registrado" [kicker]="slotLabel(s)">
                  @if (s.weather?.precipitationMm != null) {
                    <div class="reading">
                      <div class="wx-icon-tile"><ar-wx-icon name="rain" [size]="22" /></div>
                      <div>
                        <div class="reading-value">{{ mm(s.weather!.precipitationMm) }} mm/h</div>
                        <div class="reading-sub" [class.rained]="rained(s)">
                          {{ intensity(s.weather!.precipitationMm) }}{{ s.weather!.probability != null ? ' · ' + s.weather!.probability + '% no período' : '' }}
                        </div>
                      </div>
                    </div>
                    <p class="fine reading-note">
                      Previsão/medição Open-Meteo para a hora da reserva{{ s.weather!.fetchedAt ? ', consultada às ' + clock(s.weather!.fetchedAt) : '' }}.
                    </p>
                  } @else {
                    <p class="state-text no-reading">Sem medição para este horário.</p>
                  }
                </ar-panel-card>

                @if (s.status === 'pending') {
                  <ar-panel-card title="O que acontece ao aprovar">
                    <div class="wx-lines">
                      <div class="wx-line"><span>Reserva</span><span class="v">Liberada sem custo</span></div>
                      <div class="wx-line"><span>O atleta escolhe</span><span class="v strong">{{ policy().allowReschedule ? 'Remarcar ou crédito' : 'Crédito' }}</span></div>
                      <div class="wx-line"><span>Sem resposta em 24h</span><span class="v">Crédito automático</span></div>
                      <div class="wx-line"><span>Valor pago</span><span class="v strong">{{ formatBRL(s.paidReais) }}</span></div>
                    </div>
                  </ar-panel-card>

                  @if (decideError(); as err) {
                    <div class="error-banner" role="alert">{{ err }}</div>
                  }
                  <div class="decide">
                    <button type="button" class="reject-btn" [disabled]="readOnly() || deciding() != null || bulkRunning()" (click)="openReject(s)">Recusar</button>
                    <button
                      type="button"
                      class="ar-mini-btn ar-mini-btn-primary approve-btn"
                      [disabled]="readOnly() || deciding() != null || bulkRunning()"
                      (click)="approve(s)"
                    >
                      {{ deciding() === s.id ? 'Aprovando…' : 'Aprovar e liberar' }}
                    </button>
                  </div>
                } @else {
                  <ar-panel-card title="Decisão">
                    <div class="wx-lines">
                      <div class="wx-line">
                        <span>Situação</span>
                        <span class="v strong">{{ s.autoApproved && s.status === 'approved' ? 'Aprovada automaticamente' : statusPill[s.status].label }}</span>
                      </div>
                      @if (s.decidedAt) {
                        <div class="wx-line"><span>Quando</span><span class="v">{{ relative(s.decidedAt) }}</span></div>
                      }
                      @if (s.status === 'rejected') {
                        <div class="wx-line"><span>Motivo</span><span class="v">{{ s.rejectReason ?? '—' }}</span></div>
                      }
                    </div>
                  </ar-panel-card>
                }
              } @else if (!loading()) {
                <ar-panel-card pad="lg">
                  <p class="state-text">Selecione um pedido para ver os detalhes.</p>
                </ar-panel-card>
              }
            </div>
          </div>
        }
      </div>

      @if (rejectTarget(); as target) {
        <ar-modal (close)="closeReject()">
          <h2 class="modal-title">Recusar o pedido?</h2>
          <p class="modal-body">{{ target.athleteName }} · {{ ref(target) }}. A reserva continua de pé e o atleta é avisado.</p>
          <div class="field-label">Motivo (opcional)</div>
          <textarea
            class="input-box reject-reason"
            maxlength="200"
            placeholder="Ex.: a quadra é coberta / não choveu no horário"
            [value]="rejectReason()"
            (input)="rejectReason.set($any($event.target).value)"
          ></textarea>
          @if (decideError(); as err) {
            <div class="error-banner modal-error" role="alert">{{ err }}</div>
          }
          <div class="modal-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="deciding() != null" (click)="closeReject()">Voltar</button>
            <button type="button" class="reject-btn confirm-reject" [disabled]="deciding() != null" (click)="confirmReject()">
              {{ deciding() === target.id ? 'Recusando…' : 'Recusar pedido' }}
            </button>
          </div>
        </ar-modal>
      }

      @if (bulkOpen()) {
        <ar-modal (close)="closeBulk()">
          <h2 class="modal-title">{{ bulkTargets().length === 1 ? 'Aprovar 1 pedido?' : 'Aprovar ' + bulkTargets().length + ' pedidos?' }}</h2>
          <p class="modal-body">
            Todos os pendentes com chuva registrada de 2 mm/h ou mais. Cada reserva é liberada e o atleta escolhe remarcar ou crédito.
          </p>
          @if (bulkProgress(); as p) {
            <p class="fine bulk-progress" role="status">{{ p }}</p>
          }
          <div class="modal-actions">
            <button type="button" class="ar-ghost-btn" [disabled]="bulkRunning()" (click)="closeBulk()">Voltar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary confirm-bulk" [disabled]="bulkRunning()" (click)="approveAllWithRain()">
              {{ bulkRunning() ? 'Aprovando…' : 'Aprovar todas' }}
            </button>
          </div>
        </ar-modal>
      }
    </ar-panel-shell>
  `,
  styles: `
    .bulk-count {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-orange-500);
    }

    .list-card {
      min-width: 0;
    }

    .tabs {
      display: flex;
      gap: 4px;
      padding-bottom: 12px;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--nx-line);
      flex-wrap: wrap;
    }

    .tab {
      height: 30px;
      padding: 0 12px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .tab.active {
      background: var(--nx-surface-2);
      color: var(--nx-text);
    }

    .tab-count {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }

    .tab.active .tab-count {
      color: var(--nx-orange-500);
    }

    .list-state {
      padding: 14px 0 4px;
    }

    /* Ver .affected-table no Modo chuva: largura mínima fixa em vez do max-content global. */
    .req-table {
      min-width: 600px;
    }

    .req-grid {
      grid-template-columns: minmax(160px, 1.3fr) minmax(170px, 1.3fr) 90px minmax(120px, 1fr) 20px;
      padding-left: 10px;
      padding-right: 10px;
    }

    .table-head.req-grid {
      padding-top: 12px;
    }

    .req-row {
      width: 100%;
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--nx-line);
      text-align: left;
      cursor: pointer;
      font: inherit;
      color: inherit;
      padding-top: 12px;
      padding-bottom: 12px;
    }

    .req-row:hover {
      background: var(--nx-surface-1);
    }

    .req-row.selected {
      background: rgba(255, 106, 26, 0.05);
      box-shadow: inset 2px 0 0 var(--nx-orange-500);
    }

    .who-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .who-sub {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .rain-cell {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      font-family: var(--nx-font-mono);
      font-size: 12px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }

    .rain-cell.rained {
      color: var(--wx-blue);
    }

    .no-data {
      font-weight: 500;
    }

    .chevron {
      color: var(--nx-text-dim);
      justify-self: end;
    }

    .detail-head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .detail-name {
      flex: 1;
      min-width: 0;
    }

    .detail-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
      color: var(--nx-text);
    }

    .detail-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .note {
      margin-top: 14px;
      padding: 12px;
      border-radius: 10px;
      background: var(--nx-surface-1);
      font-size: 12.5px;
      color: var(--nx-text-mute);
      line-height: 1.5;
    }

    .note.empty {
      color: var(--nx-text-dim);
    }

    .reading {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .reading-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      color: var(--nx-text);
    }

    .reading-sub {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--nx-text-dim);
    }

    .reading-sub.rained {
      color: var(--wx-blue);
    }

    .reading-note {
      margin-top: 10px;
    }

    .decide {
      display: grid;
      grid-template-columns: 1fr 1.4fr;
      gap: 8px;
    }

    .decide .approve-btn {
      height: 44px;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
    }

    .reject-btn {
      height: 44px;
      padding: 0 16px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid rgba(255, 59, 48, 0.35);
      color: var(--nx-live);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }

    .reject-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .modal-error {
      margin: 12px 0 0;
    }

    .reject-reason {
      margin-bottom: 16px;
    }

    .bulk-progress {
      margin-bottom: 14px;
    }
  `,
})
export class PanelWeatherRequestsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly tabs = WEATHER_REQUEST_TABS;
  protected readonly statusPill = WEATHER_REQUEST_STATUS_PILL;
  protected readonly formatBRL = formatBRL;
  protected readonly mm = formatMm;
  protected readonly intensity = rainIntensityLabel;
  protected readonly clock = clockLabel;
  protected readonly code = displayBookingCode;

  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly policy = computed(() => weatherPolicyFromArenaDoc(this.arenaContext.arenaDocData()));

  protected readonly requests = signal<WeatherRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly now = signal(new Date());

  protected readonly tab = signal<WeatherRequestTab>('pending');
  private readonly selectedId = signal<string | null>(null);
  protected readonly counts = computed(() => weatherRequestTabCounts(this.requests()));
  protected readonly tabList = computed(() => weatherRequestsForTab(this.requests(), this.tab()));
  protected readonly selected = computed<WeatherRequest | null>(() => {
    const list = this.tabList();
    return list.find((r) => r.id === this.selectedId()) ?? list[0] ?? null;
  });
  protected readonly bulkTargets = computed(() => pendingWithRecordedRain(this.requests()));
  protected readonly emptyText = computed(() => {
    switch (this.tab()) {
      case 'pending':
        return 'Nenhum pedido esperando decisão.';
      case 'approved':
        return 'Nenhum pedido aprovado ainda.';
      case 'rejected':
        return 'Nenhum pedido recusado.';
    }
  });

  protected readonly deciding = signal<string | null>(null);
  protected readonly decideError = signal<string | null>(null);
  protected readonly rejectTarget = signal<WeatherRequest | null>(null);
  protected readonly rejectReason = signal('');
  protected readonly bulkOpen = signal(false);
  protected readonly bulkRunning = signal(false);
  protected readonly bulkProgress = signal<string | null>(null);

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(tick));

    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      this.loading.set(true);
      const unsub = watchWeatherRequests(
        arenaFirestore(),
        arenaId,
        (requests) => {
          this.requests.set(requests);
          this.loading.set(false);
          this.error.set(null);
        },
        (message) => {
          this.error.set(message);
          this.loading.set(false);
        },
      );
      onCleanup(() => unsub());
    });
  }

  protected relative(date: Date | null): string {
    return relativeTimeLabel(date, this.now());
  }

  protected ref(r: WeatherRequest): string {
    return bookingRefLabel(r.courtName, r.date, r.startTime);
  }

  protected slotLabel(r: WeatherRequest): string {
    return `${shortDateLabel(r.date)} · ${r.startTime}–${r.endTime}`;
  }

  protected rained(r: WeatherRequest): boolean {
    return hasRecordedRain(r);
  }

  protected setTab(tab: WeatherRequestTab): void {
    this.tab.set(tab);
    this.selectedId.set(null);
    this.decideError.set(null);
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.decideError.set(null);
  }

  protected async approve(r: WeatherRequest): Promise<void> {
    if (this.readOnly() || this.deciding() != null) return;
    const ok = await this.decide(r, true);
    if (ok) {
      this.notice.set(`Pedido de ${r.athleteName} aprovado. A reserva foi liberada e o atleta foi avisado.`);
      this.revealBanner();
    }
  }

  protected openReject(r: WeatherRequest): void {
    this.decideError.set(null);
    this.rejectReason.set('');
    this.rejectTarget.set(r);
  }

  protected closeReject(): void {
    if (this.deciding() != null) return;
    this.rejectTarget.set(null);
  }

  protected async confirmReject(): Promise<void> {
    const target = this.rejectTarget();
    if (!target || this.readOnly() || this.deciding() != null) return;
    const ok = await this.decide(target, false, this.rejectReason().trim());
    if (ok) {
      this.rejectTarget.set(null);
      this.notice.set(`Pedido de ${target.athleteName} recusado. O atleta foi avisado.`);
      this.revealBanner();
    }
  }

  protected openBulk(): void {
    if (this.bulkTargets().length === 0) return;
    this.bulkProgress.set(null);
    this.bulkOpen.set(true);
  }

  protected closeBulk(): void {
    if (this.bulkRunning()) return;
    this.bulkOpen.set(false);
  }

  /** Um por um: cada aprovação é uma transação própria no servidor (libera a reserva e avisa). */
  protected async approveAllWithRain(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    const targets = [...this.bulkTargets()];
    if (!arenaId || this.readOnly() || this.bulkRunning() || targets.length === 0) return;
    this.bulkRunning.set(true);
    this.notice.set(null);
    const failed: string[] = [];
    let lastError: string | null = null;
    for (const [i, r] of targets.entries()) {
      this.bulkProgress.set(`Aprovando ${i + 1} de ${targets.length}…`);
      try {
        await decideArenaWeatherRequest(arenaFunctions(), { arenaId, bookingId: r.bookingId, approve: true });
      } catch (err) {
        failed.push(r.athleteName);
        lastError = err instanceof Error ? err.message : null;
      }
    }
    this.bulkRunning.set(false);
    this.bulkOpen.set(false);
    this.bulkProgress.set(null);
    const approved = targets.length - failed.length;
    if (approved > 0) this.notice.set(approved === 1 ? '1 pedido aprovado.' : `${approved} pedidos aprovados.`);
    if (failed.length > 0) {
      this.error.set(`Não foi possível aprovar: ${failed.join(', ')}.${lastError ? ' ' + lastError : ''}`);
    }
    this.revealBanner();
  }

  /** O aviso fica no topo; no celular quem decidiu está lá embaixo, nos botões do detalhe.
   *  `nearest` não mexe quando ele já está à vista (desktop). */
  private revealBanner(): void {
    setTimeout(() => {
      const root = this.host.nativeElement as HTMLElement;
      root.querySelector('.error-banner, .notice')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  private async decide(r: WeatherRequest, approve: boolean, reason?: string): Promise<boolean> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return false;
    this.deciding.set(r.id);
    this.decideError.set(null);
    this.notice.set(null);
    try {
      await decideArenaWeatherRequest(arenaFunctions(), {
        arenaId,
        bookingId: r.bookingId,
        approve,
        ...(reason ? { reason } : {}),
      });
      return true;
    } catch (err) {
      this.decideError.set(err instanceof Error ? err.message : 'Não foi possível concluir a decisão.');
      return false;
    } finally {
      this.deciding.set(null);
    }
  }
}
