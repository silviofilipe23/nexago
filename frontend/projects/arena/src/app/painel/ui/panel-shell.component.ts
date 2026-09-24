import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { DrawerComponent } from './drawer.component';
import { IconComponent } from './icon.component';
import { initialsOf } from './initials';
import {
  NAV_ITEMS,
  buildNavSections,
  findActiveId,
  type ArenaNavGroup,
  type PanelNavItem,
} from './panel-nav.model';
import { PanelNavStateService, type StoredOpenGroup } from './panel-nav-state.service';
import { ViewportService } from './viewport.service';

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/** Shell do painel da arena: sidebar fixa (protótipo ArPanelShell/ArSidebar) + conteúdo projetado.
 *
 *  Abaixo do breakpoint compacto a sidebar sai e vira topbar + drawer pela esquerda; no celular
 *  soma-se a bottom-nav. Quem decide as faixas é a `ViewportService` — não este componente. */
@Component({
  selector: 'ar-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, NgTemplateOutlet, DrawerComponent],
  host: {
    '[class.compact]': 'viewport.isCompact()',
    '[class.phone]': 'viewport.isPhone()',
  },
  template: `
    @if (viewport.isCompact()) {
      <header class="topbar">
        <button
          type="button"
          class="nav-trigger"
          data-nav-trigger
          aria-label="Abrir menu de navegação"
          [attr.aria-expanded]="drawerOpen()"
          (click)="drawerOpen.set(true)"
        >
          <ar-icon name="home" [size]="18" [strokeWidth]="2" />
        </button>
        <div class="topbar-name">{{ arenaName() }}</div>
        <a class="topbar-avatar" routerLink="/painel/perfil" title="Ver perfil">{{ userInitials() }}</a>
      </header>
    }

    <div class="shell">
      @if (!viewport.isCompact()) {
        <aside class="sidebar">
          <ng-container [ngTemplateOutlet]="navTree" />
        </aside>
      }

      <div class="content">
        <ng-content />
      </div>
    </div>

    @if (viewport.isCompact() && drawerOpen()) {
      <ar-drawer side="left" ariaLabel="Menu de navegação" (close)="drawerOpen.set(false)">
        <ng-container [ngTemplateOutlet]="navTree" />
      </ar-drawer>
    }

    @if (viewport.isPhone()) {
      <nav class="bottom-nav" aria-label="Navegação principal">
        @for (item of bottomItems(); track item.id) {
          <a
            class="bottom-slot"
            data-bottom-slot
            [class.active]="activeId() === item.id"
            [routerLink]="item.route"
            [attr.aria-current]="activeId() === item.id ? 'page' : null"
          >
            <ar-icon [name]="item.icon" [size]="19" [strokeWidth]="1.9" />
            <span>{{ item.label }}</span>
          </a>
        }
        <button type="button" class="bottom-slot" data-bottom-slot (click)="drawerOpen.set(true)">
          <ar-icon name="gear" [size]="19" [strokeWidth]="1.9" />
          <span>Mais</span>
        </button>
      </nav>
    }

    <ng-template #navTree>
      <div class="brand">
        <img class="mark" src="/brand/logo.png" alt="" width="32" height="32" />
        <div class="wordmark">
          <div class="name">nexa<span>GO</span></div>
          <div class="tag">Arena</div>
        </div>
        @if (viewport.isCompact()) {
          <button
            type="button"
            class="drawer-close"
            aria-label="Fechar menu de navegação"
            (click)="drawerOpen.set(false)"
          >
            <ar-icon name="x" [size]="16" [strokeWidth]="2" />
          </button>
        }
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

      <nav class="nav" #navEl (scroll)="rememberScroll(navEl.scrollTop)">
        @for (section of sections(); track section.group) {
          @if (section.group === null) {
            @for (item of section.items; track item.id) {
              <ng-container [ngTemplateOutlet]="navLink" [ngTemplateOutletContext]="{ $implicit: item }" />
            }
          } @else {
            <button
              type="button"
              class="nav-group-head"
              [attr.aria-expanded]="isOpen(section.group)"
              (click)="toggleGroup(section.group)"
            >
              <span>{{ section.label }}</span>
              <ar-icon name="chevron-right" [size]="12" />
            </button>
            @if (isOpen(section.group)) {
              @for (item of section.items; track item.id) {
                <ng-container [ngTemplateOutlet]="navLink" [ngTemplateOutletContext]="{ $implicit: item }" />
              }
            }
          }
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
    </ng-template>

    <ng-template #navLink let-item>
      <a
        class="nav-item"
        [attr.data-nav-id]="item.id"
        [class.active]="activeId() === item.id"
        [attr.aria-current]="activeId() === item.id ? 'page' : null"
        [routerLink]="item.route"
        (click)="drawerOpen.set(false)"
      >
        <ar-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
        <span>{{ item.label }}</span>
        @if (item.badge) {
          <span class="badge">{{ item.badge }}</span>
        }
      </a>
    </ng-template>
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

    :host(.compact) .shell {
      height: calc(100dvh - 56px);
      grid-template-columns: minmax(0, 1fr);
    }

    :host(.phone) .content {
      padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
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

    /* Só existe dentro do drawer (viewport.isCompact() no template) -- na
       sidebar fixa do desktop fechar não faz sentido, já que ela nunca se
       fecha. Mesmo tamanho/alvo de toque do .nav-trigger da topbar (44px,
       var(--ar-tap)) porque os dois resolvem o mesmo problema: entrar e sair
       do drawer sem depender de Escape (teclado físico) ou do scrim, que o
       painel de 100%/420px de largura cobre por completo em qualquer celular
       (375/390/393/414px não sobra nada tocável fora do painel). */
    .drawer-close {
      width: var(--ar-tap);
      height: var(--ar-tap);
      margin-left: auto;
      flex: none;
      display: grid;
      place-items: center;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      cursor: pointer;
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
      /* era overflow: hidden -- é por isso que 10 dos 21 itens sumiam sem
         barra num MacBook Air 13". Com grupos a lista quase nunca rola, mas a
         invariante é que NUNCA se corte em silêncio. */
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .nav-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      height: var(--ar-nav-item-h);
      flex: none;
      padding: 0 12px;
      margin-top: 6px;
      border: 0;
      background: none;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      text-align: left;
    }

    .nav-group-head:hover {
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
    }

    /* o ícone é o mesmo aberto ou fechado -- PanelIconName não tem chevron-down
       -- então quem indica o estado é a rotação, não a troca de nome. Gira o
       HOST <ar-icon>, não o svg de dentro: o svg nasce no template do
       IconComponent, então carrega o atributo de escopo do IconComponent, não
       o do panel-shell -- um seletor daqui pra dentro do template do filho
       nunca casa sob encapsulamento emulado. O host, por estar escrito aqui,
       carrega o atributo certo. display: inline-flex resolve de quebra o
       display: inline padrão do custom element, que também impedia o
       transform de pegar. */
    .nav-group-head ar-icon {
      display: inline-flex;
      transition: transform 140ms var(--nx-ease-out);
    }

    .nav-group-head[aria-expanded='true'] ar-icon {
      transform: rotate(90deg);
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: var(--ar-nav-item-h);
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

    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 12px;
      height: 56px;
      padding: 0 12px;
      background: #070708;
      border-bottom: 1px solid var(--nx-line);
    }

    .nav-trigger {
      width: var(--ar-tap);
      height: var(--ar-tap);
      flex: none;
      display: grid;
      place-items: center;
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      color: var(--nx-text);
      cursor: pointer;
    }

    .topbar-name {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar-avatar {
      width: var(--ar-tap);
      height: var(--ar-tap);
      flex: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      color: var(--nx-orange-500);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 11px;
      text-decoration: none;
    }

    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: var(--ar-tap-gap);
      padding: 6px 8px;
      /* Nenhum env() existia no projeto; sem isto a barra fica embaixo da barra
         de gestos do iPhone. */
      padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
      background: #070708;
      border-top: 1px solid var(--nx-line);
    }

    .bottom-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-height: var(--ar-tap);
      border: 0;
      background: none;
      border-radius: var(--nx-r-2);
      cursor: pointer;
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 10px;
      text-decoration: none;
    }

    .bottom-slot.active {
      color: var(--nx-orange-500);
    }

    @media (pointer: coarse) {
      .nav {
        gap: var(--ar-tap-gap);
      }

      /* .switch-arena-link e .user-row não usam --ar-nav-item-h (esse token
         só cobre .nav-item/.nav-group-head) -- por isso o alvo de toque de
         44px da Task 2 nunca alcançava os dois. min-height (não height) para
         não brigar com o conteúdo intrínseco se algum dia crescer; os dois já
         tem align-items: center, então o conteúdo recentraliza sozinho na
         caixa mais alta. */
      .switch-arena-link {
        min-height: var(--ar-tap);
        margin-top: var(--ar-tap-gap);
      }

      .user-row {
        min-height: var(--ar-tap);
      }
    }
  `,
})
export class PanelShellComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly navState = inject(PanelNavStateService);
  protected readonly viewport = inject(ViewportService);

  protected readonly drawerOpen = signal(false);

  /** Itens fixos da bottom-nav, na ordem. O slot que o cargo não alcança cai
   *  para o próximo permitido, para nunca sobrar buraco; "Mais" é um botão à
   *  parte no template e garante que nada fique só-por-URL. */
  private static readonly BOTTOM_PREFERENCE = [
    'inicio',
    'agenda',
    'reservas',
    'comandas',
    'estoque',
    'financeiro',
  ];

  private canSee(item: PanelNavItem): boolean {
    if (item.area == null) return true;
    if (item.area === 'owner') return this.access.isOwner();
    return this.access.canRead(item.area);
  }

  protected readonly sections = computed(() =>
    buildNavSections(NAV_ITEMS, (item) => this.canSee(item)),
  );

  protected readonly bottomItems = computed(() => {
    const visiveis = NAV_ITEMS.filter((item) => this.canSee(item));
    const ordenado = PanelShellComponent.BOTTOM_PREFERENCE.map((id) =>
      visiveis.find((item) => item.id === id),
    ).filter((item): item is PanelNavItem => item != null);
    // 4 + o botão "Mais" do template = 5, o teto recomendado.
    return ordenado.slice(0, 4);
  });

  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => pathOnly(this.router.url)),
      startWith(pathOnly(this.router.url)),
    ),
    { initialValue: pathOnly(this.router.url) },
  );

  protected readonly activeId = computed(() => findActiveId(this.currentPath()));

  /** Grupo aberto: o da rota atual quando ainda não há escolha guardada.
   *  `null` = nada guardado (usa o fallback da rota ativa); `'none'` = o
   *  usuário fechou tudo de propósito e o fallback NÃO se aplica mais --
   *  sem esse terceiro estado, fechar o grupo da rota ativa gravava `null`,
   *  isOpen caía de volta no fallback, e o grupo reabria sozinho. */
  private readonly storedGroup = signal<StoredOpenGroup>(null);

  protected isOpen(group: ArenaNavGroup): boolean {
    const guardado = this.storedGroup();
    if (guardado === 'none') return false;
    if (guardado != null) return guardado === group;
    const active = this.activeId();
    return NAV_ITEMS.find((item) => item.id === active)?.group === group;
  }

  protected toggleGroup(group: ArenaNavGroup): void {
    const proximo: ArenaNavGroup | 'none' = this.isOpen(group) ? 'none' : group;
    this.storedGroup.set(proximo);
    this.navState.setOpenGroup(this.arenaContext.arenaId(), proximo);
  }

  private readonly navEl = viewChild<ElementRef<HTMLElement>>('navEl');
  private lastScrollTop: number | null = null;
  private scrollFlush: ReturnType<typeof setTimeout> | null = null;

  /** Restaura o grupo aberto e a rolagem quando o `arenaId` resolve — na carga
   *  fria ele começa `null` até o Firestore responder, então ler uma vez só no
   *  inicializador do campo (fora de um efeito) perderia a escolha guardada.
   *  `toggleGroup` grava direto no signal; este efeito só re-sincroniza quando
   *  o `arenaId` muda, nunca por causa da própria escrita do toggle. */
  constructor() {
    effect(() => {
      this.storedGroup.set(this.navState.openGroup(this.arenaContext.arenaId()));
    });

    effect(() => {
      const el = this.navEl()?.nativeElement;
      if (!el) return;
      const saved = this.navState.scrollTop(this.arenaContext.arenaId());
      if (saved > 0) el.scrollTop = saved;
    });
  }

  /** `(scroll)` dispara a cada quadro. Gravar direto seria uma escrita síncrona
   *  no `localStorage` dentro do caminho de rolagem — guarda o último valor e
   *  grava uma vez por janela de 200ms. */
  protected rememberScroll(value: number): void {
    this.lastScrollTop = value;
    if (this.scrollFlush != null) return;
    this.scrollFlush = setTimeout(() => this.flushScroll(), 200);
  }

  private flushScroll(): void {
    if (this.scrollFlush != null) {
      clearTimeout(this.scrollFlush);
      this.scrollFlush = null;
    }
    if (this.lastScrollTop != null) {
      this.navState.setScrollTop(this.arenaContext.arenaId(), this.lastScrollTop);
      this.lastScrollTop = null;
    }
  }

  /** O destroy é a cada navegação — é exatamente quando o valor precisa estar
   *  gravado, então a janela de 200ms pendente é descarregada aqui. */
  ngOnDestroy(): void {
    this.flushScroll();
  }

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
