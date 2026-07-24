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
  joinClubSession,
  joinClubSessionOnsite,
  watchClubSession,
  watchMyParticipant,
  type ClubJoinPixPayment,
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

function onlyDigits(v: string): string {
  return v.replace(/\D/g, '');
}

/** Pagamento da vaga no clubinho — mesmo padrão PIX ao vivo da reserva de quadra
 *  (`arena-payment.component.ts`): callable gera QR, onSnapshot no doc do participante
 *  vira a tela quando o webhook confirma. */
@Component({
  selector: 'app-club-session-payment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtPanelShellComponent],
  template: `
    <app-at-panel-shell [userName]="accountLabel()">
      <div class="cp-body">
        @if (loading()) {
          <p class="cp-state">Carregando…</p>
        } @else if (!session()) {
          <p class="cp-state">Sessão do clubinho não encontrada.</p>
        } @else if (session(); as s) {
          <div class="cp-header">
            <div>
              <h1 class="cp-title">Garantir vaga</h1>
              <p class="cp-subtitle">{{ s.clubName }} · {{ s.arenaName }} · {{ s.date }} {{ s.startTime }}</p>
            </div>
            <a class="cp-back" [routerLink]="['/reservar', s.arenaId, 'clubinho', s.id]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              Voltar à lista
            </a>
          </div>

          @if (notice(); as n) {
            <div class="cp-notice" role="status">{{ n }}</div>
          }

          @if (confirmed()) {
            <div class="cp-card cp-success">
              <div class="cp-success-icon">✓</div>
              <h2 class="cp-success-title">Você está na lista!</h2>
              <p class="cp-success-text">
                @if (myMethod() === 'onsite') {
                  Vaga garantida no {{ s.clubName }} em {{ s.date }} — pague
                  {{ formatBRL(s.priceReais) }} na arena no dia.
                } @else {
                  Pagamento confirmado — seu nome já aparece na lista do {{ s.clubName }} em {{ s.date }}.
                }
              </p>
              <div class="cp-success-actions">
                <a class="cp-btn-primary" [routerLink]="['/reservar', s.arenaId, 'clubinho', s.id]">Ver lista</a>
                <a class="cp-btn-ghost" routerLink="/agenda">Minha agenda</a>
              </div>
            </div>
          } @else if (pix(); as p) {
            <div class="cp-card">
              <div class="cp-amount-row">
                <span class="cp-kicker">Pague com PIX</span>
                <span class="cp-amount">{{ formatBRL(p.amountReais) }}</span>
                @if (!pixExpired()) {
                  <span class="cp-countdown">expira em {{ countdown() }}</span>
                } @else {
                  <span class="cp-countdown expired">PIX expirado</span>
                }
              </div>

              @if (!pixExpired()) {
                @if (p.qrCodeBase64) {
                  <img class="cp-qr" [src]="'data:image/png;base64,' + p.qrCodeBase64" alt="QR Code PIX" />
                }
                <div class="cp-copy-box">
                  <code class="cp-copy-code">{{ p.qrCode }}</code>
                  <button type="button" class="cp-btn-ghost" (click)="copyCode()">Copiar código</button>
                </div>
                <p class="cp-hint">Assim que o pagamento cair, a confirmação aparece aqui sozinha — não feche esta tela.</p>
              } @else {
                <button type="button" class="cp-btn-primary" [disabled]="processing()" (click)="generate()">
                  {{ processing() ? 'Gerando…' : 'Gerar novo PIX' }}
                </button>
              }
            </div>
          } @else {
            <div class="cp-card">
              <span class="cp-kicker">Valor da vaga</span>
              <div class="cp-amount big">{{ formatBRL(s.priceReais) }}</div>

              @if (s.allowOnsitePayment) {
                <div class="cp-methods">
                  <button type="button" class="cp-method-btn" [class.active]="method() === 'pix'" (click)="method.set('pix')">
                    PIX antecipado
                  </button>
                  <button type="button" class="cp-method-btn" [class.active]="method() === 'onsite'" (click)="method.set('onsite')">
                    Pagar na arena
                  </button>
                </div>
              }

              @if (method() === 'pix') {
                <label class="cp-label" for="cpf">CPF (obrigatório para o PIX)</label>
                <input
                  id="cpf"
                  type="text"
                  inputmode="numeric"
                  class="cp-input"
                  placeholder="Somente números"
                  [value]="cpf()"
                  (input)="onCpfInput($any($event.target).value)"
                />

                <button type="button" class="cp-btn-primary" [disabled]="processing()" (click)="generate()">
                  {{ processing() ? 'Reservando vaga…' : 'Gerar PIX e segurar vaga' }}
                </button>
                <p class="cp-hint">
                  A vaga fica segurada por alguns minutos enquanto você paga. Não pagou? Ela volta
                  para a lista automaticamente.
                </p>
              } @else {
                <button type="button" class="cp-btn-primary" [disabled]="processing()" (click)="joinOnsite()">
                  {{ processing() ? 'Garantindo vaga…' : 'Garantir vaga · pagar na arena' }}
                </button>
                <p class="cp-hint">
                  Seu nome entra na lista agora e você acerta os {{ formatBRL(s.priceReais) }}
                  direto na arena no dia. Dá para sair da lista até o início da sessão.
                </p>
              }
            </div>
          }
        }
      </div>
    </app-at-panel-shell>
  `,
  styles: `
    .cp-body {
      padding: 24px 32px 40px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 620px;
    }

    .cp-state {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .cp-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .cp-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 24px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0 0 4px;
    }

    .cp-subtitle {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .cp-back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--nx-text-mute);
      text-decoration: none;
      white-space: nowrap;
    }

    .cp-back:hover {
      color: var(--nx-text);
    }

    .cp-notice {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line-strong);
      background: var(--nx-surface-1);
      padding: 10px 14px;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .cp-card {
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .cp-kicker {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
    }

    .cp-amount-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      flex-wrap: wrap;
    }

    .cp-amount {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .cp-amount.big {
      font-size: 32px;
      color: var(--nx-orange-500);
    }

    .cp-countdown {
      font-family: var(--nx-font-mono);
      font-size: 12px;
      color: var(--nx-pending);
    }

    .cp-countdown.expired {
      color: var(--nx-live);
    }

    .cp-qr {
      width: 220px;
      height: 220px;
      align-self: center;
      border-radius: var(--nx-r-3);
      background: #fff;
      padding: 10px;
    }

    .cp-copy-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cp-copy-code {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 10px 12px;
      word-break: break-all;
      max-height: 84px;
      overflow: auto;
    }

    .cp-methods {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .cp-method-btn {
      height: 50px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 13.5px;
      cursor: pointer;
    }

    .cp-method-btn.active {
      background: rgba(255, 106, 26, 0.1);
      border-color: var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .cp-label {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .cp-input {
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      /* >= 16px evita o zoom automático do iOS ao focar o campo. */
      font-size: 16px;
      padding: 0 14px;
      width: 100%;
    }

    .cp-input:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .cp-btn-primary {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      height: 48px;
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

    .cp-btn-primary:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .cp-btn-primary:hover:not(:disabled) {
      background: var(--nx-orange-400);
    }

    .cp-btn-ghost {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      height: 44px;
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

    .cp-hint {
      font-size: 12px;
      line-height: 1.5;
      color: var(--nx-text-dim);
      margin: 0;
    }

    .cp-success {
      align-items: center;
      text-align: center;
      padding: 34px 22px;
    }

    .cp-success-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(48, 209, 88, 0.12);
      color: var(--nx-win);
      font-size: 26px;
      font-weight: 800;
    }

    .cp-success-title {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      color: var(--nx-text);
      margin: 0;
    }

    .cp-success-text {
      font-size: 13.5px;
      line-height: 1.55;
      color: var(--nx-text-mute);
      margin: 0;
      max-width: 380px;
    }

    .cp-success-actions {
      display: flex;
      gap: 12px;
      margin-top: 6px;
    }

    @media (max-width: 720px) {
      .cp-body {
        padding: 18px 16px 32px;
      }

      /* Alvo de toque: o link "Voltar" só tinha a área do texto/ícone (sem padding). */
      .cp-back {
        padding: 13px 6px;
      }
    }
  `,
})
export class ClubSessionPaymentComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();
  private countdownInterval: ReturnType<typeof setInterval> | undefined;
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;
  private unwatchMy: (() => void) | undefined;
  private myWatchUid: string | null = null;

  protected readonly formatBRL = formatBRL;

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  private readonly sessionId = this.route.snapshot.paramMap.get('sessionId') ?? '';

  protected readonly loading = signal(true);
  protected readonly session = signal<ClubSession | null>(null);
  protected readonly method = signal<'pix' | 'onsite'>('pix');
  protected readonly cpf = signal('');
  protected readonly processing = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly pix = signal<ClubJoinPixPayment | null>(null);
  protected readonly countdown = signal('');
  protected readonly pixExpired = signal(false);
  protected readonly confirmed = signal(false);
  protected readonly myMethod = signal<'pix' | 'onsite'>('pix');

  constructor() {
    const db = this.firestore;
    if (!db || !this.sessionId) {
      this.loading.set(false);
      return;
    }

    const unwatchSession = watchClubSession(db, this.sessionId, (session) => {
      this.session.set(session);
      this.loading.set(false);
    });

    // Confirmação ao vivo: o webhook Asaas marca `confirmed` e a tela vira sozinha.
    // Religa o watch quando o uid resolver (auth async).
    effect(() => {
      const uid = this.auth.user()?.uid ?? null;
      if (uid === this.myWatchUid) return;
      this.myWatchUid = uid;
      this.unwatchMy?.();
      this.unwatchMy = undefined;
      if (!uid) return;
      this.unwatchMy = watchMyParticipant(db, this.sessionId, uid, (p) => {
        if (p?.status === 'confirmed') {
          this.myMethod.set(p.paymentMethod);
          this.confirmed.set(true);
          clearInterval(this.countdownInterval);
        } else if (p?.status === 'expired' && this.pix()) {
          this.pixExpired.set(true);
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      unwatchSession();
      this.unwatchMy?.();
      clearInterval(this.countdownInterval);
      clearTimeout(this.noticeTimeout);
    });
  }

  protected onCpfInput(value: string): void {
    this.cpf.set(onlyDigits(value).slice(0, 14));
  }

  protected async generate(): Promise<void> {
    if (this.processing()) return;
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.showNotice('Faça login para entrar na lista.');
      return;
    }

    this.processing.set(true);
    try {
      const pix = await joinClubSession(athleteFunctions(), this.sessionId, this.cpf());
      this.pix.set(pix);
      this.pixExpired.set(false);
      this.startCountdown(pix.expiresAt);
    } catch (err) {
      this.showNotice(err instanceof ArenaClubError ? err.message : 'Não foi possível gerar o PIX agora.');
    } finally {
      this.processing.set(false);
    }
  }

  /** Sem cobrança online: a callable confirma na hora e o listener vira a tela. */
  protected async joinOnsite(): Promise<void> {
    if (this.processing()) return;
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.showNotice('Faça login para entrar na lista.');
      return;
    }

    this.processing.set(true);
    try {
      await joinClubSessionOnsite(athleteFunctions(), this.sessionId);
      this.myMethod.set('onsite');
      this.confirmed.set(true);
    } catch (err) {
      this.showNotice(err instanceof ArenaClubError ? err.message : 'Não foi possível garantir a vaga agora.');
    } finally {
      this.processing.set(false);
    }
  }

  protected async copyCode(): Promise<void> {
    const code = this.pix()?.qrCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.showNotice('Código PIX copiado.');
    } catch {
      this.showNotice('Não foi possível copiar — selecione o código manualmente.');
    }
  }

  private startCountdown(expiresAtIso: string): void {
    clearInterval(this.countdownInterval);
    const expiresAt = new Date(expiresAtIso).getTime();
    const tick = () => {
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);
      if (remaining <= 0) {
        this.countdown.set('00:00');
        this.pixExpired.set(true);
        clearInterval(this.countdownInterval);
        return;
      }
      const mm = `${Math.floor(remaining / 60)}`.padStart(2, '0');
      const ss = `${remaining % 60}`.padStart(2, '0');
      this.countdown.set(`${mm}:${ss}`);
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 4500);
  }
}
