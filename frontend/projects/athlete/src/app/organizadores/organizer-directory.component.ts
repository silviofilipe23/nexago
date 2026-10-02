import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { OrganizerPublicProfileSource } from '../data/organizer-public-profile-repository';
import type { OrganizerPublicProfile, OrganizerReputationDetail } from '../data/organizer-public-profiles';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { filterOrganizers, organizerDirectoryCardVm, sortOrganizers } from './organizer-directory.vm';

type DirectoryStatus = 'loading' | 'ready' | 'error';

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  if (!local) return 'Atleta';
  return local
    .split(/[\s._-]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/** Lista "Organizadores" (`/organizadores`): `organizerPublicProfiles where listed == true`, busca
 *  no cliente por nome e cidade. A nota de cada card chega depois (leitura em lote), sem segurar
 *  a lista. */
@Component({
  selector: 'app-organizer-directory',
  imports: [RouterLink, AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './organizer-directory.component.html',
  styleUrl: './organizer-directory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerDirectoryComponent {
  private readonly source = inject(OrganizerPublicProfileSource);
  private readonly auth = inject(AuthService);

  protected readonly status = signal<DirectoryStatus>('loading');
  protected readonly errorDetail = signal<string | null>(null);
  private readonly organizers = signal<readonly OrganizerPublicProfile[]>([]);
  private readonly reputations = signal<ReadonlyMap<string, OrganizerReputationDetail>>(new Map());
  protected readonly query = signal('');
  /** Logos que falharam ao carregar: o card cai nas iniciais. */
  protected readonly failedLogos = signal<ReadonlySet<string>>(new Set());

  protected readonly accountLabel = computed(() => {
    const user = this.auth.user();
    if (user?.displayName?.trim()) return user.displayName.trim();
    if (user?.email?.trim()) return nameFromEmail(user.email);
    return nameFromEmail(this.auth.devEmail?.() ?? null);
  });

  protected readonly total = computed(() => this.organizers().length);

  protected readonly cards = computed(() => {
    const reputations = this.reputations();
    return sortOrganizers(filterOrganizers(this.organizers(), this.query())).map((p) =>
      organizerDirectoryCardVm(p, reputations.get(p.uid) ?? null),
    );
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    this.errorDetail.set(null);
    try {
      const organizers = await this.source.fetchListedOrganizers();
      this.organizers.set(organizers);
      this.status.set('ready');
      const reputations = await this.source.fetchReputations(organizers.map((o) => o.uid)).catch(() => new Map());
      this.reputations.set(reputations);
    } catch (err) {
      const message = (err as { message?: unknown } | null)?.message;
      this.errorDetail.set(typeof message === 'string' ? message.replace(/^Firebase:\s*/i, '') : null);
      this.status.set('error');
    }
  }

  protected onLogoError(organizerId: string): void {
    this.failedLogos.update((ids) => new Set([...ids, organizerId]));
  }

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
