import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent, type OgIconName } from '../ui/icon.component';

interface OgNavEntry {
  label: string;
  icon: OgIconName;
  link: string;
  matchPrefixes: string[];
  badge?: number;
}

const OG_NAV: OgNavEntry[] = [
  { label: 'Início', icon: 'home', link: '/painel/inicio', matchPrefixes: ['/painel/inicio'] },
  { label: 'Meus eventos', icon: 'trophy', link: '/painel/eventos', matchPrefixes: ['/painel/eventos'] },
  { label: 'Criar evento', icon: 'plus', link: '/painel/novo-torneio', matchPrefixes: ['/painel/novo-torneio', '/painel/nova-liga', '/painel/nova-etapa'] },
  { label: 'Inscrições', icon: 'users', link: '/painel/inscricoes', matchPrefixes: ['/painel/inscricoes'] },
  { label: 'Chaveamento & Jogos', icon: 'bracket', link: '/painel/chaveamento', matchPrefixes: ['/painel/chaveamento'] },
  { label: 'Financeiro', icon: 'cash', link: '/painel/financeiro', matchPrefixes: ['/painel/financeiro'] },
  { label: 'Comunicação', icon: 'mail', link: '/painel/comunicacao', matchPrefixes: ['/painel/comunicacao'], badge: 3 },
];

/** Shell do painel do organizador — sidebar fixa com navegação + área de conteúdo roteada. */
@Component({
  selector: 'og-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, OgIconComponent, OgAvatarComponent],
  host: { class: 'og-shell' },
  template: `
    <nav class="og-sidebar">
      <a class="og-sidebar-brand" routerLink="/painel/inicio">
        <span class="og-sidebar-mark"><og-icon name="trophy" [size]="16" style="color:#0A0A0A" /></span>
        <span>
          <div class="og-sidebar-name">nexa<em>GO</em></div>
          <div class="og-sidebar-kicker">Organizador</div>
        </span>
      </a>

      <button type="button" class="og-event-switcher">
        <span class="og-event-switcher-icon"><og-icon name="trophy" [size]="14" /></span>
        <span class="og-event-switcher-body">
          <!-- mock (fase 2): switcher de evento ainda não funcional -->
          <span class="og-event-switcher-name">Meus eventos</span>
          <span class="og-event-switcher-sub">4 eventos ativos</span>
        </span>
        <og-icon name="chevron" [size]="13" style="color:var(--nx-text-dim);transform:rotate(90deg)" />
      </button>

      <div class="og-nav">
        <div class="og-nav-label">Operação</div>
        @for (item of nav; track item.link) {
          <a class="og-nav-item" [class.active]="isActive(item)" [routerLink]="item.link">
            <og-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
            <span class="og-nav-item-label">{{ item.label }}</span>
            @if (item.badge) {
              <span class="og-nav-badge">{{ item.badge }}</span>
            }
          </a>
        }
      </div>

      <div class="og-nav-spacer"></div>

      <div class="og-nav">
        <a class="og-nav-item" routerLink="/painel/config" [class.active]="url().startsWith('/painel/config')">
          <og-icon name="gear" [size]="17" [strokeWidth]="1.9" />
          <span class="og-nav-item-label">Configurações</span>
        </a>
      </div>

      <div class="og-sidebar-user">
        <button type="button" class="og-sidebar-user-inner" (click)="signOut()">
          <og-avatar initials="RS" [size]="32" />
          <span class="og-sidebar-user-body">
            <span class="og-sidebar-user-name">Rafael Souza</span>
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
    return item.matchPrefixes.some((p) => current.startsWith(p));
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
