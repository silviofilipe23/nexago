import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { StoreBadgesService } from '../data/store-badges.service';
import { IconComponent, type PanelIconName } from './icon.component';

export interface NavLink {
  kind: 'link';
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  badge?: number;
}

export interface NavSoon {
  kind: 'soon';
  id: string;
  label: string;
  icon: PanelIconName;
  badge?: number;
}

export interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: PanelIconName;
  children: ReadonlyArray<NavLink | NavSoon>;
}

/** Um nível só de aninhamento: grupo não entra dentro de grupo. */
export type PanelNavItem = NavLink | NavSoon | NavGroup;

/** Contadores de exemplo: saem quando a Loja tiver backend. */
const LOJA_BADGES = { personalizados: 2 } as const;

const LOJA_GROUP: NavGroup = {
  kind: 'group',
  id: 'loja',
  label: 'Loja',
  icon: 'bag',
  children: [
    { kind: 'link', id: 'loja-visao-geral', label: 'Visão geral', icon: 'trend-up', route: '/painel/loja/visao-geral' },
    // Badge real: pedidos pagos esperando separação (StoreBadgesService).
    { kind: 'link', id: 'loja-pedidos', label: 'Pedidos', icon: 'file', route: '/painel/loja/pedidos' },
    {
      kind: 'soon',
      id: 'loja-personalizados',
      label: 'Personalizados',
      icon: 'edit',
      badge: LOJA_BADGES.personalizados,
    },
    {
      kind: 'link',
      id: 'loja-produtos',
      label: 'Produtos',
      icon: 'archive',
      route: '/painel/loja/produtos',
    },
    { kind: 'link', id: 'loja-estoque', label: 'Estoque', icon: 'archive', route: '/painel/loja/estoque' },
    {
      kind: 'link',
      id: 'loja-retirada',
      label: 'Retirada & frete',
      icon: 'swap',
      route: '/painel/loja/retirada',
    },
    {
      kind: 'link',
      id: 'loja-cupons',
      label: 'Cupons & promoções',
      icon: 'ticket',
      route: '/painel/loja/cupons',
    },
    // Badge real: solicitações para analisar (StoreBadgesService).
    { kind: 'link', id: 'loja-trocas', label: 'Trocas', icon: 'swap', route: '/painel/loja/trocas' },
  ],
};

const NAV_ITEMS: readonly PanelNavItem[] = [
  { kind: 'link', id: 'inicio', label: 'Início', icon: 'home', route: '/painel' },
  { kind: 'link', id: 'arenas', label: 'Arenas', icon: 'arena', route: '/painel/arenas' },
  {
    kind: 'link',
    id: 'arenas-pre-cadastro',
    label: 'Pré-cadastradas',
    icon: 'arena',
    route: '/painel/arenas/pre-cadastro',
  },
  { kind: 'link', id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios' },
  { kind: 'link', id: 'avaliacoes', label: 'Avaliações', icon: 'star', route: '/painel/avaliacoes' },
  {
    kind: 'link',
    id: 'organizadores',
    label: 'Organizadores',
    icon: 'id-badge',
    route: '/painel/organizadores',
  },
  { kind: 'link', id: 'atletas', label: 'Atletas', icon: 'users', route: '/painel/atletas' },
  { kind: 'link', id: 'financeiro', label: 'Financeiro', icon: 'cash', route: '/painel/financeiro' },
  LOJA_GROUP,
  { kind: 'soon', id: 'moderacao', label: 'Moderação', icon: 'shield' },
  { kind: 'link', id: 'equipe', label: 'Equipe', icon: 'team', route: '/painel/equipe' },
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
            @switch (item.kind) {
              @case ('link') {
                <a
                  class="nav-item"
                  [class.active]="activeId() === item.id"
                  [routerLink]="item.route"
                >
                  <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
                  <span>{{ item.label }}</span>
                </a>
              }
              @case ('soon') {
                <div class="nav-item disabled" title="Em breve">
                  <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
                  <span>{{ item.label }}</span>
                  <span class="soon">Em breve</span>
                </div>
              }
              @case ('group') {
                <button
                  type="button"
                  class="nav-item group"
                  [class.active]="routeOpenIds().has(item.id)"
                  [attr.aria-expanded]="openGroupIds().has(item.id)"
                  (click)="toggleGroup(item.id)"
                >
                  <bo-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
                  <span>{{ item.label }}</span>
                </button>

                @if (openGroupIds().has(item.id)) {
                  <div class="subnav">
                    @for (child of item.children; track child.id) {
                      @switch (child.kind) {
                        @case ('link') {
                          <a
                            class="nav-item"
                            [class.active]="activeId() === child.id"
                            [routerLink]="child.route"
                          >
                            <span>{{ child.label }}</span>
                            @if (badgeFor(child); as count) {
                              <span class="badge">{{ count }}</span>
                            }
                          </a>
                        }
                        @case ('soon') {
                          <div class="nav-item disabled" title="Em breve">
                            <span>{{ child.label }}</span>
                            @if (child.badge) {
                              <span class="badge">{{ child.badge }}</span>
                            }
                          </div>
                        }
                      }
                    }
                  </div>
                }
              }
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

    /* \`font: inherit\` aqui apagava a fonte do .nav-item (o grupo saía em Inter 16 px)
       e o <button> centraliza o texto por padrão: o grupo tem de ler igual aos links. */
    button.nav-item {
      width: 100%;
      background: transparent;
      border: none;
      text-align: left;
      cursor: pointer;
      transition: background 140ms var(--nx-ease-out);
    }

    button.nav-item:hover {
      background: var(--nx-surface-1);
    }

    /* Submenu (desenho 05): o rótulo do filho alinha com o do grupo (41 px), cada
       filho desenha o seu trecho do fio na linha do ícone, e o ativo ganha uma
       pílula laranja sobre o fio em vez da barra da borda. */
    .subnav {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin: 2px 0 6px;
    }

    .subnav .nav-item {
      height: 34px;
      font-size: 13px;
      font-weight: 500;
      gap: 10px;
      padding: 0 12px 0 41px;
      color: var(--nx-text-mute);
    }

    .subnav .nav-item::after {
      content: '';
      position: absolute;
      left: 20px;
      top: 0;
      bottom: -1px;
      width: 1px;
      background: var(--nx-line-strong);
    }

    /* "Em breve" no submenu fica legível como no desenho; só o cursor e o title avisam. */
    .subnav .nav-item.disabled {
      opacity: 1;
    }

    .subnav .nav-item.active {
      background: var(--nx-surface-1);
      color: var(--nx-text);
      font-weight: 700;
    }

    .subnav .nav-item.active::before {
      left: 18px;
      top: 50%;
      bottom: auto;
      width: 5px;
      height: 12px;
      border-radius: 3px;
      transform: translateY(-50%);
      z-index: 1;
    }

    .badge {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      font-weight: 700;
      min-width: 28px;
      height: 18px;
      padding: 0 5px;
      box-sizing: border-box;
      border-radius: var(--nx-r-pill);
      background: var(--nx-surface-2);
      color: var(--nx-text-mute);
      display: inline-grid;
      place-items: center;
    }

    /* Badge do item ativo acende em laranja, como no desenho. */
    .nav-item.active .badge {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
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
  private readonly badges = inject(StoreBadgesService);

  constructor() {
    // Só com sessão: o shell monta atrás do authGuard, mas a leitura exige admin.
    if (this.auth.user()) {
      void this.badges.load();
      void this.badges.loadReturns();
      void this.badges.loadOrders();
    }
  }

  protected badgeFor(item: NavLink | NavSoon): number | undefined {
    if (item.id === 'loja-estoque') {
      return this.badges.lowStock() || undefined;
    }
    if (item.id === 'loja-trocas') {
      return this.badges.returnsToReview() || undefined;
    }
    if (item.id === 'loja-pedidos') {
      return this.badges.ordersToPick() || undefined;
    }
    return item.badge;
  }

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
    if (path.startsWith('/painel/avaliacoes')) {
      return 'avaliacoes';
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
    if (path.startsWith('/painel/loja/visao-geral')) {
      return 'loja-visao-geral';
    }
    if (path.startsWith('/painel/loja/pedidos')) {
      return 'loja-pedidos';
    }
    if (path.startsWith('/painel/loja/produtos')) {
      return 'loja-produtos';
    }
    if (path.startsWith('/painel/loja/trocas')) {
      return 'loja-trocas';
    }
    if (path.startsWith('/painel/loja/estoque')) {
      return 'loja-estoque';
    }
    if (path.startsWith('/painel/loja/retirada')) {
      return 'loja-retirada';
    }
    if (path.startsWith('/painel/loja/cupons')) {
      return 'loja-cupons';
    }
    if (path === '/painel') {
      return 'inicio';
    }
    return null;
  });

  private readonly manualOpen = signal<{ url: string; ids: ReadonlySet<string> } | null>(null);

  /** Grupos que a rota ativa abre sozinha. */
  protected readonly routeOpenIds = computed<ReadonlySet<string>>(() => {
    const path = this.currentPath();
    const ids = new Set<string>();
    for (const item of NAV_ITEMS) {
      if (item.kind !== 'group') {
        continue;
      }
      if (item.children.some((c) => c.kind === 'link' && path.startsWith(c.route))) {
        ids.add(item.id);
      }
    }
    return ids;
  });

  /** O clique do usuário manda enquanto ele fica na mesma URL; navegar devolve o comando à rota. */
  protected readonly openGroupIds = computed<ReadonlySet<string>>(() => {
    const manual = this.manualOpen();
    return manual && manual.url === this.currentPath() ? manual.ids : this.routeOpenIds();
  });

  protected toggleGroup(id: string): void {
    const ids = new Set(this.openGroupIds());
    if (ids.has(id)) {
      ids.delete(id);
    } else {
      ids.add(id);
    }
    this.manualOpen.set({ url: this.currentPath(), ids });
  }

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );

  protected readonly initials = computed(() => initialsOf(this.displayName()));
}
