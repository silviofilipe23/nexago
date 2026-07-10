import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { DrawerComponent } from '../ui/drawer.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';

type BookingStatus = 'concluida' | 'no_show' | 'cancelada';

interface RankedClient {
  id: string;
  name: string;
  initials: string;
  vip: boolean;
  games: number;
  spend: number;
  attendance: number;
  memberSince: string;
}

interface BookingHistoryItem {
  date: string;
  court: string;
  time: string;
  status: BookingStatus;
  price: number | null;
}

const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  concluida: 'Concluída',
  no_show: 'No-show',
  cancelada: 'Cancelada',
};

const BOOKING_STATUS_TONE: Record<BookingStatus, PillTone> = {
  concluida: 'green',
  no_show: 'yellow',
  cancelada: 'red',
};

const CLIENTS: RankedClient[] = [
  { id: 'c1', name: 'Marcelo Antunes', initials: 'MA', vip: true, games: 21, spend: 3180, attendance: 92, memberSince: 'jan/2025' },
  { id: 'c2', name: 'Juliana Prado', initials: 'JP', vip: true, games: 19, spend: 2740, attendance: 88, memberSince: 'fev/2025' },
  { id: 'c3', name: 'Thiago Nogueira', initials: 'TN', vip: false, games: 18, spend: 2460, attendance: 75, memberSince: 'jan/2025' },
  { id: 'c4', name: 'Camila Duarte', initials: 'CD', vip: false, games: 16, spend: 2120, attendance: 80, memberSince: 'mar/2025' },
  { id: 'c5', name: 'Enzo Ribeiro', initials: 'ER', vip: false, games: 14, spend: 1980, attendance: 78, memberSince: 'mar/2025' },
  { id: 'c6', name: 'Bruna Lima', initials: 'BL', vip: false, games: 13, spend: 1850, attendance: 70, memberSince: 'abr/2025' },
  { id: 'c7', name: 'Ana Beatriz', initials: 'AB', vip: false, games: 11, spend: 1520, attendance: 74, memberSince: 'abr/2025' },
  { id: 'c8', name: 'Lucas Prado', initials: 'LP', vip: false, games: 9, spend: 1240, attendance: 68, memberSince: 'mai/2025' },
  { id: 'c9', name: 'Gustavo Melo', initials: 'GM', vip: false, games: 8, spend: 980, attendance: 65, memberSince: 'mai/2025' },
  { id: 'c10', name: 'Larissa Cardoso', initials: 'LC', vip: false, games: 6, spend: 780, attendance: 60, memberSince: 'jun/2025' },
];

const THIAGO_HISTORY: BookingHistoryItem[] = [
  { date: '09/07', court: 'Quadra 1', time: '18:00–19:00', status: 'concluida', price: 137 },
  { date: '02/07', court: 'Quadra 2', time: '19:00–20:00', status: 'concluida', price: 137 },
  { date: '25/06', court: 'Quadra 3', time: '20:00–21:00', status: 'no_show', price: 137 },
  { date: '18/06', court: 'Quadra 1', time: '18:00–19:00', status: 'concluida', price: 137 },
  { date: '11/06', court: 'Quadra 2', time: '19:00–20:00', status: 'concluida', price: 137 },
  { date: '04/06', court: 'Quadra 3', time: '20:00–21:00', status: 'cancelada', price: null },
  { date: '28/05', court: 'Quadra 1', time: '18:00–19:00', status: 'concluida', price: 137 },
  { date: '21/05', court: 'Quadra 2', time: '19:00–20:00', status: 'concluida', price: 137 },
];

const HISTORY_COURTS = ['Quadra 1', 'Quadra 2', 'Quadra 3'];
const HISTORY_TIMES = ['18:00–19:00', '19:00–20:00', '20:00–21:00'];
const HISTORY_ANCHOR = new Date(2026, 6, 9);

function formatDaysBefore(daysBefore: number): string {
  const d = new Date(HISTORY_ANCHOR);
  d.setDate(d.getDate() - daysBefore);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildGenericHistory(client: RankedClient): BookingHistoryItem[] {
  const price = client.games > 0 ? Math.round(client.spend / client.games) : 0;
  const count = Math.min(6, client.games);
  return Array.from({ length: count }, (_, i) => ({
    date: formatDaysBefore(i * 7),
    court: HISTORY_COURTS[i % HISTORY_COURTS.length],
    time: HISTORY_TIMES[i % HISTORY_TIMES.length],
    status: 'concluida' as const,
    price,
  }));
}

function formatBRL(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0 });
}

/** Tela Ranking de clientes do painel (protótipo ArRankingScreen): pódio + tabela por pontuação, com painel de histórico do atleta. */
@Component({
  selector: 'ar-panel-ranking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, DrawerComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Ranking de clientes" [subtitle]="arenaName() + ' · frequência de jogos + gasto total'">
      </ar-page-header>

      <div class="body">
        <div class="kicker-line">{{ clients().length }} clientes rankeados</div>

        <ar-panel-card class="podium-card">
          <div class="podium-col">
            <div class="podium-avatar">
              {{ second().initials }}
              @if (second().vip) {
                <span class="podium-star"><ar-icon name="star" [size]="11" /></span>
              }
            </div>
            <div class="podium-name">{{ second().name }}</div>
            <div class="podium-meta">{{ second().games }} jogos · {{ formatBRL(second().spend) }}</div>
            <div class="podium-block">#2</div>
          </div>

          <div class="podium-col first">
            <div class="podium-avatar">
              {{ first().initials }}
              @if (first().vip) {
                <span class="podium-star"><ar-icon name="star" [size]="11" /></span>
              }
              <span class="podium-rank-badge">1</span>
            </div>
            <div class="podium-name">{{ first().name }}</div>
            <div class="podium-meta">{{ first().games }} jogos · {{ formatBRL(first().spend) }}</div>
            <div class="podium-block">#1</div>
          </div>
        </ar-panel-card>

        <ar-panel-card kicker="Ordenado por pontuação · mês" title="Todos os clientes" class="table-card">
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
                  @if (c.vip) {
                    <ar-pill tone="orange">VIP</ar-pill>
                  }
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
      </div>

      @if (selectedClient(); as c) {
        <ar-drawer (close)="select(null)">
          <div class="drawer-head">
            <div class="drawer-avatar">{{ c.initials }}</div>
            <div class="drawer-identity">
              <div class="drawer-name">{{ c.name }}</div>
              <div class="drawer-meta">Cliente desde {{ c.memberSince }} · {{ arenaName() }}</div>
            </div>
            <button type="button" class="drawer-close" (click)="select(null)" aria-label="Fechar">×</button>
          </div>

          <div class="drawer-actions">
            <button type="button" class="ar-mini-btn ar-mini-btn-primary">
              <ar-icon name="mail" [size]="14" />
              Mensagem
            </button>
            <button type="button" class="ar-mini-btn" (click)="toggleVip(c.id)">
              <ar-icon name="star" [size]="14" />
              {{ c.vip ? 'Remover VIP' : 'Marcar VIP' }}
            </button>
          </div>

          <div class="drawer-stats">
            <div class="stat">
              <div class="stat-label">Jogos totais</div>
              <div class="stat-value">{{ c.games }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Gasto total</div>
              <div class="stat-value">{{ formatBRL(c.spend) }}</div>
            </div>
            <div class="stat">
              <div class="stat-label">Comparecimento</div>
              <div class="stat-value">{{ c.attendance }}%</div>
            </div>
          </div>

          <div class="drawer-kicker">Histórico de agendamentos nesta arena</div>
          <div class="history-list">
            @for (h of selectedHistory(); track h.date + h.court) {
              <div class="history-row">
                <div class="history-date">{{ h.date }}</div>
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
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: end;
      padding: 32px 40px 0;
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

    .podium-star {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      display: grid;
      place-items: center;
      border: 2px solid var(--nx-bg);
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

    .drawer-actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    .drawer-actions .ar-mini-btn {
      flex: 1;
      justify-content: center;
      height: 40px;
    }

    .drawer-stats {
      display: flex;
      margin-top: 24px;
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
      .podium-card {
        padding: 24px 16px 0;
      }
    }
  `,
})
export class PanelRankingComponent {
  private readonly auth = inject(AuthService);

  protected readonly formatBRL = formatBRL;
  protected readonly statusLabel = BOOKING_STATUS_LABEL;
  protected readonly statusTone = BOOKING_STATUS_TONE;

  protected readonly clients = signal<RankedClient[]>(CLIENTS);
  protected readonly selectedId = signal<string | null>(null);

  private readonly maxGames = Math.max(...CLIENTS.map((c) => c.games));
  private readonly maxSpend = Math.max(...CLIENTS.map((c) => c.spend));

  protected readonly first = computed(() => this.clients()[0]);
  protected readonly second = computed(() => this.clients()[1]);

  protected readonly selectedClient = computed(() => this.clients().find((c) => c.id === this.selectedId()) ?? null);

  protected readonly selectedHistory = computed(() => {
    const c = this.selectedClient();
    if (!c) {
      return [];
    }
    return c.id === 'c3' ? THIAGO_HISTORY : buildGenericHistory(c);
  });

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected scoreOf(c: RankedClient): number {
    return Math.round(((c.games / this.maxGames + c.spend / this.maxSpend) / 2) * 100);
  }

  protected select(id: string | null): void {
    this.selectedId.set(id);
  }

  protected toggleVip(id: string): void {
    this.clients.update((current) => current.map((c) => (c.id === id ? { ...c, vip: !c.vip } : c)));
  }
}
