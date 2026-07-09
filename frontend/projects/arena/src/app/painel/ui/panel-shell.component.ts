import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { IconComponent, type PanelIconName } from './icon.component';
import { initialsOf } from './initials';

interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge: number | null;
}

const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel', badge: null },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda', badge: null },
  { id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro', badge: null },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios', badge: 2 },
  { id: 'quadras', label: 'Quadras', icon: 'courts', route: '/painel/quadras', badge: null },
  { id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe', badge: null },
  { id: 'perfil', label: 'Perfil', icon: 'person', route: '/painel/perfil', badge: null },
];

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/** Shell do painel da arena: sidebar fixa (protótipo ArPanelShell/ArSidebar) + conteúdo projetado. */
@Component({
  selector: 'ar-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M5 4 L5 20 M19 4 L19 20 M5 4 L19 20" stroke="#0A0A0A" stroke-width="3.4" stroke-linecap="square" stroke-linejoin="miter" />
            </svg>
          </div>
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Arena</div>
          </div>
        </div>

        <div class="switcher">
          <div class="switcher-avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="switcher-body">
            <div class="switcher-name">{{ arenaName() }}</div>
            <div class="switcher-meta">1 unidade</div>
          </div>
          <ar-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim); transform: rotate(90deg)" />
        </div>

        <nav class="nav">
          <div class="nav-kicker">Operação</div>
          @for (item of navItems; track item.id) {
            <a class="nav-item" [class.active]="activeId() === item.id" [routerLink]="item.route">
              <ar-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
              <span>{{ item.label }}</span>
              @if (item.badge) {
                <span class="badge">{{ item.badge }}</span>
              }
            </a>
          }
        </nav>

        <div class="spacer"></div>

        <div class="nav-item disabled" title="Em breve">
          <ar-icon name="gear" [size]="17" [strokeWidth]="1.9" />
          <span>Configurações</span>
        </div>

        <div class="user-row">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <div class="who-name">{{ displayName() }}</div>
            <div class="who-role">Gestor</div>
          </div>
        </div>
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
      border-radius: 8px;
      background: var(--nx-orange-500);
      display: grid;
      place-items: center;
      flex: none;
      box-shadow: 0 0 0 1px rgba(255, 106, 26, 0.3);
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

    .switcher {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 18px;
      padding: 8px 10px;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .switcher-avatar {
      width: 28px;
      height: 28px;
      border-radius: 9px;
      flex: none;
      background: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 9px;
      color: #fff;
    }

    .switcher-body {
      flex: 1;
      min-width: 0;
    }

    .switcher-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .switcher-meta {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      color: var(--nx-text-dim);
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 22px;
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

    .nav-item .badge {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 10px;
      display: grid;
      place-items: center;
      flex: none;
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

  protected readonly activeId = computed(() => {
    const path = this.currentPath();
    return NAV_ITEMS.find((item) => item.route === path)?.id ?? null;
  });

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');

  protected readonly initials = computed(() => initialsOf(this.displayName()));
}
