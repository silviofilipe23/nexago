import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtBellComponent } from '../painel/at-bell.component';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { NxSpinnerComponent } from '../shared/loading/nx-spinner.component';
import {
  acceptFriendlyMatchSlot,
  cancelFriendlyMatch,
  checkInFriendlyMatch,
  declineFriendlyMatchSlot,
  fetchFriendlyMatchEnabled,
  fetchMyFriendlyMatches,
  type FriendlyMatch,
  type FriendlyMatchStatus,
} from '../data/friendly-matches-repository';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function createFunctions(): Functions | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFunctions(app);
}

const STATUS_LABEL: Record<FriendlyMatchStatus, string> = {
  filling: 'Formando turma',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não rolou',
  unfilled: 'Não completou',
  unknown: 'Em atualização',
};

const STATUS_CLASS: Record<FriendlyMatchStatus, string> = {
  filling: 'warning',
  confirmed: 'success',
  completed: 'neutral',
  cancelled: 'neutral',
  no_show: 'neutral',
  unfilled: 'neutral',
  unknown: 'neutral',
};

const WHEN = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Bora Jogar — jogos avulsos do modelo real (`friendlyMatches`, escrita só via callables).
 *  As rules só deixam ler jogos em que o atleta está envolvido, então a tela é a SUA agenda
 *  de jogos avulsos: convites pra responder, jogos confirmados (com check-in) e histórico.
 *  Criar/convidar segue pelo app por enquanto (o fluxo de convite usa a agenda de contatos). */
@Component({
  selector: 'app-bora-jogar',
  standalone: true,
  imports: [AtPanelShellComponent, AtBellComponent, NxPageLoadingComponent, NxSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <header class="bj-page-header">
        <div>
          <h1>Bora Jogar</h1>
          <div class="bj-page-header-sub">Seus jogos avulsos e convites</div>
        </div>
        <div class="bj-page-header-spacer"></div>
        <at-bell />
      </header>

      <div class="bj-body">
        @if (loading()) {
          <app-nx-page-loading title="Carregando seus jogos…" subtitle="Convites e partidas do Bora Jogar" />
        } @else if (!enabled()) {
          <div class="bj-empty">
            <strong>Bora Jogar ainda não está liberado por aqui.</strong><br />
            Assim que a feature for ativada, seus convites e jogos avulsos aparecem nesta tela.
          </div>
        } @else {
          @if (feedback(); as fb) {
            <div class="bj-banner" [class.bj-banner--ok]="fb.ok" role="status">{{ fb.message }}</div>
          }

          @if (pendingInvites().length > 0) {
            <h2 class="bj-section-title">Convites pra você</h2>
            <div class="bj-list">
              @for (m of pendingInvites(); track m.id) {
                <div class="bj-card bj-card--invite">
                  <div class="bj-card-main">
                    <div class="bj-card-title">{{ inviteTitle(m) }}</div>
                    <div class="bj-card-meta">{{ metaOf(m) }}</div>
                  </div>
                  <div class="bj-card-actions">
                    <button type="button" class="bj-btn bj-btn--primary" [disabled]="busyId() === m.id" (click)="accept(m)">
                      @if (busyId() === m.id) {
                        <app-nx-spinner [size]="12" tone="dark" />
                      }
                      {{ busyId() === m.id ? 'Aceitando…' : 'Aceitar' }}
                    </button>
                    <button type="button" class="bj-btn" [disabled]="busyId() === m.id" (click)="decline(m)">Recusar</button>
                  </div>
                </div>
              }
            </div>
          }

          <h2 class="bj-section-title">Meus jogos</h2>
          <div class="bj-list">
            @for (m of myMatches(); track m.id) {
              <div class="bj-card">
                <div class="bj-card-main">
                  <div class="bj-card-top">
                    <span class="bj-card-title">{{ inviteTitle(m) }}</span>
                    <span class="bj-pill" [class]="'bj-pill bj-pill--' + statusClass(m.status)">{{ statusLabel(m.status) }}</span>
                  </div>
                  <div class="bj-card-meta">{{ metaOf(m) }}</div>
                  <div class="bj-card-slots">{{ m.participantUids.length }}/{{ m.slotsTotal }} confirmados{{ m.pendingSlotUids.length > 0 ? ' · ' + m.pendingSlotUids.length + ' aguardando' : '' }}</div>
                </div>
                <div class="bj-card-actions">
                  @if (m.status === 'confirmed' && isParticipant(m)) {
                    <button type="button" class="bj-btn bj-btn--primary" [disabled]="busyId() === m.id" (click)="checkIn(m)">
                      @if (busyId() === m.id) {
                        <app-nx-spinner [size]="12" tone="dark" />
                      }
                      {{ busyId() === m.id ? 'Confirmando…' : 'Check-in' }}
                    </button>
                  }
                  @if (isOrganizer(m) && (m.status === 'filling' || m.status === 'confirmed')) {
                    <button type="button" class="bj-btn bj-btn--danger" [disabled]="busyId() === m.id" (click)="cancel(m)">Cancelar</button>
                  }
                </div>
              </div>
            } @empty {
              <div class="bj-empty">
                Nenhum jogo avulso ainda. Os convites do Bora Jogar são enviados pelo app nexaGO — quando chamarem você (ou você montar um jogo por lá), tudo aparece aqui.
              </div>
            }
          </div>
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .bj-page-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 28px;
      border-bottom: 1px solid var(--nx-line);

      @media (max-width: 640px) {
        padding: 16px;
      }
    }
    .bj-page-header h1 {
      margin: 0;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 21px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }
    .bj-page-header-sub {
      margin-top: 3px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .bj-page-header-spacer {
      flex: 1;
    }
    .bj-body {
      padding: 22px 28px 32px;
      max-width: 760px;
      display: flex;
      flex-direction: column;
      gap: 12px;

      @media (max-width: 640px) {
        padding: 16px 16px 32px;
      }
    }
    .bj-section-title {
      margin: 8px 0 0;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .bj-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bj-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px;
      border-radius: var(--nx-r-4);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);

      @media (max-width: 640px) {
        flex-direction: column;
        align-items: stretch;
      }
    }
    .bj-card--invite {
      border-color: rgba(255, 106, 26, 0.3);
      background: var(--nx-orange-tint);
    }
    .bj-card-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .bj-card-top {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 10px;
    }
    .bj-card-title {
      flex: 1;
      min-width: 0;
      overflow-wrap: break-word;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .bj-card-meta {
      font-family: var(--nx-font-ui);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }
    .bj-card-slots {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
    }
    .bj-card-actions {
      display: flex;
      gap: 8px;
      flex: none;

      @media (max-width: 640px) {
        width: 100%;
      }
    }
    .bj-btn {
      height: 32px;
      padding: 0 12px;
      border-radius: 9px;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;

      @media (max-width: 640px) {
        flex: 1;
        height: 44px;
      }
    }
    .bj-btn:hover:not(:disabled) {
      color: var(--nx-text);
    }
    .bj-btn--primary {
      background: var(--nx-orange-500);
      border-color: var(--nx-orange-500);
      color: #0a0a0a;
    }
    .bj-btn--danger {
      color: #ff453a;
    }
    .bj-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .bj-pill {
      height: 20px;
      padding: 0 8px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      flex: none;
      white-space: nowrap;
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .bj-pill--success {
      background: rgba(43, 209, 126, 0.14);
      color: var(--nx-win, #2bd17e);
    }
    .bj-pill--warning {
      background: rgba(244, 197, 67, 0.14);
      color: var(--nx-pending, #f4c543);
    }
    .bj-pill--neutral {
      background: var(--nx-surface-1);
      color: var(--nx-text-dim);
    }
    .bj-banner {
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(255, 69, 58, 0.1);
      border: 1px solid rgba(255, 69, 58, 0.3);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text);
    }
    .bj-banner--ok {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.3);
    }
    .bj-empty {
      padding: 28px 18px;
      border-radius: var(--nx-r-4);
      border: 1px dashed var(--nx-line-strong);
      font-family: var(--nx-font-ui);
      font-size: 13px;
      color: var(--nx-text-mute);
      text-align: center;
      line-height: 1.5;
    }
  `,
})
export class BoraJogarComponent {
  private readonly auth = inject(AuthService);
  private readonly firestore = createFirestore();
  private readonly functions: Functions | null = createFunctions();

  protected readonly loading = signal(true);
  protected readonly enabled = signal(false);
  protected readonly matches = signal<FriendlyMatch[]>([]);
  protected readonly busyId = signal<string | null>(null);
  protected readonly feedback = signal<{ ok: boolean; message: string } | null>(null);

  private readonly uid = computed(() => this.auth.user()?.uid ?? null);

  protected readonly pendingInvites = computed(() => {
    const uid = this.uid();
    if (!uid) return [];
    return this.matches().filter((m) => m.status === 'filling' && m.pendingSlotUids.includes(uid));
  });

  protected readonly myMatches = computed(() => {
    const uid = this.uid();
    if (!uid) return [];
    return this.matches().filter((m) => !(m.status === 'filling' && m.pendingSlotUids.includes(uid)));
  });

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const db = this.firestore;
    const uid = this.uid();
    if (!db || !uid) {
      this.loading.set(false);
      return;
    }
    try {
      const enabled = await fetchFriendlyMatchEnabled(db);
      this.enabled.set(enabled);
      if (enabled) {
        this.matches.set(await fetchMyFriendlyMatches(db, uid));
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async run(matchId: string, action: () => Promise<void>, okMessage: string): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(matchId);
    this.feedback.set(null);
    try {
      await action();
      this.feedback.set({ ok: true, message: okMessage });
      const db = this.firestore;
      const uid = this.uid();
      if (db && uid) this.matches.set(await fetchMyFriendlyMatches(db, uid));
    } catch (e) {
      this.feedback.set({ ok: false, message: (e as Error).message || 'A operação falhou. Tente de novo.' });
    } finally {
      this.busyId.set(null);
    }
  }

  protected accept(m: FriendlyMatch): void {
    if (!this.functions) return;
    void this.run(m.id, () => acceptFriendlyMatchSlot(this.functions!, m.id), 'Convite aceito — bora jogar!');
  }

  protected decline(m: FriendlyMatch): void {
    if (!this.functions) return;
    void this.run(m.id, () => declineFriendlyMatchSlot(this.functions!, m.id), 'Convite recusado.');
  }

  protected cancel(m: FriendlyMatch): void {
    if (!this.functions) return;
    if (!confirm('Cancelar este jogo? Todos os convidados serão avisados.')) return;
    void this.run(m.id, () => cancelFriendlyMatch(this.functions!, m.id), 'Jogo cancelado.');
  }

  protected checkIn(m: FriendlyMatch): void {
    if (!this.functions) return;
    void this.run(m.id, () => checkInFriendlyMatch(this.functions!, m.id), 'Check-in feito!');
  }

  protected isOrganizer(m: FriendlyMatch): boolean {
    return m.organizerUid === this.uid();
  }

  protected isParticipant(m: FriendlyMatch): boolean {
    const uid = this.uid();
    return uid != null && m.participantUids.includes(uid);
  }

  protected inviteTitle(m: FriendlyMatch): string {
    const who = this.isOrganizer(m) ? 'Seu jogo' : `Jogo de ${m.organizerName ?? 'um atleta'}`;
    return m.arenaName ? `${who} · ${m.arenaName}` : who;
  }

  protected metaOf(m: FriendlyMatch): string {
    const parts: string[] = [];
    if (m.scheduledAt) {
      const label = WHEN.format(m.scheduledAt).replace('.', '');
      parts.push(label.charAt(0).toUpperCase() + label.slice(1));
    }
    if (m.sport) parts.push(titleCase(m.sport));
    if (m.objective) parts.push(m.objective);
    return parts.join(' · ') || 'Detalhes a combinar';
  }

  protected statusLabel(status: FriendlyMatchStatus): string {
    return STATUS_LABEL[status];
  }

  protected statusClass(status: FriendlyMatchStatus): string {
    return STATUS_CLASS[status];
  }
}
