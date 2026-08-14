import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PartnerInvitesService, type PendingPartnerInvite } from '../../data/partner-invites.service';
import { TournamentRegistrationError } from '../../data/tournament-registrations-repository';
import { NxToastService } from '../feedback';
import { LgpdConsentDialogComponent } from '../lgpd/lgpd-consent-dialog.component';
import {
  inviteAgeLabel,
  inviteAnnouncementSubtitle,
  inviteAnnouncementTitle,
  inviteCategoryLabel,
  inviteCtaHint,
  inviteDeadline,
  inviteInitials,
  inviteShareLabel,
  inviteWhenLabel,
  inviteWhereLabel,
  nextInviteToAnnounce,
  readAnnouncedInviteIds,
  rememberAnnouncedInvite,
} from './invite-announcement';
import { PartnerInviteResponder } from './partner-invite-responder';

const FOCUSABLE = 'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Relógio do prazo: o convite expira em horas, então minuto a minuto basta. */
const CLOCK_TICK_MS = 60_000;

let nextId = 0;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof TournamentRegistrationError ? err.message : fallback;
}

interface InviteRow {
  key: string;
  label: string;
  value: string;
  accent: boolean;
}

/**
 * Anúncio do convite de dupla ao entrar no portal.
 *
 * Convite nasce de um gesto do OUTRO atleta: badge e card resolvem para quem já está olhando,
 * mas quem acabou de entrar não tem por que caçar a novidade. Este componente abre o convite
 * na cara, uma vez por sessão, com as saídas honestas (aceitar, recusar, ver o torneio,
 * decidir depois).
 *
 * Mora no shell logado (`at-panel-shell`), então cobre qualquer tela do portal e, de graça,
 * fica fora de login/cadastro/onboarding — telas que não usam o shell.
 *
 * Fila de um: com vários convites pendentes, responder ou adiar traz o próximo. Modal com
 * lista rolável transforma cada decisão num item de formulário; uma por vez é mais honesto.
 *
 * O quadro (categoria/quando/onde/sua parte) sai do `TournamentSummary` que o store JÁ busca
 * pra resolver o nome do torneio — nenhuma consulta nova. Linha sem dado não aparece: quadro
 * com "—" é ruído, e valor inventado é pior que ausência.
 */
@Component({
  selector: 'app-at-invite-announcer',
  imports: [LgpdConsentDialogComponent],
  template: `
    @if (current(); as item) {
      @if (askingLgpd()) {
        <app-lgpd-consent-dialog (confirmed)="confirmLgpdAndAccept()" (cancelled)="askingLgpd.set(false)" />
      } @else {
        <div class="scrim">
          <div
            #dialog
            class="invite-dialog"
            role="dialog"
            aria-modal="true"
            [attr.aria-labelledby]="titleId"
            [attr.aria-describedby]="bodyId"
            (keydown)="onKeydown($event)"
          >
            <span class="grabber" aria-hidden="true"></span>

            <header class="head">
              <span class="tag">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                Novo convite
              </span>
              @if (ageLabel(); as age) {
                <span class="age">{{ age }}</span>
              }
            </header>

            <div class="who">
              <span class="avatars" aria-hidden="true">
                <span class="avatar avatar--them">{{ initials() }}</span>
                <span class="avatar avatar--you">VC</span>
              </span>
              <h2 class="title" [id]="titleId">{{ title() }}</h2>
            </div>

            <p class="subtitle" [id]="bodyId">{{ subtitle() }}</p>

            @if (rows().length > 0) {
              <dl class="facts">
                @for (row of rows(); track row.key) {
                  <div class="fact">
                    <dt>
                      <span class="fact-icon" aria-hidden="true">
                        @switch (row.key) {
                          @case ('categoria') {
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></svg>
                          }
                          @case ('quando') {
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                          }
                          @case ('onde') {
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>
                          }
                          @default {
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 11h20M6 15h4" /></svg>
                          }
                        }
                      </span>
                      {{ row.label }}
                    </dt>
                    <dd [class.fact-accent]="row.accent">{{ row.value }}</dd>
                  </div>
                }
              </dl>
            }

            @if (deadline(); as limit) {
              <div class="deadline">
                <p>
                  <span class="deadline-dot" aria-hidden="true"></span>
                  {{ limit.label }}
                </p>
                <span
                  class="deadline-bar"
                  role="progressbar"
                  aria-label="Tempo decorrido do prazo do convite"
                  [attr.aria-valuenow]="round(limit.elapsedPct)"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <span class="deadline-fill" [style.width.%]="limit.elapsedPct"></span>
                </span>
              </div>
            }

            <button type="button" class="cta" data-act="accept" [disabled]="busy()" (click)="accept()">
              <span class="cta-label">{{ acceptLabel() }}</span>
              @if (ctaHint(); as hint) {
                <span class="cta-hint">{{ hint }}</span>
              }
            </button>

            <div class="minor">
              <button type="button" class="btn" data-act="details" [disabled]="busy()" (click)="openTournament()">
                Ver detalhes
              </button>
              <button type="button" class="btn" data-act="decline" [disabled]="busy()" (click)="decline()">
                {{ busy() ? 'Recusando…' : 'Recusar' }}
              </button>
            </div>

            <button type="button" class="later" data-act="later" [disabled]="busy()" (click)="later()">
              Ver depois
            </button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    /* O host não pode ocupar espaço no shell — quem cobre a tela é o scrim. */
    :host {
      display: contents;
    }

    .scrim {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      justify-content: center;
      /* Folha de baixo no celular: o polegar alcança as ações. */
      align-items: flex-end;
      box-sizing: border-box;
      overflow-x: hidden;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      background: rgba(5, 5, 5, 0.72);
      backdrop-filter: blur(3px);
      animation: scrim-in var(--nx-d-fast) var(--nx-ease-out) both;
    }

    .invite-dialog {
      box-sizing: border-box;
      position: relative;
      width: min(460px, 100%);
      max-height: 100dvh;
      padding: 14px 22px calc(20px + env(safe-area-inset-bottom, 0px));
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--nx-surface-2);
      border: 1px solid var(--nx-orange-500);
      /* Só o topo arredonda: a folha nasce da borda de baixo da tela. */
      border-radius: var(--nx-r-4) var(--nx-r-4) 0 0;
      box-shadow:
        0 -18px 60px rgba(0, 0, 0, 0.6),
        0 0 34px -12px var(--nx-orange-500);
      animation: sheet-in var(--nx-d-base) var(--nx-ease-out) both;
    }

    .grabber {
      display: block;
      width: 46px;
      height: 4px;
      margin: 0 auto 16px;
      border-radius: 999px;
      background: var(--nx-line-strong);
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 13px;
      border: 1px solid var(--nx-orange-500);
      border-radius: 999px;
      color: var(--nx-orange-500);
      font-family: var(--nx-font-display);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.3px;
      text-transform: uppercase;
    }

    .age {
      flex: none;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1.6px;
      color: var(--nx-text-dim);
    }

    .who {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 20px;
    }

    .avatars {
      flex: none;
      display: flex;
      align-items: center;
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      font-family: var(--nx-font-display);
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.4px;
    }

    /* Sólido por cima do tracejado: quem convidou é o lado resolvido da imagem. */
    .avatar--them {
      position: relative;
      z-index: 1;
      background: linear-gradient(140deg, var(--nx-orange-400), var(--nx-orange-500));
      color: var(--nx-text-on-orange);
    }

    /* Tracejado = ainda não respondeu. É a única leitura que o dado sustenta: quem convidou
       está de um lado, você do outro, e a sua metade continua em aberto. */
    .avatar--you {
      /* Encosta no sólido sem esconder o rótulo: o padding empurra o "VC" pra parte do
         círculo que fica à mostra. */
      margin-left: -14px;
      padding-left: 13px;
      background: var(--nx-surface-1);
      border: 2px dashed var(--nx-orange-500);
      color: var(--nx-orange-500);
    }

    .title {
      margin: 0;
      font-family: var(--nx-font-display);
      font-size: 23px;
      font-weight: 800;
      letter-spacing: -0.5px;
      line-height: 1.16;
      color: var(--nx-text);
      overflow-wrap: anywhere;
    }

    .subtitle {
      margin: 16px 0 0;
      font-family: var(--nx-font-ui);
      font-size: 14px;
      line-height: 21px;
      color: var(--nx-text-mute);
      overflow-wrap: anywhere;
    }

    .facts {
      margin: 18px 0 0;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      overflow: hidden;
    }

    .fact {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 13px 15px;
    }

    .fact + .fact {
      border-top: 1px solid var(--nx-line);
    }

    .fact dt {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
      font-family: var(--nx-font-ui);
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .fact-icon {
      display: grid;
      place-items: center;
      color: var(--nx-text-dim);
    }

    .fact dd {
      margin: 0;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-size: 14px;
      font-weight: 700;
      text-align: right;
      color: var(--nx-text);
      overflow-wrap: anywhere;
    }

    .fact dd.fact-accent {
      color: var(--nx-orange-500);
    }

    .deadline {
      margin-top: 14px;
      padding: 13px 15px;
      background: color-mix(in srgb, var(--nx-yellow-500, #e8c547) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--nx-yellow-500, #e8c547) 34%, transparent);
      border-radius: var(--nx-r-3);
    }

    .deadline p {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 0;
      font-family: var(--nx-font-ui);
      font-size: 13px;
      line-height: 19px;
      color: var(--nx-text);
    }

    .deadline-dot {
      flex: none;
      width: 8px;
      height: 8px;
      margin-top: 6px;
      border-radius: 50%;
      background: var(--nx-yellow-500, #e8c547);
    }

    .deadline-bar {
      display: block;
      height: 4px;
      margin-top: 12px;
      border-radius: 999px;
      background: var(--nx-surface-0);
      overflow: hidden;
    }

    .deadline-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--nx-yellow-500, #e8c547);
    }

    .cta {
      box-sizing: border-box;
      display: block;
      width: 100%;
      margin-top: 18px;
      padding: 13px 16px;
      background: var(--nx-orange-500);
      border: 1px solid var(--nx-orange-500);
      border-radius: var(--nx-r-3);
      color: var(--nx-text-on-orange);
      cursor: pointer;
      box-shadow: 0 10px 30px -10px var(--nx-orange-500);
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .cta:hover:not(:disabled) {
      background: var(--nx-orange-400);
    }

    .cta:disabled,
    .btn:disabled,
    .later:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .cta-label {
      display: block;
      font-family: var(--nx-font-display);
      font-size: 16px;
      font-weight: 800;
      line-height: 1.25;
    }

    .cta-hint {
      display: block;
      margin-top: 3px;
      font-family: var(--nx-font-ui);
      font-size: 12px;
      line-height: 17px;
      opacity: 0.78;
    }

    .minor {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }

    .btn {
      box-sizing: border-box;
      flex: 1 1 0;
      min-width: 0;
      min-height: 46px;
      padding: 10px 12px;
      background: none;
      border: 1px solid var(--nx-line-strong);
      border-radius: var(--nx-r-3);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.25;
      white-space: normal;
      cursor: pointer;
      transition: background var(--nx-d-fast) var(--nx-ease-out);
    }

    .btn:hover:not(:disabled) {
      background: var(--nx-surface-1);
    }

    /* "Ver depois" não é recusa — fica abaixo e apagado pra não competir com as outras
       três saídas, mas continua alcançável no teclado. */
    .later {
      display: block;
      width: 100%;
      margin-top: 10px;
      padding: 10px;
      background: none;
      border: 1px solid transparent;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-display);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .later:hover:not(:disabled) {
      color: var(--nx-text);
    }

    @keyframes scrim-in {
      from {
        opacity: 0;
      }
    }

    @keyframes sheet-in {
      from {
        opacity: 0;
        transform: translateY(24px);
      }
    }

    /* Do tablet pra cima a folha de baixo não faz sentido: vira cartão centrado, mesmo
       conteúdo. Aninhado no seletor de propósito — @media solto antes da regra base é
       descartado. */
    @media (min-width: 640px) {
      .scrim {
        align-items: safe center;
        padding: 24px;
      }

      .invite-dialog {
        max-height: calc(100dvh - 48px);
        padding: 26px 26px 22px;
        border-radius: var(--nx-r-4);
        border-color: var(--nx-line-strong);
        box-shadow: var(--nx-elev-3);
      }

      .grabber {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scrim,
      .invite-dialog {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtInviteAnnouncerComponent {
  private readonly invites = inject(PartnerInvitesService);
  private readonly auth = inject(AuthService);
  private readonly responder = inject(PartnerInviteResponder);
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);

  /** Marco de "entrei agora": convite criado depois disso espera a próxima entrada. */
  private readonly sessionStartedAt = Date.now();

  /** Relógio próprio: o prazo tem de encolher sozinho enquanto o modal está aberto. */
  private readonly now = signal(Date.now());

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private previouslyFocused: HTMLElement | null = null;

  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  private readonly announced = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly busy = signal(false);
  protected readonly askingLgpd = signal(false);

  protected readonly titleId = `at-invite-title-${nextId++}`;
  protected readonly bodyId = `at-invite-body-${nextId++}`;

  protected readonly current = computed(() =>
    nextInviteToAnnounce(this.invites.pending(), this.announced(), this.sessionStartedAt),
  );

  protected readonly title = computed(() => {
    const item = this.current();
    return item ? inviteAnnouncementTitle(item) : '';
  });

  protected readonly subtitle = computed(() => {
    const item = this.current();
    return item ? inviteAnnouncementSubtitle(item) : '';
  });

  protected readonly initials = computed(() => {
    const item = this.current();
    return item ? inviteInitials(item.invite.inviterName) : '';
  });

  protected readonly ageLabel = computed(() => inviteAgeLabel(this.current()?.invite.createdAt ?? null, this.now()));

  protected readonly deadline = computed(() =>
    inviteDeadline(this.current()?.invite.createdAt ?? null, this.current()?.invite.expiresAt ?? null, this.now()),
  );

  protected readonly acceptLabel = computed(() =>
    this.current()?.invite.isTeamInvite ? 'Aceitar e entrar na equipe' : 'Aceitar e formar dupla',
  );

  protected readonly ctaHint = computed(() => {
    const item = this.current();
    return item ? inviteCtaHint(item) : null;
  });

  /** Linha sem dado não entra: quadro com "—" é ruído, e valor inventado é pior que ausência. */
  protected readonly rows = computed<InviteRow[]>(() => {
    const item = this.current();
    if (item == null) return [];
    const candidates: readonly (readonly [string, string, string | null, boolean])[] = [
      ['categoria', 'Categoria', inviteCategoryLabel(item), false],
      ['quando', 'Quando', inviteWhenLabel(item.tournament?.startAt ?? null), false],
      ['onde', 'Onde', inviteWhereLabel(item), false],
      ['parte', 'Sua parte', inviteShareLabel(item), true],
    ];
    return candidates
      .filter((row): row is readonly [string, string, string, boolean] => row[2] != null)
      .map(([key, label, value, accent]) => ({ key, label, value, accent }));
  });

  constructor() {
    // Conta nova na mesma aba é sessão nova pra quem entrou — a memória de anúncio é por uid.
    effect(() => {
      const uid = this.uid();
      this.announced.set(uid ? readAnnouncedInviteIds(uid) : new Set<string>());
    });

    // Só tiquetaqueia com o modal aberto: relógio rodando atrás de tela fechada é trabalho
    // à toa em todas as 30 telas do shell.
    effect((onCleanup) => {
      if (this.current() == null) return;
      const timer = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
      onCleanup(() => clearInterval(timer));
    });

    // Depois do render, e não durante: o diálogo do termo LGPD devolve a rolagem ao ser
    // destruído, então a última palavra sobre a trava tem de ser daqui.
    afterRenderEffect(() => {
      const open = this.current() != null;
      this.askingLgpd();
      document.body.style.overflow = open ? 'hidden' : '';

      const el = this.dialog()?.nativeElement;
      if (el) {
        this.previouslyFocused ??= document.activeElement as HTMLElement | null;
        if (!el.contains(document.activeElement)) {
          el.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }
      } else if (!open && this.previouslyFocused) {
        this.previouslyFocused.focus();
        this.previouslyFocused = null;
      }
    });

    inject(DestroyRef).onDestroy(() => {
      document.body.style.overflow = '';
    });
  }

  protected round(value: number): number {
    return Math.round(value);
  }

  protected accept(): void {
    if (this.busy()) return;
    this.askingLgpd.set(true);
  }

  protected confirmLgpdAndAccept(): void {
    this.askingLgpd.set(false);
    const item = this.current();
    if (item) void this.submitAccept(item);
  }

  protected decline(): void {
    const item = this.current();
    if (item) void this.submitDecline(item);
  }

  protected later(): void {
    const item = this.current();
    if (item) this.stopAnnouncing(item.invite.id);
  }

  /** "Ver detalhes": leva pro torneio SEM responder — o convite continua pendente e o modal
   *  sai da frente (senão o atleta chegaria na página do torneio com a folha por cima). */
  protected openTournament(): void {
    const item = this.current();
    if (item == null) return;
    this.stopAnnouncing(item.invite.id);
    void this.router.navigate(['/torneios', item.invite.tournamentId]);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!this.busy()) this.later();
      return;
    }
    if (event.key !== 'Tab') return;

    // Prende o Tab no diálogo: a tela de fundo está inerte aos olhos, mas continua
    // alcançável pelo teclado.
    const el = this.dialog()?.nativeElement;
    const items = el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Tira o convite do anúncio (nesta aba) sem responder por ele — ele segue no badge do
   *  shell e no card do painel. */
  private stopAnnouncing(inviteId: string): void {
    const uid = this.uid();
    if (uid) rememberAnnouncedInvite(uid, inviteId);
    this.announced.update((current) => new Set(current).add(inviteId));
  }

  /** Aceite sem uniforme — o backend coleta na inscrição, pra onde o atleta vai em seguida. */
  private async submitAccept(item: PendingPartnerInvite): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.responder.accept(item.invite.id);
      this.invites.markAnswered(item.invite.id);
      this.stopAnnouncing(item.invite.id);
      void this.router.navigate(['/torneios', item.invite.tournamentId, 'inscricao'], {
        queryParams: { categoria: item.invite.categoryId },
      });
    } catch (err) {
      this.toasts.error(
        'Não foi possível aceitar o convite',
        errorMessage(err, 'O serviço não respondeu — tente de novo.'),
        // Termo já aceito no diálogo — a retentativa vai direto pro envio.
        { label: 'Tentar novamente', run: () => void this.submitAccept(item) },
      );
    } finally {
      this.busy.set(false);
    }
  }

  private async submitDecline(item: PendingPartnerInvite): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.responder.decline(item.invite.id);
      this.invites.markAnswered(item.invite.id);
      this.stopAnnouncing(item.invite.id);
    } catch (err) {
      this.toasts.error(
        'Não foi possível recusar o convite',
        errorMessage(err, 'O convite continua na sua lista — tente de novo.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
