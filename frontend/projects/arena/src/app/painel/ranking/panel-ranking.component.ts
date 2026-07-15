import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { watchBookingsForArena } from '../bookings/bookings-repository';
import { DrawerComponent } from '../ui/drawer.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import type { ClientBookingStatus, RankedClient } from './ranked-client.model';
import { fetchRankedClients } from './ranked-clients-repository';

const BOOKING_STATUS_LABEL: Record<ClientBookingStatus, string> = {
  concluida: 'Concluída',
  no_show: 'No-show',
  cancelada: 'Cancelada',
  confirmada: 'Confirmada',
};

const BOOKING_STATUS_TONE: Record<ClientBookingStatus, PillTone> = {
  concluida: 'green',
  no_show: 'yellow',
  cancelada: 'red',
  confirmada: 'orange',
};

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
}

/** Tela Ranking de clientes do painel: pódio + tabela real, derivados de `arenaBookings`
 *  (`ranked-clients-repository.ts`). Sem "VIP" marcável nem "Mensagem" — nenhum dos dois tem
 *  lastro no schema (ver comentário no repositório). */
@Component({
  selector: 'ar-panel-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, DrawerComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Ranking de clientes" [subtitle]="arenaName() + ' · frequência de jogos + gasto total'" />

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando ranking…</p>
        } @else if (clients().length === 0) {
          <p class="state-text">Nenhuma reserva registrada ainda pra montar um ranking.</p>
        } @else {
          <div class="kicker-line">{{ clients().length }} clientes rankeados</div>

          @if (first(); as f) {
            <ar-panel-card class="podium-card" pad="lg">
              <div class="podium-row">
                @if (second(); as s) {
                  <div class="podium-col second">
                    <div class="podium-avatar">
                      {{ s.initials }}
                      <span class="podium-rank-badge rank-2">2</span>
                    </div>
                    <div class="podium-name">{{ s.name }}</div>
                    <div class="podium-meta">{{ s.games }} jogos · {{ formatBRL(s.spend) }}</div>
                    <div class="podium-block">#2</div>
                  </div>
                }

                <div class="podium-col first">
                  <div class="podium-avatar">
                    {{ f.initials }}
                    <span class="podium-rank-badge rank-1">1</span>
                  </div>
                  <div class="podium-name">{{ f.name }}</div>
                  <div class="podium-meta">{{ f.games }} jogos · {{ formatBRL(f.spend) }}</div>
                  <div class="podium-block">#1</div>
                </div>

                @if (third(); as t) {
                  <div class="podium-col third">
                    <div class="podium-avatar">
                      {{ t.initials }}
                      <span class="podium-rank-badge rank-3">3</span>
                    </div>
                    <div class="podium-name">{{ t.name }}</div>
                    <div class="podium-meta">{{ t.games }} jogos · {{ formatBRL(t.spend) }}</div>
                    <div class="podium-block">#3</div>
                  </div>
                }
              </div>
            </ar-panel-card>
          }

          <ar-panel-card kicker="Ordenado por jogos + gasto" title="Todos os clientes" class="table-card">
            <div class="table-head">
              <span>#</span>
              <span>Cliente</span>
              <span class="right">Jogos</span>
              <span class="right">Gasto total</span>
              <span>Pontuação</span>
            </div>
            <div class="table-list">
              @for (c of clients(); track c.id; let i = $index) {
                <div class="table-row" (click)="select(c.id)">
                  <div class="rank-num">{{ i + 1 }}</div>
                  <div class="client-cell">
                    <div class="avatar">{{ c.initials }}</div>
                    <div class="client-name">{{ c.name }}</div>
                  </div>
                  <div class="right cell-games">{{ c.games }}</div>
                  <div class="right cell-spend">{{ formatBRL(c.spend) }}</div>
                  <div class="score-track">
                    <div class="score-fill" [style.width.%]="scoreOf(c)"></div>
                  </div>
                </div>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (selectedClient(); as c) {
        <ar-drawer (close)="select(null)">
          <div class="drawer-head">
            <div class="drawer-avatar">{{ c.initials }}</div>
            <div class="drawer-identity">
              <div class="drawer-name">{{ c.name }}</div>
              <div class="drawer-meta">Cliente desde {{ c.memberSinceLabel }} · {{ arenaName() }}</div>
            </div>
            <button type="button" class="drawer-close" (click)="select(null)" aria-label="Fechar">×</button>
          </div>

          <div class="drawer-stats">
            <div class="stat">
              <div class="stat-label">Jogos concluídos</div>
              <div class="stat-value">{{ c.games }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Gasto total</div>
              <div class="stat-value">{{ formatBRL(c.spend) }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Comparecimento</div>
              <div class="stat-value">{{ c.attendance != null ? c.attendance + '%' : '—' }}</div>
            </div>
          </div>

          <div class="drawer-kicker">Histórico de agendamentos nesta arena</div>
          <div class="history-list">
            @for (h of c.history; track h.dateLabel + h.court + h.time) {
              <div class="history-row">
                <div class="history-date">{{ h.dateLabel }}</div>
                <div class="history-body">
                  <div class="history-court">{{ h.court }}</div>
                  <div class="history-time">{{ h.time }}</div>
                </div>
                <ar-pill [tone]="statusTone[h.status]">{{ statusLabel[h.status] }}</ar-pill>
                <div class="history-price">{{ h.price != null ? formatBRL(h.price) : '—' }}</div>
              </div>
            }
          </div>
        </ar-drawer>
      }
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .kicker-line {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .podium-card {
      flex: none;
    }

    .podium-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      align-items: end;
    }

    .podium-col {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .podium-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      position: relative;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      color: var(--nx-orange-500);
    }

    .podium-col.first .podium-avatar {
      width: 88px;
      height: 88px;
      font-size: 23px;
      box-shadow: 0 0 0 4px rgba(244, 197, 67, 0.3), 0 0 28px rgba(244, 197, 67, 0.35);
    }

    .podium-rank-badge {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: #f4c543;
      color: #1a1400;
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 12px;
      border: 2px solid var(--nx-bg);
    }

    .podium-rank-badge.rank-2 {
      background: #c7ccd4;
      color: #14161a;
    }

    .podium-rank-badge.rank-3 {
      background: #d99456;
      color: #241304;
    }

    .podium-name {
      margin-top: 14px;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
    }

    .podium-meta {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 3px;
    }

    .podium-block {
      width: 100%;
      margin-top: 18px;
      border-radius: var(--nx-r-3) var(--nx-r-3) 0 0;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-bottom: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 15px;
      color: var(--nx-text-dim);
      height: 64px;
      box-sizing: border-box;
    }

    .podium-col.first .podium-block {
      height: 104px;
      background: linear-gradient(180deg, rgba(244, 197, 67, 0.16), rgba(244, 197, 67, 0.04));
      border-color: rgba(244, 197, 67, 0.35);
      color: #f4c543;
      font-size: 17px;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 34px 2fr 80px 130px 1.4fr;
      gap: 14px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      padding: 13px 0;
      border-bottom: 1px solid var(--nx-line);
      cursor: pointer;
      border-radius: var(--nx-r-2);
      transition: background 140ms var(--nx-ease-out);
    }

    .table-row:hover {
      background: var(--nx-surface-1);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .rank-num {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text-dim);
    }

    .client-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .avatar {
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-orange-500);
    }

    .client-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-games,
    .cell-spend {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .right {
      text-align: right;
    }

    .score-track {
      height: 6px;
      border-radius: 3px;
      background: var(--nx-surface-1);
      overflow: hidden;
    }

    .score-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--nx-orange-500);
    }

    .drawer-head {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      position: relative;
    }

    .drawer-avatar {
      width: 52px;
      height: 52px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 16px;
      color: var(--nx-orange-500);
    }

    .drawer-identity {
      flex: 1;
      min-width: 0;
      padding-right: 28px;
    }

    .drawer-name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 18px;
      color: var(--nx-text);
    }

    .drawer-meta {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .drawer-close {
      position: absolute;
      top: 0;
      right: 0;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      display: grid;
      place-items: center;
    }

    .drawer-close:hover {
      color: var(--nx-text);
    }

    .drawer-stats {
      display: flex;
      margin-top: 20px;
      padding: 16px 0;
      border-top: 1px solid var(--nx-line);
      border-bottom: 1px solid var(--nx-line);
    }

    .stat {
      flex: 1;
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .stat-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
      margin-top: 6px;
    }

    .drawer-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin: 22px 0 4px;
    }

    .history-list {
      display: flex;
      flex-direction: column;
    }

    .history-row {
      display: grid;
      grid-template-columns: 40px 1fr auto auto;
      gap: 12px;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .history-row:last-child {
      border-bottom: none;
    }

    .history-date {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }

    .history-court {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
    }

    .history-time {
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 1px;
    }

    .history-price {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      text-align: right;
    }

    @media (max-width: 720px) {
      .podium-row {
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .podium-col.first {
        order: -1;
      }

      .podium-col.second {
        order: 0;
      }

      .podium-col.third {
        order: 1;
      }
    }
  `,
})
export class PanelRankingComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly destroyRef = inject(DestroyRef);
  private unsubscribe: Unsubscribe | null = null;

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = BOOKING_STATUS_LABEL;
  protected readonly statusTone = BOOKING_STATUS_TONE;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Arena');

  protected readonly clients = signal<RankedClient[]>([]);
  protected readonly loading = signal(true);
  protected readonly selectedId = signal<string | null>(null);

  private readonly maxGames = computed(() => Math.max(1, ...this.clients().map((c) => c.games)));
  private readonly maxSpend = computed(() => Math.max(1, ...this.clients().map((c) => c.spend)));

  protected readonly first = computed(() => this.clients()[0] ?? null);
  protected readonly second = computed(() => this.clients()[1] ?? null);
  protected readonly third = computed(() => this.clients()[2] ?? null);

  protected readonly selectedClient = computed(() => this.clients().find((c) => c.id === this.selectedId()) ?? null);

  constructor() {
    this.destroyRef.onDestroy(() => this.unsubscribe?.());
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubscribe?.();
      this.unsubscribe = null;
      if (!arenaId) return;
      this.loading.set(true);
      const db = arenaFirestore();
      this.unsubscribe = watchBookingsForArena(db, arenaId, (bookings) => {
        void fetchRankedClients(db, bookings).then((clients) => {
          this.clients.set(clients);
          this.loading.set(false);
        });
      });
    });
  }

  protected scoreOf(c: RankedClient): number {
    return Math.round(((c.games / this.maxGames() + c.spend / this.maxSpend()) / 2) * 100);
  }

  protected select(id: string | null): void {
    this.selectedId.set(id);
  }
}
