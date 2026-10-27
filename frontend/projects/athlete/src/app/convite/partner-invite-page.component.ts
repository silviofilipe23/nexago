import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { watchPartnerInvite, type PartnerInviteOnLink } from '../data/tournament-registrations-repository';
import { fetchTournamentSummariesByIds } from '../data/tournaments-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { PartnerInviteFocus } from '../shared/partner-invite/partner-invite-focus';
import { resolvePartnerInviteGate, type PartnerInviteGate } from './partner-invite-gates';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

const CLOSED_COPY: Record<Exclude<PartnerInviteGate, 'pending' | 'accepted' | 'inviter'>, { title: string; message: string }> = {
  declined: { title: 'Convite recusado', message: 'Você recusou este convite.' },
  cancelled: { title: 'Convite cancelado', message: 'Quem te chamou desfez este convite.' },
  expired: { title: 'Convite expirado', message: 'O prazo para responder acabou. Peça um novo para quem te chamou.' },
  stale: { title: 'Convite fora de validade', message: 'Este convite não vale mais. Peça um novo para quem te chamou.' },
};

/** `/torneios-convite/:inviteId` — o convite de dupla/equipe já criado: o link que quem convida
 *  compartilha para cutucar o parceiro, e o destino do resgate do `/convite-dupla`.
 *
 *  A resposta não mora aqui: "Responder convite" abre o mesmo modal do anúncio automático
 *  (`AtInviteAnnouncerComponent`, via `PartnerInviteFocus`), que já carrega o termo LGPD, a
 *  confirmação de nível e a ida para a inscrição. A página é o chão por baixo dele — o estado
 *  do convite ao vivo, para quem adiou, recusou ou abriu o link de outro lado. */
@Component({
  selector: 'app-partner-invite-page',
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './partner-invite-page.component.html',
  styleUrl: './invite-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartnerInvitePageComponent {
  private readonly auth = inject(AuthService);
  private readonly focus = inject(PartnerInviteFocus);
  private readonly firestore = createFirestore();

  /** Parâmetro de rota — `withComponentInputBinding()` alimenta `input()`, nunca `signal()`. */
  readonly inviteId = input('');

  protected readonly invite = signal<PartnerInviteOnLink | null>(null);
  protected readonly loaded = signal(false);
  protected readonly tournamentName = signal<string | null>(null);
  /** O modal abre sozinho uma vez; depois de "Ver depois", só pelo botão. */
  private autoOpened = false;

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');
  protected readonly accountEmail = computed(() => this.auth.user()?.email ?? null);

  protected readonly gate = computed<PartnerInviteGate | null>(() => {
    const invite = this.invite();
    return invite ? resolvePartnerInviteGate(invite, this.auth.user()?.uid ?? null) : null;
  });

  protected readonly closedCopy = computed(() => {
    const gate = this.gate();
    return gate && gate !== 'pending' && gate !== 'accepted' && gate !== 'inviter' ? CLOSED_COPY[gate] : null;
  });

  protected readonly kindLabel = computed(() => (this.invite()?.isTeamInvite ? 'equipe' : 'dupla'));

  protected readonly inviteTitle = computed(() => {
    const invite = this.invite();
    if (!invite) return '';
    if (invite.isSubstitutionInvite) return `${invite.inviterName} te chamou como substituto`;
    const team = invite.isTeamInvite ? invite.teamName?.trim() : null;
    return team ? `${invite.inviterName} te chamou pra equipe ${team}` : `${invite.inviterName} te chamou pra ${this.kindLabel()}`;
  });

  /** Quem convidou abrindo o próprio link — vê como o parceiro respondeu. */
  protected readonly inviterMessage = computed(() => {
    const invite = this.invite();
    if (!invite) return '';
    if (invite.status === 'pending') return `Esperando ${invite.inviteeName} responder.`;
    if (invite.status === 'accepted') return `${invite.inviteeName} aceitou o convite.`;
    return 'Este convite não está mais valendo.';
  });

  /** Computed de string: a busca do torneio só refaz quando o id muda, não a cada snapshot. */
  protected readonly tournamentId = computed(() => this.invite()?.tournamentId ?? '');

  constructor() {
    effect((onCleanup) => {
      const id = this.inviteId().trim();
      const db = this.firestore;
      this.invite.set(null);
      this.loaded.set(false);
      if (!id || !db) {
        this.loaded.set(true);
        return;
      }
      // Convite de outra conta chega como erro (as rules só liberam os dois lados): mesma tela
      // do inexistente, que diz com qual conta o atleta entrou.
      const stop = watchPartnerInvite(
        db,
        id,
        (invite) => {
          this.invite.set(invite);
          this.loaded.set(true);
        },
        () => {
          this.invite.set(null);
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

    effect(() => {
      if (this.gate() !== 'pending' || this.autoOpened) return;
      this.autoOpened = true;
      this.respond();
    });

    inject(DestroyRef).onDestroy(() => this.focus.release(this.inviteId().trim()));
  }

  protected respond(): void {
    const invite = this.invite();
    if (invite) this.focus.request(invite.id);
  }
}
