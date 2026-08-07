import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { IconComponent, type PanelIconName } from './icon.component';

interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string | null;
}

const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel' },
  { id: 'arenas', label: 'Arenas', icon: 'arena', route: '/painel/arenas' },
  {
    id: 'arenas-pre-cadastro',
    label: 'Pré-cadastradas',
    icon: 'arena',
    route: '/painel/arenas/pre-cadastro',
  },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios' },
  { id: 'organizadores', label: 'Organizadores', icon: 'id-badge', route: '/painel/organizadores' },
  { id: 'atletas', label: 'Atletas', icon: 'users', route: '/painel/atletas' },
  { id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro' },
  { id: 'moderacao', label: 'Moderação', icon: 'shield', route: null },
  { id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe' },
];

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '·';
  }
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Shell do painel: sidebar fixa (protótipo BoPanelShell/BoSidebar) + conteúdo projetado. */
@Component({
  selector: 'bo-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="mark" src="/brand/logo.png" alt="" width="32" height="32" />
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Backoffice</div>
          </div>
        </div>

        <nav class="nav">
          <div class="nav-kicker">Operação</div>
          @for (item of navItems; track item.id) {
            @if (item.route) {
              <a
                class="nav-item"
                [class.active]="activeId() === item.id"
                [routerLink]="item.route"
              >
                <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
                <span>{{ item.label }}</span>
              </a>
            } @else {
              <div class="nav-item disabled" title="Em breve">
                <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
                <span>{{ item.label }}</span>
                <span class="soon">Em breve</span>
              </div>
            }
          }
        </nav>

        <div class="spacer"></div>

        <div class="nav-item disabled" title="Em breve">
          <bo-icon name="gear" [size]="17" [strokeWidth]="1.9" />
          <span>Configurações</span>
        </div>

        <a class="user-row" [class.active]="profileActive()" routerLink="/painel/perfil">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <div class="who-name">{{ displayName() }}</div>
            <div class="who-role">Admin</div>
          </div>
          <bo-icon name="chevron-right" [size]="13" />
        </a>
      </aside>

      <div class="content">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .shell {
      min-height: 100dvh;
      display: grid;
      grid-template-columns: 236px 1fr;
      background: var(--nx-bg);
      color: var(--nx-text);
    }

    .sidebar {
      background: #070708;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 20px 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 2px 8px 0;
    }

    .mark {
      width: 32px;
      height: 32px;
      flex: none;
      display: block;
      object-fit: contain;
    }

    .wordmark {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .wordmark .name {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 15px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
    }

    .wordmark .name span {
      color: var(--nx-orange-500);
    }

    .wordmark .tag {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 26px;
    }

    .nav-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding: 0 12px;
      margin-bottom: 8px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 40px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      letter-spacing: -0.005em;
      position: relative;
      text-decoration: none;
    }

    a.nav-item {
      cursor: pointer;
      transition: background 140ms var(--nx-ease-out);
    }

    a.nav-item:hover {
      background: var(--nx-surface-1);
    }

    .nav-item.active {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .nav-item.active span:first-of-type {
      color: var(--nx-text);
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      left: -14px;
      top: 10px;
      bottom: 10px;
      width: 3px;
      border-radius: 2px;
      background: var(--nx-orange-500);
    }

    .nav-item.disabled {
      opacity: 0.45;
      cursor: default;
    }

    .nav-item span:first-of-type {
      flex: 1;
    }

    .nav-item .soon {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .spacer {
      flex: 1;
    }

    .user-row {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 8px 0;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .user-row > .avatar {
      margin-top: -14px;
    }

    .user-row.active .avatar,
    .user-row.active .who {
      margin-top: 0;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex: none;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      color: var(--nx-orange-500);
    }

    .who {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
      flex: 1;
    }

    .who-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .who-role {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .content {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 100dvh;
    }

    @media (max-width: 900px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        display: none;
      }
    }
  `,
})
export class PanelShellComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly navItems = NAV_ITEMS;

  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => pathOnly(this.router.url)),
      startWith(pathOnly(this.router.url)),
    ),
    { initialValue: pathOnly(this.router.url) },
  );

  protected readonly profileActive = computed(() => this.currentPath().startsWith('/painel/perfil'));
  protected readonly activeId = computed(() => {
    const path = this.currentPath();
    // Antes de '/painel/arenas': o prefixo do pré-cadastro é mais específico.
    if (path.startsWith('/painel/arenas/pre-cadastro')) {
      return 'arenas-pre-cadastro';
    }
    if (path.startsWith('/painel/arenas')) {
      return 'arenas';
    }
    if (path.startsWith('/painel/torneios')) {
      return 'torneios';
    }
    if (path.startsWith('/painel/organizadores')) {
      return 'organizadores';
    }
    if (path.startsWith('/painel/financeiro')) {
      return 'financeiro';
    }
    if (path.startsWith('/painel/equipe')) {
      return 'equipe';
    }
    if (path.startsWith('/painel/atletas')) {
      return 'atletas';
    }
    if (path === '/painel') {
      return 'inicio';
    }
    return null;
  });

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );

  protected readonly initials = computed(() => initialsOf(this.displayName()));
}
