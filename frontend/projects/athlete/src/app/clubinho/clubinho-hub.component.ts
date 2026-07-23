import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import {
  clubSpotsLeft,
  fetchDiscoverClubSessions,
  fetchMyClubParticipations,
  type ClubSession,
  type MyClubParticipation,
} from '../data/arena-clubs-repository';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Ordem visual dos chips (Seg→Dom, como no design); índice = getDay(). */
const WEEK_CHIPS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const DAY_BY_GETDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

function weekdayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  return DAY_BY_GETDAY[new Date(y, m - 1, d).getDay()] ?? '';
}

function shortDate(dateKey: string): string {
  const parts = dateKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateKey;
}

function todayKey(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Hub Clubinho do atleta: "Meus" (minhas inscrições futuras, com status do pagamento)
 *  e "Descobrir" (sessões abertas de todas as arenas, uma por turma). Espelha o
 *  `AtClubinhoScreen` do design, adaptado ao modelo por sessão de `arenaClubSessions`. */
@Component({
  selector: 'app-clubinho-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <div class="ch-body">
        <div class="ch-header">
          <div>
            <h1 class="ch-title">Clubinho</h1>
            <p class="ch-subtitle">
              Turmas recorrentes das arenas — horário fixo, dia certo, sua vaga garantida
            </p>
          </div>
        </div>

        <div class="ch-tabs" role="tablist" aria-label="Seções do Clubinho">
          <button
            type="button"
            role="tab"
            class="ch-tab"
            [class.ch-tab--active]="tab() === 'meus'"
            [attr.aria-selected]="tab() === 'meus'"
            (click)="selectTab('meus')"
          >
            Meus
          </button>
          <button
            type="button"
            role="tab"
            class="ch-tab"
            [class.ch-tab--active]="tab() === 'descobrir'"
            [attr.aria-selected]="tab() === 'descobrir'"
            (click)="selectTab('descobrir')"
          >
            Descobrir
          </button>
        </div>

        @if (loading()) {
          <app-nx-page-loading title="Carregando Clubinho…" />
        } @else if (tab() === 'meus') {
          @if (mine().length === 0) {
            <div class="ch-empty">
              <p>Você ainda não faz parte de nenhum clubinho.</p>
              <button type="button" class="ch-btn ch-btn--primary" (click)="selectTab('descobrir')">
                Descobrir clubinhos
              </button>
            </div>
          } @else {
            <section class="ch-card ch-card--list">
              @for (p of mine(); track p.sessionId; let last = $last) {
                <div class="ch-row" [class.ch-row--last]="last">
                  <div class="ch-tile" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" /><path d="M16 4.5c1.8.3 3.2 1.9 3.2 3.7 0 1.9-1.4 3.4-3.2 3.7" /><path d="M17.5 14.3c2.3.5 4 2.5 4 5" /></svg>
                  </div>
                  <div class="ch-row-main">
                    <div class="ch-row-title">
                      <span class="ch-row-name">{{ p.clubName }}</span>
                      <span
                        class="ch-pill"
                        [class.ch-pill--green]="p.status === 'confirmed'"
                        [class.ch-pill--yellow]="p.status === 'pending_payment'"
                      >
                        {{ statusLabel(p) }}
                      </span>
                    </div>
                    <div class="ch-row-sub">{{ p.arenaName }}</div>
                  </div>
                  <div class="ch-days" aria-hidden="true">
                    @for (d of weekChips; track d) {
                      <span class="ch-day" [class.ch-day--on]="d === weekdayOf(p.date)">{{ d[0] }}</span>
                    }
                  </div>
                  <div class="ch-next">
                    <span class="ch-next-label">Próxima</span>
                    <span class="ch-next-value">
                      {{ weekdayOf(p.date) }} {{ shortDate(p.date) }} · {{ p.startTime }}
                    </span>
                  </div>
                  <div class="ch-price">{{ formatBRL(p.amountReais) }}</div>
                  <a class="ch-btn" [routerLink]="['/reservar', p.arenaId, 'clubinho', p.sessionId]">
                    Ver turma
                  </a>
                </div>
              }
            </section>
          }
        } @else {
          @if (discover().length === 0) {
            <div class="ch-empty">
              <p>Nenhuma sessão aberta no momento. As arenas publicam novas turmas toda semana.</p>
            </div>
          } @else {
            <div class="ch-grid">
              @for (s of discover(); track s.id) {
                <article class="ch-card ch-discover">
                  <div class="ch-discover-top">
                    <div class="ch-tile ch-tile--sm" aria-hidden="true">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.4 2.9-6 6.5-6s6.5 2.6 6.5 6" /><path d="M16 4.5c1.8.3 3.2 1.9 3.2 3.7 0 1.9-1.4 3.4-3.2 3.7" /><path d="M17.5 14.3c2.3.5 4 2.5 4 5" /></svg>
                    </div>
                    @if (mySessionIds().has(s.id)) {
                      <span class="ch-pill ch-pill--green">Inscrito</span>
                    } @else if (spotsLeft(s) > 0) {
                      <span class="ch-pill ch-pill--green">{{ spotsLeft(s) }} {{ spotsLeft(s) === 1 ? 'vaga' : 'vagas' }}</span>
                    } @else {
                      <span class="ch-pill">Lotado</span>
                    }
                  </div>
                  <div>
                    <div class="ch-discover-name">{{ s.clubName }}</div>
                    <div class="ch-row-sub">{{ s.arenaName }}</div>
                  </div>
                  <div class="ch-discover-when">
                    <div class="ch-days" aria-hidden="true">
                      @for (d of weekChips; track d) {
                        <span class="ch-day" [class.ch-day--on]="d === weekdayOf(s.date)">{{ d[0] }}</span>
                      }
                    </div>
                    <span class="ch-when">{{ shortDate(s.date) }} · {{ s.startTime }}–{{ s.endTime }}</span>
                  </div>
                  <div class="ch-discover-foot">
                    <div>
                      <div class="ch-next-label">Por sessão</div>
                      <div class="ch-discover-price">{{ formatBRL(s.priceReais) }}</div>
                    </div>
                    <a class="ch-btn ch-btn--primary" [routerLink]="['/reservar', s.arenaId, 'clubinho', s.id]">
                      Ver turma
                    </a>
                  </div>
                </article>
              }
            </div>
          }
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .ch-body {
      padding: 24px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .ch-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0 0 4px;
    }

    .ch-subtitle {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .ch-tabs {
      display: inline-flex;
      align-self: flex-start;
      gap: 2px;
      padding: 3px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
    }

    .ch-tab {
      height: 30px;
      padding: 0 16px;
      border-radius: 7px;
      border: none;
      cursor: pointer;
      background: transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
    }

    .ch-tab:hover {
      color: var(--nx-text-mute);
    }

    .ch-tab--active {
      background: var(--nx-surface-2);
      color: var(--nx-text);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
    }

    .ch-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 20px;
    }

    .ch-card--list {
      padding-block: 4px;
    }

    .ch-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--nx-line);
      flex-wrap: wrap;
    }

    .ch-row--last {
      border-bottom: none;
    }

    .ch-tile {
      width: 46px;
      height: 46px;
      border-radius: var(--nx-r-2);
      flex: none;
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }

    .ch-tile--sm {
      width: 42px;
      height: 42px;
    }

    .ch-row-main {
      flex: 1 1 220px;
      min-width: 0;
    }

    .ch-row-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .ch-row-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14.5px;
      color: var(--nx-text);
    }

    .ch-row-sub {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin-top: 3px;
    }

    .ch-pill {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 8px;
      border-radius: 99px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .ch-pill--green {
      background: rgba(48, 209, 88, 0.1);
      border-color: rgba(48, 209, 88, 0.35);
      color: var(--nx-win);
    }

    .ch-pill--yellow {
      background: rgba(255, 214, 10, 0.08);
      border-color: rgba(255, 214, 10, 0.35);
      color: var(--nx-pending);
    }

    .ch-days {
      display: flex;
      gap: 3px;
      flex: none;
    }

    .ch-day {
      width: 21px;
      height: 21px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 700;
      color: var(--nx-text-dim);
    }

    .ch-day--on {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.3);
      color: var(--nx-orange-500);
    }

    .ch-next {
      width: 148px;
      text-align: right;
      flex: none;
    }

    .ch-next-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .ch-next-value {
      display: block;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13px;
      color: var(--nx-text);
      margin-top: 2px;
    }

    .ch-price {
      width: 82px;
      text-align: right;
      flex: none;
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 13.5px;
      color: var(--nx-orange-500);
    }

    .ch-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12px;
      text-decoration: none;
      cursor: pointer;
      white-space: nowrap;
    }

    .ch-btn:hover {
      background: var(--nx-surface-2);
    }

    .ch-btn--primary {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #fff;
    }

    .ch-btn--primary:hover {
      background: var(--nx-orange-400);
      border-color: var(--nx-orange-400);
    }

    .ch-empty {
      padding: 60px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
    }

    .ch-empty p {
      font-size: 13.5px;
      color: var(--nx-text-dim);
      margin: 0;
      max-width: 420px;
    }

    .ch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .ch-discover {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }

    .ch-discover-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .ch-discover-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }

    .ch-discover-when {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px 10px;
      flex-wrap: wrap;
    }

    .ch-when {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
      white-space: nowrap;
    }

    .ch-discover-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      margin-top: auto;
    }

    .ch-discover-price {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 20px;
      color: var(--nx-text);
      margin-top: 2px;
    }

    @media (max-width: 900px) {
      .ch-body {
        padding: 18px 16px 32px;
      }

      .ch-next {
        text-align: left;
      }
    }

    @media (max-width: 760px) {
      .ch-grid {
        grid-template-columns: 1fr;
      }

      .ch-row .ch-days {
        display: none;
      }

      .ch-price {
        width: auto;
      }
    }
  `,
})
export class ClubinhoHubComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();

  protected readonly weekChips = WEEK_CHIPS;
  protected readonly weekdayOf = weekdayOf;
  protected readonly shortDate = shortDate;
  protected readonly formatBRL = formatBRL;
  protected readonly spotsLeft = clubSpotsLeft;

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  protected readonly tab = signal<'meus' | 'descobrir'>('meus');
  protected readonly loading = signal(true);
  protected readonly mine = signal<MyClubParticipation[]>([]);
  protected readonly discover = signal<ClubSession[]>([]);

  protected readonly mySessionIds = computed(() => new Set(this.mine().map((p) => p.sessionId)));

  /** Só troca a aba automaticamente enquanto o atleta não escolheu uma. */
  private tabTouched = false;
  private loadedUid: string | null = null;

  constructor() {
    effect(() => {
      if (!this.auth.authReady()) return;
      const uid = this.auth.user()?.uid;
      const db = this.firestore;
      if (!uid || !db) {
        // Sem usuário Firebase (ex.: bypass de dev) não há o que consultar — mostra vazio.
        this.loading.set(false);
        return;
      }
      if (uid === this.loadedUid) return;
      this.loadedUid = uid;
      void this.load(db, uid);
    });
  }

  protected selectTab(tab: 'meus' | 'descobrir'): void {
    this.tabTouched = true;
    this.tab.set(tab);
  }

  private async load(db: Firestore, uid: string): Promise<void> {
    this.loading.set(true);
    const [participations, sessions] = await Promise.all([
      fetchMyClubParticipations(db, uid, new Date()).catch(() => [] as MyClubParticipation[]),
      fetchDiscoverClubSessions(db, todayKey()).catch(() => [] as ClubSession[]),
    ]);

    const mine = participations.filter((p) => p.status === 'confirmed' || p.status === 'pending_payment');

    // Descobrir mostra UMA sessão por turma (a mais próxima) — o card representa o clubinho.
    const byClub = new Map<string, ClubSession>();
    for (const s of sessions) {
      const key = s.clubId || s.id;
      if (!byClub.has(key)) byClub.set(key, s);
    }

    this.mine.set(mine);
    this.discover.set([...byClub.values()]);
    if (!this.tabTouched && mine.length === 0) this.tab.set('descobrir');
    this.loading.set(false);
  }

  protected statusLabel(p: MyClubParticipation): string {
    if (p.status === 'pending_payment') return 'PIX pendente';
    return p.paymentMethod === 'onsite' ? 'Vaga garantida' : 'Pago';
  }
}
