import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { athleteFunctions } from '../data/functions';
import {
  ArenaClubError,
  clubSpotsLeft,
  leaveClubSession,
  watchClubParticipants,
  watchClubSession,
  watchMyParticipant,
  type ClubParticipant,
  type ClubSession,
} from '../data/arena-clubs-repository';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function formatFullDate(dateKey: string): string {
  const parts = dateKey.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateKey;
}

/** Detalhe da sessão do clubinho: lista de confirmados AO VIVO + entrar/sair da lista.
 *  A vaga só confirma após o PIX (tela de pagamento); sair dentro do prazo estorna. */
@Component({
  selector: 'app-club-session-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtPanelShellComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <div class="cs-body">
        @if (loading()) {
          <p class="cs-state">Carregando sessão…</p>
        } @else if (!session()) {
          <div class="cs-notfound">
            <p class="cs-state">Sessão do clubinho não encontrada.</p>
            <a class="cs-btn-ghost" [routerLink]="['/reservar', arenaId()]">Voltar à arena</a>
          </div>
        } @else if (session(); as s) {
          <div class="cs-header">
            <div>
              <span class="cs-kicker">Clubinho · {{ s.arenaName }}</span>
              <h1 class="cs-title">{{ s.clubName }}</h1>
              <p class="cs-subtitle">
                {{ formatFullDate(s.date) }} · {{ s.startTime }}–{{ s.endTime }}
                @if (s.courtNames.length > 0) {
                  · {{ s.courtNames.join(', ') }}
                }
              </p>
            </div>
            <a class="cs-back" [routerLink]="['/reservar', s.arenaId]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              Voltar
            </a>
          </div>

          @if (notice(); as n) {
            <div class="cs-notice" role="status">{{ n }}</div>
          }

          @if (s.status === 'canceled') {
            <div class="cs-alert">Esta sessão foi cancelada pela arena. Pagamentos confirmados são estornados automaticamente.</div>
          }

          <div class="cs-grid">
            <section class="cs-card">
              <div class="cs-card-head">
                <h2 class="cs-card-title">Lista</h2>
                <span class="cs-count">{{ s.confirmedCount }}/{{ s.capacity }} confirmados</span>
              </div>
              @if (s.description) {
                <p class="cs-desc">{{ s.description }}</p>
              }
              <div class="cs-list">
                @for (p of confirmedParticipants(); track p.id; let i = $index) {
                  <div class="cs-row">
                    <span class="cs-pos">{{ i + 1 }}</span>
                    <span class="cs-avatar">
                      @if (p.athletePhotoUrl) {
                        <img [src]="p.athletePhotoUrl" alt="" />
                      } @else {
                        {{ initialsOf(p.athleteName) }}
                      }
                    </span>
                    <span class="cs-name">{{ p.athleteName }}{{ p.athleteId === uid() ? ' (você)' : '' }}</span>
                  </div>
                } @empty {
                  <p class="cs-state">Ninguém confirmado ainda — seja o primeiro da lista!</p>
                }
              </div>
            </section>

            <aside class="cs-side">
              <div class="cs-card cs-cta-card">
                <span class="cs-kicker orange">Valor por atleta</span>
                <div class="cs-price">{{ formatBRL(s.priceReais) }}</div>
                <div class="cs-spots" [class.full]="spotsLeft() === 0">
                  {{ spotsLeft() === 0 ? 'Lista cheia' : spotsLeft() + ' vaga' + (spotsLeft() === 1 ? '' : 's') + ' restante' + (spotsLeft() === 1 ? '' : 's') }}
                </div>

                @if (s.status === 'scheduled') {
                  @switch (myStatus()) {
                    @case ('confirmed') {
                      <div class="cs-mine ok">✓ Você está na lista</div>
                      @if (canLeave()) {
                        @if (!leaveConfirming()) {
                          <button type="button" class="cs-btn-ghost full" (click)="leaveConfirming.set(true)">Sair da lista</button>
                        } @else {
                          <p class="cs-leave-warn">Sair agora estorna seu PIX automaticamente e libera a vaga. Confirmar?</p>
                          <div class="cs-leave-row">
                            <button type="button" class="cs-btn-ghost" (click)="leaveConfirming.set(false)">Ficar</button>
                            <button type="button" class="cs-btn-danger" [disabled]="leaving()" (click)="confirmLeave()">
                              {{ leaving() ? 'Saindo…' : 'Sair e estornar' }}
                            </button>
                          </div>
                        }
                      } @else {
                        <p class="cs-hint">O prazo para sair com estorno ({{ s.cancelWindowHours }}h antes) já passou.</p>
                      }
                    }
                    @case ('pending_payment') {
                      <div class="cs-mine pending">PIX pendente — sua vaga está segurada</div>
                      <a class="cs-btn-primary" [routerLink]="['/reservar', s.arenaId, 'clubinho', s.id, 'pagamento']">Continuar pagamento</a>
                    }
                    @default {
                      @if (spotsLeft() > 0) {
                        <a class="cs-btn-primary" [routerLink]="['/reservar', s.arenaId, 'clubinho', s.id, 'pagamento']">
                          Entrar na lista · {{ formatBRL(s.priceReais) }}
                        </a>
                        <p class="cs-hint">O nome entra na lista após o pagamento do PIX. Cancele até {{ s.cancelWindowHours }}h antes com estorno automático.</p>
                      } @else {
                        <p class="cs-hint">Sem vagas — tente na próxima sessão.</p>
                      }
                    }
                  }
                }
              </div>
            </aside>
          </div>
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .cs-body {
      padding: 24px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 1040px;
    }

    .cs-state {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .cs-notfound {
      display: flex;
      flex-direction: column;
      gap: 14px;
      align-items: flex-start;
    }

    .cs-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .cs-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .cs-kicker.orange {
      color: var(--nx-orange-500);
    }

    .cs-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 6px 0 4px;
    }

    .cs-subtitle {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .cs-back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--nx-text-mute);
      text-decoration: none;
    }

    .cs-back:hover {
      color: var(--nx-text);
    }

    .cs-notice {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .cs-alert {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .cs-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      align-items: start;
    }

    .cs-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 20px;
    }

    .cs-card-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }

    .cs-card-title {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
      margin: 0;
    }

    .cs-count {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-orange-500);
    }

    .cs-desc {
      font-size: 13px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0 0 12px;
    }

    .cs-list {
      display: flex;
      flex-direction: column;
    }

    .cs-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .cs-row:last-child {
      border-bottom: none;
    }

    .cs-pos {
      width: 22px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    .cs-avatar {
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

    .cs-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cs-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .cs-side {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cs-cta-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cs-price {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 30px;
      letter-spacing: -0.02em;
      color: var(--nx-orange-500);
    }

    .cs-spots {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-win);
    }

    .cs-spots.full {
      color: var(--nx-live);
    }

    .cs-mine {
      border-radius: var(--nx-r-2);
      padding: 10px 12px;
      font-size: 13px;
      font-weight: 600;
    }

    .cs-mine.ok {
      background: rgba(48, 209, 88, 0.1);
      color: var(--nx-win);
    }

    .cs-mine.pending {
      background: rgba(255, 214, 10, 0.08);
      color: var(--nx-pending);
    }

    .cs-btn-primary {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-orange-500);
      color: #fff;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }

    .cs-btn-primary:hover {
      background: var(--nx-orange-400);
    }

    .cs-btn-ghost {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      height: 40px;
      padding: 0 16px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text-mute);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }

    .cs-btn-ghost.full {
      width: 100%;
    }

    .cs-btn-danger {
      height: 40px;
      padding: 0 16px;
      border-radius: var(--nx-r-2);
      background: transparent;
      border: 1px solid rgba(255, 59, 48, 0.5);
      color: var(--nx-live);
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .cs-leave-warn {
      font-size: 12.5px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .cs-leave-row {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }

    .cs-hint {
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 0;
    }

    @media (max-width: 900px) {
      .cs-body {
        padding: 18px 16px 32px;
      }

      .cs-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ClubSessionDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  protected readonly formatBRL = formatBRL;
  protected readonly formatFullDate = formatFullDate;
  protected readonly initialsOf = initialsOf;

  protected readonly arenaId = computed(() => this.route.snapshot.paramMap.get('arenaId') ?? '');
  private readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';

  protected readonly uid = computed(() => this.auth.user()?.uid ?? null);
  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  protected readonly loading = signal(true);
  protected readonly session = signal<ClubSession | null>(null);
  protected readonly participants = signal<ClubParticipant[]>([]);
  protected readonly myParticipant = signal<ClubParticipant | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly leaveConfirming = signal(false);
  protected readonly leaving = signal(false);

  protected readonly confirmedParticipants = computed(() =>
    this.participants().filter((p) => p.status === 'confirmed'),
  );

  protected readonly spotsLeft = computed(() => {
    const s = this.session();
    return s ? clubSpotsLeft(s) : 0;
  });

  protected readonly myStatus = computed(() => this.myParticipant()?.status ?? null);

  protected readonly canLeave = computed(() => {
    const s = this.session();
    if (!s?.startAt) return false;
    const deadline = s.startAt.getTime() - s.cancelWindowHours * 60 * 60 * 1000;
    return Date.now() <= deadline;
  });

  private myWatchUid: string | null = null;
  private unwatchMy: (() => void) | undefined;

  constructor() {
    const db = this.firestore;
    if (!db || !this.sessionId) {
      this.loading.set(false);
      return;
    }

    const unsubs = [
      watchClubSession(db, this.sessionId, (session) => {
        this.session.set(session);
        this.loading.set(false);
      }),
      watchClubParticipants(db, this.sessionId, (participants) => this.participants.set(participants)),
    ];
    this.destroyRef.onDestroy(() => {
      for (const unsub of unsubs) unsub();
      this.unwatchMy?.();
    });

    // Uid pode chegar depois do primeiro render (auth async) — religa o watch quando mudar.
    effect(() => {
      const uid = this.uid();
      if (uid === this.myWatchUid) return;
      this.myWatchUid = uid;
      this.unwatchMy?.();
      this.unwatchMy = undefined;
      if (uid) {
        this.unwatchMy = watchMyParticipant(db, this.sessionId, uid, (p) => this.myParticipant.set(p));
      } else {
        this.myParticipant.set(null);
      }
    });
  }

  protected async confirmLeave(): Promise<void> {
    if (this.leaving()) return;
    this.leaving.set(true);
    try {
      await leaveClubSession(athleteFunctions(), this.sessionId);
      this.leaveConfirming.set(false);
      this.notice.set('Você saiu da lista — o estorno do PIX foi solicitado.');
    } catch (err) {
      this.notice.set(err instanceof ArenaClubError ? err.message : 'Não foi possível sair da lista agora.');
    } finally {
      this.leaving.set(false);
    }
  }
}
