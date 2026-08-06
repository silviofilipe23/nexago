import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import type { ArenaArea } from '../data/arena-roles.model';
import { IconComponent, type PanelIconName } from './icon.component';
import { initialsOf } from './initials';

interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge: number | null;
  /** Área exigida; `null` = visível a todos; `'owner'` = só o dono. */
  area: ArenaArea | 'owner' | null;
}

const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel', badge: null, area: null },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda', badge: null, area: 'agenda' },
  { id: 'reservas', label: 'Reservas', icon: 'clock', route: '/painel/reservas', badge: null, area: 'agenda' },
  { id: 'horarios-fixos', label: 'Horários fixos', icon: 'repeat', route: '/painel/horarios-fixos', badge: null, area: 'agenda' },
  { id: 'clubinho', label: 'Clubinho', icon: 'users', route: '/painel/clubinho', badge: null, area: 'agenda' },
  { id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro', badge: null, area: 'financeiro' },
  { id: 'comandas', label: 'Comandas', icon: 'bookmark', route: '/painel/comandas', badge: null, area: 'comandas' },
  { id: 'estoque', label: 'Estoque', icon: 'box', route: '/painel/estoque', badge: null, area: 'estoque' },
  { id: 'promocoes', label: 'Promoções', icon: 'tag', route: '/painel/promocoes', badge: null, area: 'promocoes' },
  { id: 'cupons', label: 'Cupons', icon: 'tag', route: '/painel/cupons', badge: null, area: 'promocoes' },
  { id: 'horarios-pico', label: 'Horários de pico', icon: 'tag', route: '/painel/horarios-pico', badge: null, area: 'promocoes' },
  { id: 'links', label: 'Links', icon: 'share', route: '/painel/links', badge: null, area: 'site' },
  { id: 'meu-site', label: 'Meu site', icon: 'image', route: '/painel/meu-site', badge: null, area: 'site' },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios', badge: 2, area: 'torneios' },
  { id: 'quadras', label: 'Quadras', icon: 'courts', route: '/painel/quadras', badge: null, area: 'quadras' },
  { id: 'ocupacao', label: 'Ocupação', icon: 'chart-bar', route: '/painel/relatorios/ocupacao', badge: null, area: 'financeiro' },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'star', route: '/painel/avaliacoes', badge: null, area: 'comunidade' },
  { id: 'seguidores', label: 'Seguidores', icon: 'users', route: '/painel/seguidores', badge: null, area: 'comunidade' },
  { id: 'ranking', label: 'Ranking', icon: 'ranking', route: '/painel/ranking', badge: null, area: 'comunidade' },
  { id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe', badge: null, area: 'owner' },
  { id: 'planos', label: 'Planos', icon: 'card', route: '/painel/planos', badge: null, area: 'owner' },
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
          <img class="mark" src="/brand/logo.png" alt="" width="32" height="32" />
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Arena</div>
          </div>
        </div>

        <a class="switcher" routerLink="/painel/perfil" title="Ver perfil">
          <div class="switcher-avatar" aria-hidden="true">{{ arenaInitials() }}</div>
          <div class="switcher-body">
            <div class="switcher-name">{{ arenaName() }}</div>
          </div>
          <ar-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim)" />
        </a>

        @if (hasMultipleArenas()) {
          <a class="switch-arena-link" routerLink="/painel/selecionar-arena">
            <ar-icon name="repeat" [size]="12" />
            Trocar arena
          </a>
        }

        <nav class="nav">
          <div class="nav-kicker">Operação</div>
          @for (item of navItems(); track item.id) {
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

        <a class="user-row" routerLink="/painel/perfil" title="Ver perfil">
          <div class="avatar" aria-hidden="true">{{ userInitials() }}</div>
          <div class="who">
            <div class="who-name">{{ displayName() }}</div>
            <div class="who-role">Gestor</div>
          </div>
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
      height: 100dvh;
      display: grid;
      grid-template-columns: 236px 1fr;
      background: var(--nx-bg);
      color: var(--nx-text);
      overflow: hidden;
    }

    .sidebar {
      height: 100%;
      background: #070708;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 16px 14px;
      overflow: hidden;
      box-sizing: border-box;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 0 8px;
      flex: none;
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

    .switcher {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 12px;
      padding: 7px 10px;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      flex: none;
      text-decoration: none;
      transition: background 140ms var(--nx-ease-out);
    }

    .switcher:hover {
      background: var(--nx-surface-2);
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

    .switch-arena-link {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      padding: 0 10px;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-decoration: none;
      flex: none;
    }

    .switch-arena-link:hover {
      color: var(--nx-orange-500);
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-top: 14px;
      min-height: 0;
      overflow: hidden;
    }

    .nav-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding: 0 12px;
      margin-bottom: 6px;
      flex: none;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 34px;
      flex: none;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
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
      min-height: 0;
    }

    .user-row {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 10px;
      flex: none;
      cursor: pointer;
      text-decoration: none;
      border-radius: var(--nx-r-2);
      transition: background 140ms var(--nx-ease-out);
    }

    .user-row:hover {
      background: var(--nx-surface-1);
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
      height: 100%;
      overflow-y: auto;
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
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  /** Menu filtrado pelo que o cargo alcança. A detecção de rota ativa (abaixo) continua
   *  percorrendo `NAV_ITEMS` completo — não esta lista — senão o realce some quando o
   *  item correspondente à rota atual está fora do que o cargo pode ver. */
  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => {
      if (item.area == null) return true;
      if (item.area === 'owner') return this.access.isOwner();
      return this.access.canRead(item.area);
    }),
  );

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
    const exact = NAV_ITEMS.find((item) => item.route === path);
    if (exact) {
      return exact.id;
    }
    const nested = NAV_ITEMS.find((item) => item.route !== '/painel' && path.startsWith(item.route + '/'));
    return nested?.id ?? null;
  });

  /** Identidade da pessoa logada (gestor) — NÃO usar `auth.displayName()` aqui: esse campo do
   *  Firebase Auth guarda o nome da ARENA no cadastro self-service (`createArenaAccount`) e o
   *  nome da pessoa só em contas provisionadas por admin, então é ambíguo. O e-mail é o único
   *  identificador que é sempre da pessoa, nos dois fluxos. */
  protected readonly displayName = computed(() => this.auth.user()?.email || 'Conta');

  protected readonly arenaName = computed(() => this.arenaContext.arenaName() ?? 'Minha arena');
  protected readonly hasMultipleArenas = computed(() => this.arenaContext.managedArenas().length > 1);

  protected readonly userInitials = computed(() => initialsOf(this.displayName()));
  protected readonly arenaInitials = computed(() => initialsOf(this.arenaName()));
}
