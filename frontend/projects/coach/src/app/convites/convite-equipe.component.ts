import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CoachContextService } from '../painel/access/coach-context.service';
import { ROLE_LABELS, ROLE_SUMMARIES, isCoachStaffRole, type CoachStaffRole } from '../painel/access/coach-roles.model';
import { inviteViewState } from './convite-equipe.state';
import { FUNCTIONS_REGION } from '@nexago/firebase-config';

type ScreenState = 'loading' | 'not-found' | 'ready' | 'not-pending' | 'expired' | 'wrong-account';

interface InviteView {
  coachUid: string;
  coachName: string;
  role: CoachStaffRole;
}

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Convite para a comissão técnica de um treinador. Quem abre o link sem login passa pelo
 *  `authGuard` (→ /entrar?redirect=…) e volta aqui depois do login ou do cadastro. */
@Component({
  selector: 'co-convite-equipe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="wrap">
      <div class="card">
        @switch (state()) {
          @case ('loading') {
            <p class="muted">Carregando convite…</p>
          }
          @case ('not-found') {
            <p class="muted">Convite não encontrado.</p>
            <p class="muted">
              Você está conectado como <strong>{{ auth.user()?.email }}</strong>. Se o convite foi
              enviado para outro e-mail, saia e entre com ele.
            </p>
            <div class="actions">
              <button type="button" class="co-btn-primary" [disabled]="busy()" (click)="switchAccount()">
                Sair e trocar de conta
              </button>
            </div>
          }
          @case ('not-pending') {
            <p class="muted">Este convite já foi usado ou foi cancelado.</p>
          }
          @case ('expired') {
            <p class="muted">Este convite expirou. Peça um novo ao treinador.</p>
          }
          @case ('wrong-account') {
            <h1>Convite para outro e-mail</h1>
            <p class="body-text">
              Este convite foi enviado para outro e-mail. Você está conectado como
              <strong>{{ auth.user()?.email }}</strong>.
            </p>
            <div class="actions">
              <button type="button" class="co-btn-primary" [disabled]="busy()" (click)="switchAccount()">
                Sair e trocar de conta
              </button>
            </div>
          }
          @case ('ready') {
            <h1>Convite da comissão técnica</h1>
            <p class="body-text">
              <strong>{{ invite()?.coachName }}</strong> convidou você para a comissão técnica como
              <strong>{{ roleLabel() }}</strong>.
            </p>
            <p class="muted">{{ roleSummary() }}</p>
            @if (error(); as err) {
              <div class="co-alert" role="alert">{{ err }}</div>
            }
            <div class="actions">
              <button type="button" class="co-btn-primary" [disabled]="busy()" (click)="accept()">
                Aceitar convite
              </button>
              <a class="co-ghost-btn" routerLink="/">Agora não</a>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--nx-bg);
      padding: 24px;
    }
    .card {
      width: min(420px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 28px;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    h1 {
      font-family: var(--nx-font-display);
      font-size: 20px;
      margin: 0 0 12px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.5;
    }
    .muted {
      color: var(--nx-text-mute);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
    }
    .actions .co-btn-primary {
      width: auto;
      flex: 1;
      height: 44px;
    }
  `,
})
export class ConviteEquipeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly context = inject(CoachContextService);
  private readonly firestore = createFirestore();
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  protected readonly state = signal<ScreenState>('loading');
  protected readonly invite = signal<InviteView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private inviteId = '';

  protected roleLabel(): string {
    const role = this.invite()?.role;
    return role ? ROLE_LABELS[role] : '';
  }

  protected roleSummary(): string {
    const role = this.invite()?.role;
    return role ? ROLE_SUMMARIES[role] : '';
  }

  async ngOnInit(): Promise<void> {
    this.inviteId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.inviteId) {
      this.state.set('not-found');
      return;
    }

    try {
      const snap = await getDoc(doc(this.firestore, 'coachStaffInvites', this.inviteId));
      if (!snap.exists()) {
        this.state.set('not-found');
        return;
      }

      const data = snap.data();
      const role = data['role'];
      if (!isCoachStaffRole(role)) {
        this.state.set('not-found');
        return;
      }
      const expiresAt = data['expiresAt'] as { toMillis?: () => number } | null | undefined;
      const view = inviteViewState(
        {
          status: data['status'],
          emailLower: data['emailLower'],
          expiresAtMs: typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : null,
        },
        this.auth.user()?.email ?? null,
        Date.now(),
      );
      this.invite.set({ coachUid: String(data['coachUid'] ?? ''), coachName: (data['coachName'] as string | undefined) ?? 'Treinador', role });
      this.state.set(view);
    } catch {
      // As rules só deixam o e-mail convidado (e a comissão) ler — o resto vira "não encontrado".
      this.state.set('not-found');
    }
  }

  protected async accept(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      const fn = httpsCallable<{ inviteId: string }, { coachUid: string; role: string }>(
        getFunctions(getApps()[0]!, FUNCTIONS_REGION),
        'acceptCoachStaffInvite',
      );
      const { data } = await fn({ inviteId: this.inviteId });
      await this.enterPanel(data.coachUid);
    } catch (err) {
      if ((err as { code?: string })?.code === 'functions/already-exists') {
        // Já é membro (resposta perdida / segundo aceite): trata como sucesso.
        try {
          await this.enterPanel(this.invite()?.coachUid ?? '');
        } catch (enterErr) {
          this.error.set(enterErr instanceof Error ? enterErr.message : 'Não foi possível entrar no painel.');
        }
        return;
      }
      this.error.set(err instanceof Error ? err.message : 'Não foi possível aceitar o convite.');
    } finally {
      this.busy.set(false);
    }
  }

  private async enterPanel(coachUid: string): Promise<void> {
    // A claim `coach` acabou de ser concedida: sem renovar o token o coachGuard barraria o novo membro.
    await this.auth.refreshClaims();
    // O espelho users/{uid}/coachStaff chega por trigger ~1 s depois; select() ignora uid ausente.
    if (coachUid && (await this.context.whenHasContext(coachUid, 10_000)) && !this.destroyed) {
      this.context.select(coachUid);
    }
    // Quem saiu da tela durante a espera (10 s) não deve ser levado a lugar nenhum.
    if (this.destroyed) {
      return;
    }
    await this.router.navigateByUrl('/painel');
  }

  protected async switchAccount(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signOutUser();
      await this.router.navigate(['/entrar'], { queryParams: { redirect: this.router.url } });
    } finally {
      this.busy.set(false);
    }
  }
}
