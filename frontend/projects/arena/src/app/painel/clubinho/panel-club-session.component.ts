import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { ModalComponent } from '../ui/modal.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  PARTICIPANT_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  formatFullDate,
  formatReais,
  spotsLeft,
  type ArenaClubSession,
  type ClubParticipant,
  type ClubParticipantStatus,
} from './club.model';
import {
  addClubParticipant,
  cancelClubSession,
  removeClubParticipant,
  searchAthletes,
  watchClubParticipants,
  watchClubSession,
  type AthleteSearchResult,
} from './clubs-repository';

const PARTICIPANT_TONE: Record<ClubParticipantStatus, PillTone> = {
  pending_payment: 'yellow',
  confirmed: 'green',
  expired: 'dim',
  canceled: 'dim',
  canceled_refunded: 'dim',
  canceled_by_arena_refunded: 'dim',
};

/** Lista de participantes da sessão AO VIVO (onSnapshot): quem pagou entra na hora, PIX
 *  pendente aparece como "Aguardando". Cancelar a sessão dispara estorno em massa. */
@Component({
  selector: 'ar-panel-club-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, ModalComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="headerTitle()" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn" (click)="goBack()">Voltar</button>
        @if (session()?.status === 'scheduled') {
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly()" (click)="openAddModal()">
            <ar-icon name="plus" [size]="14" />
            Adicionar atleta
          </button>
          <button type="button" class="ar-mini-btn danger" [disabled]="readOnly()" (click)="cancelModalOpen.set(true)">Cancelar sessão</button>
        }
      </ar-page-header>

      <div class="body">
        @if (loading()) {
          <p class="state-text">Carregando sessão…</p>
        } @else if (!session()) {
          <p class="state-text">Sessão não encontrada.</p>
        } @else if (session(); as s) {
          @if (actionError(); as err) {
            <div class="error-banner">{{ err }}</div>
          }
          @if (s.status === 'canceled') {
            <div class="canceled-banner">
              Sessão cancelada — os PIX dos confirmados foram estornados automaticamente.
            </div>
          }

          <div class="summary-row">
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Confirmados</div>
              <div class="summary-value">{{ s.confirmedCount }}<span class="summary-cap">/{{ s.capacity }}</span></div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label">Aguardando PIX</div>
              <div class="summary-value">{{ s.pendingCount }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label">Vagas restantes</div>
              <div class="summary-value">{{ spotsLeft(s) }}</div>
            </ar-panel-card>
            <ar-panel-card pad="sm" class="summary-card">
              <div class="summary-label tone-orange">Recebido online</div>
              <div class="summary-value small">{{ confirmedRevenue() }}</div>
              @if (onsiteCount() > 0) {
                <div class="summary-note">+ {{ onsiteCount() }} paga(m) na arena</div>
              }
            </ar-panel-card>
          </div>

          <ar-panel-card [kicker]="s.courtNames.join(', ')" title="Lista" class="table-card">
            <div class="table-list">
              @for (p of participants(); track p.id; let i = $index) {
                <div class="participant-row">
                  <div class="participant-pos">{{ i + 1 }}</div>
                  <div class="participant-avatar">
                    @if (p.athletePhotoUrl) {
                      <img [src]="p.athletePhotoUrl" alt="" />
                    } @else {
                      <span>{{ initialsOf(p.athleteName) }}</span>
                    }
                  </div>
                  <div class="participant-name">{{ p.athleteName }}</div>
                  <div class="participant-amount">{{ formatReais(p.amountReais) }}</div>
                  @if (p.refundStatus === 'failed') {
                    <ar-pill tone="red">Estorno falhou</ar-pill>
                  } @else if (p.status === 'confirmed' && p.paymentMethod === 'onsite') {
                    <ar-pill tone="yellow">Paga na arena</ar-pill>
                  } @else {
                    <ar-pill [tone]="participantTone[p.status]">{{ participantLabel[p.status] }}</ar-pill>
                  }
                  <div class="participant-remove">
                    @if (session()?.status === 'scheduled' && (p.status === 'confirmed' || p.status === 'pending_payment')) {
                      <button
                        type="button"
                        class="remove-btn"
                        title="Remover da lista"
                        [disabled]="readOnly()"
                        (click)="askRemove(p)"
                      >×</button>
                    }
                  </div>
                </div>
              } @empty {
                <p class="state-text empty-text">Ninguém na lista ainda — compartilhe o clubinho com seus atletas.</p>
              }
            </div>
          </ar-panel-card>
        }
      </div>

      @if (addModalOpen()) {
        <ar-modal (close)="addModalOpen.set(false)">
          <p class="modal-title">Adicionar atleta à lista</p>
          <p class="modal-text">
            Entra direto como confirmado, com pagamento acertado na arena (sem PIX).
          </p>

          <div class="field-label">Buscar atleta da plataforma</div>
          <input
            type="text"
            class="input-box"
            placeholder="Nome do atleta…"
            [value]="searchTerm()"
            (input)="onSearchInput($any($event.target).value)"
          />
          @if (searching()) {
            <p class="modal-hint">Buscando…</p>
          } @else if (searchResults().length > 0) {
            <div class="search-results">
              @for (r of searchResults(); track r.id) {
                <button type="button" class="search-result" [disabled]="adding() || readOnly()" (click)="addAthlete(r)">
                  <span class="participant-avatar small">
                    @if (r.photoUrl) {
                      <img [src]="r.photoUrl" alt="" />
                    } @else {
                      <span>{{ initialsOf(r.name) }}</span>
                    }
                  </span>
                  <span class="search-result-name">{{ r.name }}</span>
                  <span class="search-result-add">Adicionar</span>
                </button>
              }
            </div>
          } @else if (searchTerm().trim().length >= 2) {
            <p class="modal-hint">Nenhum atleta encontrado com esse nome.</p>
          }

          <div class="modal-divider">ou sem conta na plataforma</div>

          <div class="field-label">Nome do convidado</div>
          <div class="guest-row">
            <input
              type="text"
              class="input-box"
              placeholder="Ex.: Zé (grupo do WhatsApp)"
              [value]="guestName()"
              (input)="guestName.set($any($event.target).value)"
            />
            <button
              type="button"
              class="ar-mini-btn ar-mini-btn-primary"
              [disabled]="guestName().trim().length < 2 || adding() || readOnly()"
              (click)="addGuest()"
            >
              {{ adding() ? 'Adicionando…' : 'Adicionar' }}
            </button>
          </div>

          @if (addError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }
        </ar-modal>
      }

      @if (removeTarget(); as target) {
        <ar-modal (close)="removeTarget.set(null)">
          <p class="modal-title">Remover {{ target.athleteName }} da lista?</p>
          <p class="modal-text">
            @if (target.status === 'confirmed' && target.paymentMethod === 'pix') {
              O PIX pago será <strong>estornado automaticamente</strong> e o valor debitado da
              carteira da arena. A vaga reabre.
            } @else {
              A vaga reabre na hora — não há pagamento online envolvido.
            }
          </p>
          @if (addError(); as err) {
            <div class="error-banner modal-error">{{ err }}</div>
          }
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" (click)="removeTarget.set(null)">Voltar</button>
            <button type="button" class="ar-mini-btn danger" [disabled]="removing() || readOnly()" (click)="confirmRemove()">
              {{ removing() ? 'Removendo…' : 'Remover da lista' }}
            </button>
          </div>
        </ar-modal>
      }

      @if (cancelModalOpen()) {
        <ar-modal (close)="cancelModalOpen.set(false)">
          <p class="modal-title">Cancelar esta sessão?</p>
          <p class="modal-text">
            Todos os {{ session()?.confirmedCount ?? 0 }} atletas confirmados receberão o
            <strong>estorno automático do PIX</strong>, e o valor será debitado da carteira da
            arena. As quadras voltam a ficar livres na agenda. Essa ação não pode ser desfeita.
          </p>
          <div class="field-label">Motivo (opcional, vai na notificação)</div>
          <input type="text" class="input-box" placeholder="Ex.: chuva" [value]="cancelReason()" (input)="cancelReason.set($any($event.target).value)" />
          <div class="modal-actions">
            <button type="button" class="ar-mini-btn" (click)="cancelModalOpen.set(false)">Voltar</button>
            <button type="button" class="ar-mini-btn danger" [disabled]="canceling() || readOnly()" (click)="confirmCancel()">
              {{ canceling() ? 'Cancelando e estornando…' : 'Cancelar sessão e estornar' }}
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

    .canceled-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
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

    .summary-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin-top: 8px;
    }

    .summary-value.small {
      font-size: 20px;
    }

    .summary-note {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .summary-cap {
      font-size: 15px;
      color: var(--nx-text-dim);
      font-weight: 600;
    }

    .table-card {
      flex: 1;
      min-height: 0;
    }

    .table-list {
      display: flex;
      flex-direction: column;
    }

    .participant-row {
      display: grid;
      grid-template-columns: 28px 36px 1fr 90px 150px 32px;
      gap: 12px;
      align-items: center;
      padding: 11px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .participant-remove {
      display: flex;
      justify-content: flex-end;
    }

    .remove-btn {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1px solid var(--nx-line-strong);
      background: transparent;
      color: var(--nx-text-dim);
      font-size: 15px;
      line-height: 1;
      cursor: pointer;
    }

    .remove-btn:hover:not(:disabled) {
      border-color: rgba(255, 59, 48, 0.5);
      color: var(--nx-live);
    }

    .remove-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .participant-row:last-child {
      border-bottom: none;
    }

    .participant-pos {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .participant-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-line);
      display: grid;
      place-items: center;
      overflow: hidden;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-text-mute);
    }

    .participant-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .participant-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 14px;
      color: var(--nx-text);
    }

    .participant-amount {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .ar-mini-btn.danger {
      border-color: rgba(255, 59, 48, 0.4);
      color: var(--nx-live);
    }

    .modal-hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 10px 0 0;
    }

    .search-results {
      display: flex;
      flex-direction: column;
      margin-top: 10px;
      max-height: 220px;
      overflow: auto;
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 6px;
      border: none;
      border-bottom: 1px solid var(--nx-line);
      background: transparent;
      cursor: pointer;
      text-align: left;
    }

    .search-result:hover {
      background: var(--nx-surface-1);
    }

    .search-result-name {
      flex: 1;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .search-result-add {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .participant-avatar.small {
      width: 28px;
      height: 28px;
      font-size: 10px;
    }

    .modal-divider {
      margin: 18px 0 12px;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .modal-divider::before,
    .modal-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--nx-line);
    }

    .guest-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .guest-row .input-box {
      flex: 1;
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
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 16px;
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
export class PanelClubSessionComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly access = inject(ArenaAccessService);

  /** Cargo com leitura mas sem escrita em `agenda` (manutenção): adicionar/remover atleta
   *  e cancelar sessão ficam indisponíveis — a lista segue visível. */
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));

  protected readonly formatReais = formatReais;
  protected readonly spotsLeft = spotsLeft;
  protected readonly initialsOf = initialsOf;
  protected readonly participantLabel = PARTICIPANT_STATUS_LABEL;
  protected readonly participantTone = PARTICIPANT_TONE;
  protected readonly sessionStatusLabel = SESSION_STATUS_LABEL;

  protected readonly session = signal<ArenaClubSession | null>(null);
  protected readonly participants = signal<ClubParticipant[]>([]);
  protected readonly loading = signal(true);
  protected readonly actionError = signal<string | null>(null);

  protected readonly cancelModalOpen = signal(false);
  protected readonly cancelReason = signal('');
  protected readonly canceling = signal(false);

  protected readonly addModalOpen = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly searchResults = signal<AthleteSearchResult[]>([]);
  protected readonly searching = signal(false);
  protected readonly guestName = signal('');
  protected readonly adding = signal(false);
  protected readonly addError = signal<string | null>(null);
  protected readonly removeTarget = signal<ClubParticipant | null>(null);
  protected readonly removing = signal(false);
  private searchDebounce: ReturnType<typeof setTimeout> | undefined;

  protected readonly headerTitle = computed(() => {
    const s = this.session();
    return s ? `${s.clubName} · ${formatFullDate(s.date)}` : 'Sessão do clubinho';
  });

  protected readonly headerSubtitle = computed(() => {
    const s = this.session();
    return s ? `${s.startTime}–${s.endTime} · ${this.sessionStatusLabel[s.status]}` : '';
  });

  /** Só o que de fato entrou online (PIX confirmado) — onsite é acertado na arena. */
  protected readonly confirmedRevenue = computed(() => {
    const total = this.participants()
      .filter((p) => p.status === 'confirmed' && p.paymentMethod === 'pix')
      .reduce((sum, p) => sum + p.amountReais, 0);
    return formatReais(total);
  });

  protected readonly onsiteCount = computed(
    () => this.participants().filter((p) => p.status === 'confirmed' && p.paymentMethod === 'onsite').length,
  );

  private readonly clubId = this.route.snapshot.paramMap.get('clubId') ?? '';
  private readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';
  private readonly unsubs: Unsubscribe[] = [];

  constructor() {
    const db = arenaFirestore();
    this.unsubs.push(
      watchClubSession(db, this.sessionId, (session) => {
        this.session.set(session);
        this.loading.set(false);
      }),
      watchClubParticipants(db, this.sessionId, (participants) => this.participants.set(participants)),
    );
  }

  ngOnDestroy(): void {
    for (const unsub of this.unsubs) unsub();
    clearTimeout(this.searchDebounce);
  }

  protected openAddModal(): void {
    if (this.readOnly()) return;
    this.searchTerm.set('');
    this.searchResults.set([]);
    this.guestName.set('');
    this.addError.set(null);
    this.addModalOpen.set(true);
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    clearTimeout(this.searchDebounce);
    const term = value.trim();
    if (term.length < 2) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.searchDebounce = setTimeout(() => void this.runSearch(term), 300);
  }

  private async runSearch(term: string): Promise<void> {
    try {
      const inList = new Set(
        this.participants()
          .filter((p) => p.status === 'confirmed' || p.status === 'pending_payment')
          .map((p) => p.athleteId),
      );
      const results = await searchAthletes(arenaFirestore(), term);
      this.searchResults.set(results.filter((r) => !inList.has(r.id)));
    } catch {
      this.searchResults.set([]);
    } finally {
      this.searching.set(false);
    }
  }

  protected async addAthlete(result: AthleteSearchResult): Promise<void> {
    await this.runAdd({ athleteId: result.id });
  }

  protected async addGuest(): Promise<void> {
    const name = this.guestName().trim();
    if (name.length < 2) return;
    await this.runAdd({ customerName: name });
  }

  private async runAdd(input: { athleteId?: string; customerName?: string }): Promise<void> {
    if (this.adding() || this.readOnly()) return;
    this.adding.set(true);
    this.addError.set(null);
    try {
      await addClubParticipant(arenaFunctions(), this.sessionId, input);
      this.addModalOpen.set(false);
    } catch (err) {
      this.addError.set(err instanceof Error ? err.message : 'Não foi possível adicionar.');
    } finally {
      this.adding.set(false);
    }
  }

  protected askRemove(participant: ClubParticipant): void {
    if (this.readOnly()) return;
    this.addError.set(null);
    this.removeTarget.set(participant);
  }

  protected async confirmRemove(): Promise<void> {
    const target = this.removeTarget();
    if (!target || this.removing() || this.readOnly()) return;
    this.removing.set(true);
    this.addError.set(null);
    try {
      await removeClubParticipant(arenaFunctions(), this.sessionId, target.id);
      this.removeTarget.set(null);
    } catch (err) {
      this.addError.set(err instanceof Error ? err.message : 'Não foi possível remover.');
    } finally {
      this.removing.set(false);
    }
  }

  protected goBack(): void {
    void this.router.navigate(['/painel/clubinho', this.clubId]);
  }

  protected async confirmCancel(): Promise<void> {
    if (this.canceling() || this.readOnly()) return;
    this.canceling.set(true);
    this.actionError.set(null);
    try {
      const result = await cancelClubSession(arenaFunctions(), this.sessionId, this.cancelReason().trim() || undefined);
      this.cancelModalOpen.set(false);
      if (result.refundFailed > 0) {
        this.actionError.set(
          `${result.refundFailed} estorno(s) falharam — tente cancelar de novo para reprocessar ou contate o suporte.`,
        );
      }
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível cancelar a sessão.');
    } finally {
      this.canceling.set(false);
    }
  }
}
