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
import { fetchMyPendingPartnerInvites } from '../data/tournament-registrations-repository';
import { NxBannerComponent } from '../shared/feedback';

/** Rotas que o hub Competir agrupa — mantêm o item "Competir" aceso na bottom-nav mobile. */
const COMPETIR_PREFIXES = ['/competir', '/torneios', '/ligas', '/ranking', '/equipes', '/atletas'];

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
  imports: [RouterLink, RouterLinkActive, NxBannerComponent],
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

  /** Convites de parceiro pendentes — calculado aqui (não como input) pra aparecer em
   *  QUALQUER tela, não só quando a Agenda está montada e passa o próprio valor. */
  protected readonly agendaPendingCount = signal(0);

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
        this.agendaPendingCount.set(0);
        this.profilePhotoUrl.set(null);
        return;
      }
      fetchMyPendingPartnerInvites(db, uid)
        .then((invites) => this.agendaPendingCount.set(invites.length))
        .catch(() => this.agendaPendingCount.set(0));
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
