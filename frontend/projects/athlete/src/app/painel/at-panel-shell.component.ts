import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../auth/auth.service';

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

  protected async logout(): Promise<void> {
    await this.auth.signOutUser();
    await this.router.navigateByUrl('/');
  }
}
