import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ARENA_SPORT_CHIP_OPTIONS, type ArenaSportChip } from '@nexago/arena-discovery';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { getTeamProfile } from './team-profile.mock';

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
  selector: 'app-team-public-profile',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './team-public-profile.component.html',
  styleUrl: './team-public-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamPublicProfileComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly teamId = computed(() => this.route.snapshot.paramMap.get('teamId') ?? '');
  protected readonly team = computed(() => getTeamProfile(this.teamId()));

  protected readonly backPath = computed(() => {
    const from = this.route.snapshot.queryParamMap.get('from');
    return from === 'atletas' ? '/atletas' : '/equipes';
  });

  protected readonly followed = signal(false);
  protected readonly actionNotice = signal<string | null>(null);
  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected sportLabel(chip: ArenaSportChip): string {
    return ARENA_SPORT_CHIP_OPTIONS.find((o) => o.chip === chip)?.label ?? chip;
  }

  protected pointsLabel(points: number): string {
    return `${new Intl.NumberFormat('pt-BR').format(points)} pts`;
  }

  protected teamInitials(teamName: string): [string, string] {
    const [a, b] = teamName.split('&').map((part) => part.trim());
    const first = (a ?? teamName).slice(0, 2).toUpperCase();
    const second = (b ?? '').slice(0, 2).toUpperCase() || first;
    return [first, second];
  }

  protected toggleFollow(): void {
    this.followed.update((v) => !v);
  }

  protected sendMessage(): void {
    this.showNotice('Mensagens diretas chegam em breve por aqui.');
  }

  protected challengeTeam(): void {
    const name = this.team()?.teamName ?? 'esta equipe';
    this.showNotice(`Desafio para ${name} chega em breve por aqui.`);
  }

  protected viewAllMatches(): void {
    this.showNotice('Histórico completo chega em breve por aqui.');
  }

  private showNotice(message: string): void {
    this.actionNotice.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.actionNotice.set(null), 4000);
  }
}
