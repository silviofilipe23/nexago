import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { OrganizerEventsTabComponent } from './organizer-events-tab.component';
import { OrganizerOverviewTabComponent } from './organizer-overview-tab.component';
import { OrganizerProfileHeaderComponent } from './organizer-profile-header.component';
import { OrganizerProfileStore } from './organizer-profile.store';
import { ORGANIZER_TABS, organizerHeaderVm, organizerTabFromParam } from './organizer-profile.vm';
import { OrganizerResultsTabComponent } from './organizer-results-tab.component';
import { OrganizerReviewsTabComponent } from './organizer-reviews-tab.component';

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  if (!local) return 'Atleta';
  return local
    .split(/[\s._-]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Perfil público do organizador (`/organizadores/:organizerId`).
 * Spec: docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md
 *
 * A aba ativa vive em `?aba=` (e não num signal local): "Ver agenda completa", "Ver os N" e
 * "Ver todas" são links comuns, e o link compartilhado abre na mesma aba.
 */
@Component({
  selector: 'app-organizer-profile',
  imports: [
    RouterLink,
    AtPanelShellComponent,
    NxPageLoadingComponent,
    OrganizerProfileHeaderComponent,
    OrganizerOverviewTabComponent,
    OrganizerEventsTabComponent,
    OrganizerResultsTabComponent,
    OrganizerReviewsTabComponent,
  ],
  providers: [OrganizerProfileStore],
  templateUrl: './organizer-profile.component.html',
  styleUrl: './organizer-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerProfileComponent {
  /** Parâmetro de rota (`withComponentInputBinding`) — tem de ser `input()`, nunca `signal()`. */
  readonly organizerId = input('');
  /** `?aba=` (também por `withComponentInputBinding`). */
  readonly aba = input<string | undefined>(undefined);

  protected readonly store = inject(OrganizerProfileStore);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(NxToastService);

  protected readonly accountLabel = computed(() => {
    const user = this.auth.user();
    if (user?.displayName?.trim()) return user.displayName.trim();
    if (user?.email?.trim()) return nameFromEmail(user.email);
    return nameFromEmail(this.auth.devEmail?.() ?? null);
  });

  protected readonly activeTab = computed(() => organizerTabFromParam(this.aba()));

  protected readonly header = computed(() => {
    const profile = this.store.profile();
    return profile ? organizerHeaderVm(profile, this.store.reputation(), this.store.followersCount()) : null;
  });

  protected readonly tabs = computed(() => {
    const events = this.store.upcoming().length + this.store.completed().length;
    return ORGANIZER_TABS.map((t) => ({ ...t, count: t.id === 'eventos' ? events : null }));
  });

  constructor() {
    effect(() => {
      const id = this.organizerId();
      untracked(() => void this.store.load(id));
    });
  }

  /** Copia o link do perfil (o portal não tem share sheet). */
  protected async share(): Promise<void> {
    const url = `${location.origin}/organizadores/${encodeURIComponent(this.store.organizerId())}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toasts.success('Link copiado', 'Cole onde quiser compartilhar o perfil.');
    } catch {
      this.toasts.error('Não foi possível copiar o link', url);
    }
  }
}
