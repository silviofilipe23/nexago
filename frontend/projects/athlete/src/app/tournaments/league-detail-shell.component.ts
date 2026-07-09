import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { getLeagueDetail } from './league-detail.mock';
import type { LeagueDetailData } from './league-detail.models';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

@Component({
  selector: 'app-league-detail-shell',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './league-detail-shell.component.html',
  styleUrl: './league-detail-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeagueDetailShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly leagueId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  protected readonly league = computed<LeagueDetailData | null>(() => {
    const id = this.leagueId();
    return id ? getLeagueDetail(id) : null;
  });

  protected readonly notice = signal<string | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  protected async shareLeague(): Promise<void> {
    const id = this.leagueId();
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const url = `${origin}/ligas/${id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.showNotice('Link copiado.');
        return;
      }
      this.showNotice('Copie o link manualmente.');
    } catch {
      this.showNotice('Não foi possível copiar agora.');
    }
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.notice.set(null), 3500);
  }
}
