import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth/auth.service';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'AT';
  }
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

@Component({
  selector: 'app-at-panel-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './at-panel-shell.component.html',
  styleUrl: './at-panel-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtPanelShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly userName = input('Atleta');
  readonly userLevel = input<string | null>(null);
  readonly agendaPendingCount = input(0);

  protected readonly initials = computed(() => initialsOf(this.userName()));

  protected async logout(): Promise<void> {
    await this.auth.signOutUser();
    await this.router.navigateByUrl('/');
  }
}
