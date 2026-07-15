import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OgAvatarComponent } from './ui/avatar.component';
import { OgIconComponent, type OgIconName } from './ui/icon.component';

interface OgNavEntry {
  label: string;
  icon: OgIconName;
  link: string;
  /** Início só fica ativo em `/painel` exato — senão ficaria sempre marcado (prefixo comum a tudo). */
  exact?: boolean;
}

const OG_NAV: OgNavEntry[] = [
  { label: 'Início', icon: 'home', link: '/painel', exact: true },
  { label: 'Torneios', icon: 'trophy', link: '/painel/torneios' },
  { label: 'Ligas', icon: 'flag', link: '/painel/ligas' },
  { label: 'Financeiro', icon: 'cash', link: '/painel/financeiro' },
];

/** Shell do painel do organizador — sidebar fixa (marca, navegação, usuário) + `<router-outlet/>`. */
@Component({
  selector: 'og-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, OgIconComponent, OgAvatarComponent],
  host: { class: 'og-shell' },
  template: `
    <nav class="og-sidebar">
      <a class="og-sidebar-brand" routerLink="/painel">
        <span class="og-sidebar-mark"><og-icon name="trophy" [size]="16" style="color:#0A0A0A" /></span>
        <span>
          <div class="og-sidebar-name">nexa<em>GO</em></div>
          <div class="og-sidebar-kicker">Organizador</div>
        </span>
      </a>

      <div class="og-nav">
        @for (item of nav; track item.link) {
          <a class="og-nav-item" [class.active]="isActive(item)" [routerLink]="item.link">
            <og-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
            <span class="og-nav-item-label">{{ item.label }}</span>
          </a>
        }
      </div>

      <div class="og-nav-spacer"></div>

      <div class="og-sidebar-user">
        <button type="button" class="og-sidebar-user-inner" (click)="signOut()">
          <og-avatar [initials]="initials()" [size]="32" />
          <span class="og-sidebar-user-body">
            <span class="og-sidebar-user-name">{{ displayName() }}</span>
            <span class="og-sidebar-user-role">Sair</span>
          </span>
          <og-icon name="chevron" [size]="13" style="color:var(--nx-text-dim)" />
        </button>
      </div>
    </nav>

    <div class="og-main">
      <router-outlet />
    </div>
  `,
})
export class PanelShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly nav = OG_NAV;

  protected readonly displayName = computed(
    () => this.auth.displayName() ?? this.auth.user()?.email ?? 'Organizador',
  );

  protected readonly initials = computed(() => {
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'OG';
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
  });

  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected isActive(item: OgNavEntry): boolean {
    const current = this.url();
    return item.exact ? current === item.link : current.startsWith(item.link);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
