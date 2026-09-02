import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { filter, map, startWith } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { fetchMyAthleteProfile } from '../data/my-athlete-profile-repository';
import { PartnerInvitesService } from '../data/partner-invites.service';
import { StaffTournamentsService } from '../data/staff-tournaments.service';
import { NxBannerComponent } from '../shared/feedback';
import { AtInviteAnnouncerComponent } from '../shared/partner-invite/at-invite-announcer.component';

/** Rotas que o hub Competir agrupa — mantêm o item "Competir" aceso na bottom-nav mobile. */
const COMPETIR_PREFIXES = ['/competir', '/torneios', '/ligas', '/ranking', '/equipes', '/atletas'];

/** Wizard de inscrição: bottom-nav atrapalha o fluxo focado (CTA do passo + voltar). */
function isRegistrationFlowUrl(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return /^\/torneios\/[^/]+\/inscricao(?:\/|$)/.test(path);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AT';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

@Component({
  selector: 'app-at-panel-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NxBannerComponent, AtInviteAnnouncerComponent],
  templateUrl: './at-panel-shell.component.html',
  styleUrl: './at-panel-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtPanelShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly firestore = createFirestore();

  readonly userName = input('Atleta');
  readonly userLevel = input<string | null>(null);

  protected readonly initials = computed(() => initialsOf(this.userName()));

  /** Foto enviada no onboarding (Firestore `users/{uid}.profilePhotoUrl`) tem prioridade;
   *  cai pro `photoURL` do Firebase Auth (Google/Apple) quando não há uma. */
  private readonly profilePhotoUrl = signal<string | null>(null);
  protected readonly avatarUrl = computed(() => this.profilePhotoUrl() ?? this.auth.user()?.photoURL ?? null);

  /** Convites de parceiro pendentes — do store (não como input) pra aparecer em QUALQUER
   *  tela, não só quando a Agenda está montada e passa o próprio valor, e pra acender no
   *  instante em que o convite chega. */
  protected readonly agendaPendingCount = inject(PartnerInvitesService).pendingCount;

  /** Torneios em andamento que o atleta opera — acende o item "Mesa". Vem do store pelo mesmo
   *  motivo dos convites: entrar na equipe é gesto do organizador e o menu tem de acender no
   *  instante em que isso acontece, em qualquer tela. */
  protected readonly staffCount = inject(StaffTournamentsService).count;

  constructor() {
    const syncOnline = () => this.offline.set(!navigator.onLine);
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    });

    effect(() => {
      const uid = this.auth.user()?.uid;
      const db = this.firestore;
      if (!uid || !db) {
        this.profilePhotoUrl.set(null);
        return;
      }
      fetchMyAthleteProfile(db, uid)
        .then((profile) => this.profilePhotoUrl.set(profile?.profilePhotoUrl ?? null))
        .catch(() => this.profilePhotoUrl.set(null));
    });
  }

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly competirSectionActive = computed(() => {
    const current = this.url().split('?')[0] ?? '';
    return COMPETIR_PREFIXES.some((p) => current.startsWith(p));
  });

  protected readonly hideBottomNav = computed(() => isRegistrationFlowUrl(this.url()));

  /** Banner de estado do sistema: enquanto não há rede, quase toda ação do
   *  portal (reservar, pagar, inscrever) falha no meio do caminho. Avisar antes
   *  vale mais que deixar cada tela errar sozinha. */
  protected readonly offline = signal(typeof navigator !== 'undefined' && !navigator.onLine);

  protected reload(): void {
    location.reload();
  }

  protected async logout(): Promise<void> {
    await this.auth.signOutUser();
    await this.router.navigateByUrl('/');
  }
}
