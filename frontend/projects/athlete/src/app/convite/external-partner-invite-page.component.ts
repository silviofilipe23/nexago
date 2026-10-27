import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { athleteFunctions } from '../data/functions';
import {
  claimExternalPartnerInvite,
  TournamentRegistrationError,
  watchExternalPartnerInvite,
  type ExternalPartnerInvite,
} from '../data/tournament-registrations-repository';
import { fetchTournamentSummariesByIds } from '../data/tournaments-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { resolveExternalInviteGate, type ExternalInviteGate } from './partner-invite-gates';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

type ClosedGate = Exclude<ExternalInviteGate['kind'], 'open' | 'claimedByMe'>;

const CLOSED_COPY: Record<ClosedGate, { title: string; message: string }> = {
  own: {
    title: 'Este link é seu',
    message: 'Mande para quem vai jogar com você — quem abrir cria a conta e o convite chega pra ele.',
  },
  cancelled: { title: 'Convite cancelado', message: 'Quem te chamou desfez este convite.' },
  expired: { title: 'Convite expirado', message: 'Peça um link novo para quem te chamou.' },
  usedByOther: {
    title: 'Convite já usado',
    message: 'Outro atleta entrou por este link. Peça um novo para quem te chamou.',
  },
};

/** `/convite-dupla/:externalInviteId` — o link que quem se inscreve manda para o parceiro que
 *  ainda não tem conta. Espelha `TournamentExternalInvitePage` (Flutter).
 *
 *  Quem chega aqui já passou pelo cadastro e pelo onboarding (`signupFirstGuard` e os guards
 *  devolvem para cá pelo `?redirect=`): o convite de verdade exige um uid. "Entrar na dupla"
 *  resgata o token e segue para `/torneios-convite/:id`, onde o atleta aceita. */
@Component({
  selector: 'app-external-partner-invite-page',
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './external-partner-invite-page.component.html',
  styleUrl: './invite-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExternalPartnerInvitePageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly firestore = createFirestore();

  /** Parâmetro de rota — `withComponentInputBinding()` alimenta `input()`, nunca `signal()`. */
  readonly externalInviteId = input('');

  protected readonly invite = signal<ExternalPartnerInvite | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal(false);
  protected readonly tournamentName = signal<string | null>(null);
  protected readonly claiming = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Navegação para o convite já disparada — pelo resgate ou pelo snapshot de `claimed`. */
  private leaving = false;

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  protected readonly gate = computed<ExternalInviteGate | null>(() => {
    const invite = this.invite();
    return invite ? resolveExternalInviteGate(invite, this.auth.user()?.uid ?? null) : null;
  });

  protected readonly closedCopy = computed(() => {
    const kind = this.gate()?.kind;
    return kind && kind !== 'open' && kind !== 'claimedByMe' ? CLOSED_COPY[kind] : null;
  });

  /** Computed de string: a busca do torneio só refaz quando o id muda, não a cada snapshot. */
  protected readonly tournamentId = computed(() => this.invite()?.tournamentId ?? '');

  constructor() {
    effect((onCleanup) => {
      const id = this.externalInviteId().trim();
      const db = this.firestore;
      this.invite.set(null);
      this.loaded.set(false);
      this.loadError.set(false);
      if (!id || !db) {
        this.loaded.set(true);
        return;
      }
      const stop = watchExternalPartnerInvite(
        db,
        id,
        (invite) => {
          this.invite.set(invite);
          this.loaded.set(true);
        },
        () => {
          this.loadError.set(true);
          this.loaded.set(true);
        },
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const tournamentId = this.tournamentId();
      const db = this.firestore;
      this.tournamentName.set(null);
      if (!tournamentId || !db) return;
      let alive = true;
      onCleanup(() => (alive = false));
      fetchTournamentSummariesByIds(db, [tournamentId])
        .then((byId) => {
          if (alive) this.tournamentName.set(byId.get(tournamentId)?.name ?? null);
        })
        .catch(() => undefined);
    });

    // Já resgatado por este atleta (voltou ao link, outra aba): o convite de verdade é o destino.
    effect(() => {
      const gate = this.gate();
      if (gate?.kind === 'claimedByMe') this.goToInvite(gate.inviteId);
    });
  }

  protected async claim(): Promise<void> {
    const invite = this.invite();
    if (!invite || this.claiming()) return;
    this.claiming.set(true);
    this.error.set(null);
    try {
      const { inviteId } = await claimExternalPartnerInvite(athleteFunctions(), invite.id);
      this.goToInvite(inviteId);
    } catch (err) {
      this.error.set(err instanceof TournamentRegistrationError ? err.message : 'Não foi possível abrir o convite. Tente de novo.');
    } finally {
      this.claiming.set(false);
    }
  }

  /** `replaceUrl`: o token já foi gasto — voltar para cá não teria mais o que fazer. */
  private goToInvite(inviteId: string): void {
    if (this.leaving) return;
    this.leaving = true;
    void this.router.navigate(['/torneios-convite', inviteId], { replaceUrl: true });
  }
}
