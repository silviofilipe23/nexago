import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  CLUB_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  clubScheduleLabel,
  formatFullDate,
  formatReais,
  spotsLeft,
  todayDateKey,
  type ArenaClub,
  type ArenaClubSession,
  type ClubSessionStatus,
} from './club.model';
import { createClubSession, fetchClub, fetchClubSessions, setClubStatus } from './clubs-repository';

const SESSION_TONE: Record<ClubSessionStatus, PillTone> = {
  scheduled: 'green',
  canceled: 'dim',
  completed: 'dim',
};

/** Detalhe do clubinho: próximas sessões (lista/vagas por data), sessão avulsa,
 *  pausar/reativar/arquivar. Cada sessão leva à lista de participantes ao vivo. */
@Component({
  selector: 'ar-panel-club-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent, ModalComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="club()?.name ?? 'Clubinho'" [subtitle]="subtitle()">
        @if (club(); as c) {
          @if (c.status === 'active') {
            <button type="button" class="ar-mini-btn" (click)="openSessionModal()">
              <ar-icon name="plus" [size]="14" />
              Sessão avulsa
            </button>
            <button type="button" class="ar-mini-btn" [disabled]="mutating()" (click)="changeStatus('paused')">Pausar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="editClub()">
              <ar-icon name="edit" [size]="14" />
              Editar
            </button>
          } @else if (c.status === 'paused') {
            <button type="button" class="ar-mini-btn" [disabled]="mutating()" (click)="changeStatus('archived')">Arquivar</button>
            <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="mutating()" (click)="changeStatus('active')">Reativar</button>
          }
        }
      </ar-page-header>

      <div class="body">
        @if (loading()) {
          <p class="state-text">Carregando clubinho…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else if (club(); as c) {
          @if (actionError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label">Recorrência</div>
              <div class="summary-strong">{{ scheduleLabel(c) }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label">Quadras</div>
              <div class="summary-strong">{{ c.courtNames.join(', ') || '—' }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Valor por atleta</div>
              <div class="summary-strong orange">{{ formatReais(c.priceReais) }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label">Status</div>
              <div class="summary-strong">{{ statusLabel[c.status] }}</div>
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="sessions().length + ' data(s)'" title="Próximas sessões" class="table-card">
            <div class="table-head">
              <span>Data</span>
              <span>Horário</span>
              <span>Lista</span>
              <span>Vagas restantes</span>
              <span>Status</span>
              <span></span>
            </div>
            <div class="table-list">
              @for (session of sessions(); track session.id) {
                <div class="table-row">
                  <div class="session-date">{{ formatFullDate(session.date) }}</div>
                  <div class="mono-cell">{{ session.startTime }}–{{ session.endTime }}</div>
                  <div class="mono-cell">{{ session.confirmedCount }}/{{ session.capacity }} confirmados</div>
                  <div class="mono-cell">{{ spotsLeft(session) }}</div>
                  <div><ar-pill [tone]="sessionTone[session.status]">{{ sessionStatusLabel[session.status] }}</ar-pill></div>
                  <div class="row-actions">
                    <button type="button" class="ar-mini-btn" (click)="openSession(session.id)">
                      Lista
                      <ar-icon name="chevron-right" [size]="13" />
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">
                  Nenhuma sessão futura. {{ c.weekday != null ? 'As sessões da semana são geradas automaticamente.' : 'Crie uma sessão avulsa para abrir a lista.' }}
                </p>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (sessionModalOpen()) {
        <ar-modal (close)="sessionModalOpen.set(false)">
          <p class="modal-title">Nova sessão avulsa</p>
          <p class="modal-text">
            A sessão usa a configuração atual do clubinho (quadras, vagas, valor) e bloqueia a
            agenda na data escolhida.
          </p>
          <div class="field-label">Data</div>
          <input type="date" class="input-box" [value]="newSessionDate()" (input)="newSessionDate.set($any($event.target).value)" />
          @if (modalError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" (click)="sessionModalOpen.set(false)">Cancelar</button>
            <button
              type="button"
              class="ar-mini-btn ar-mini-btn-primary"
              [disabled]="!newSessionDate() || mutating()"
              (click)="confirmCreateSession()"
            >
              {{ mutating() ? 'Criando…' : 'Criar sessão' }}
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
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .empty-text {
      margin: 12px 0;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .summary-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      flex: none;
    }

    .summary-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .summary-label.tone-orange {
      color: var(--nx-orange-500);
    }

    .summary-strong {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .summary-strong.orange {
      color: var(--nx-orange-500);
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 130px 130px 1fr 130px 110px 90px;
      gap: 12px;
      align-items: center;
    }

    .table-head {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--nx-line-strong);
      flex: none;
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
      padding: 14px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .session-date {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .mono-cell {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .row-actions {
      display: flex;
      justify-content: flex-end;
    }

    .modal-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0 0 8px;
    }

    .modal-text {
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      margin: 0 0 16px;
    }

    .modal-error {
      margin-top: 12px;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
      width: 100%;
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

    @media (max-width: 1180px) {
      .summary-row {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelClubDetailComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatReais = formatReais;
  protected readonly formatFullDate = formatFullDate;
  protected readonly spotsLeft = spotsLeft;
  protected readonly scheduleLabel = clubScheduleLabel;
  protected readonly statusLabel = CLUB_STATUS_LABEL;
  protected readonly sessionStatusLabel = SESSION_STATUS_LABEL;
  protected readonly sessionTone = SESSION_TONE;

  protected readonly club = signal<ArenaClub | null>(null);
  protected readonly sessions = signal<ArenaClubSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly mutating = signal(false);

  protected readonly sessionModalOpen = signal(false);
  protected readonly newSessionDate = signal('');
  protected readonly modalError = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const c = this.club();
    return c ? `${c.capacity} vagas por sessão · cancelamento até ${c.cancelWindowHours}h antes` : '';
  });

  private readonly clubId = this.route.snapshot.paramMap.get('clubId') ?? '';

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const db = arenaFirestore();
      const [club, sessions] = await Promise.all([
        fetchClub(db, this.clubId),
        fetchClubSessions(db, this.clubId, todayDateKey()),
      ]);
      if (!club) {
        this.loadError.set('Clubinho não encontrado.');
        return;
      }
      this.club.set(club);
      this.sessions.set(sessions);
    } catch {
      this.loadError.set('Não foi possível carregar o clubinho.');
    } finally {
      this.loading.set(false);
    }
  }

  protected editClub(): void {
    void this.router.navigate(['/painel/clubinho', this.clubId, 'editar']);
  }

  protected openSession(sessionId: string): void {
    void this.router.navigate(['/painel/clubinho', this.clubId, 'sessao', sessionId]);
  }

  protected async changeStatus(status: 'active' | 'paused' | 'archived'): Promise<void> {
    if (this.mutating()) return;
    this.mutating.set(true);
    this.actionError.set(null);
    try {
      await setClubStatus(arenaFunctions(), this.clubId, status);
      await this.load();
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível alterar o status.');
    } finally {
      this.mutating.set(false);
    }
  }

  protected openSessionModal(): void {
    this.modalError.set(null);
    this.newSessionDate.set('');
    this.sessionModalOpen.set(true);
  }

  protected async confirmCreateSession(): Promise<void> {
    const date = this.newSessionDate();
    if (!date || this.mutating()) return;
    this.mutating.set(true);
    this.modalError.set(null);
    try {
      const result = await createClubSession(arenaFunctions(), this.clubId, date);
      this.sessionModalOpen.set(false);
      this.openSession(result.sessionId);
    } catch (err) {
      this.modalError.set(err instanceof Error ? err.message : 'Não foi possível criar a sessão.');
    } finally {
      this.mutating.set(false);
    }
  }
}
