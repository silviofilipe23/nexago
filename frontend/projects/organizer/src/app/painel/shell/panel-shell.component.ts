import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { isPushSupported, pushPermissionStatus, subscribeToPush } from '@nexago/push-notifications';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { organizerFirestore } from '../data/firestore';
import { listOrganizerNames } from '../data/tournaments-repository';
import { tournamentUsesUniform } from '../data/uniforms';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent, type OgIconName } from '../ui/icon.component';
import { OgPersonPhotoComponent } from '../ui/person-photo.component';
import { OgBellComponent } from './og-bell.component';
import { PanelContextService } from './panel-context.service';

/** Só pergunta uma vez por navegador — negou ou aceitou, não insiste de novo a cada login. */
const PUSH_PROMPT_KEY = 'nexago-organizer-push-prompted';

interface OgNavEntry {
  label: string;
  icon: OgIconName;
  link: string;
  /** Prefixos de URL que marcam o item como ativo; vazio = só a URL exata do link. */
  matchPrefixes?: string[];
}

const SECTION_LABEL = { global: 'Geral', liga: 'Liga', torneio: 'Torneio', categoria: 'Categoria' } as const;

const CONTEXT_ICON = { liga: 'flag', torneio: 'trophy', categoria: 'bracket' } as const;

const CONTEXT_KICKER = { liga: 'Liga', torneio: 'Torneio', categoria: 'Categoria' } as const;

/** Abaixo desta largura a sidebar não cabe ao lado do conteúdo e vira gaveta.
 *  Espelha o `@media (max-width: 1023.98px)` do styles.scss — os dois andam juntos. */
const COMPACT_QUERY = '(max-width: 1023.98px)';

/**
 * `managerId` do torneio aberto quando ele é de OUTRA pessoa e quem olha é super
 * admin — é o gatilho da faixa de suporte. Devolve `null` no caso normal
 * (torneio próprio, organizador comum, ou nenhum torneio em contexto), inclusive
 * pro super admin dentro do próprio torneio: ali não há nada a avisar.
 */
export function foreignTournamentOwnerId(params: {
  isSuperAdmin: boolean;
  uid: string | null | undefined;
  managerId: string | null | undefined;
}): string | null {
  const { isSuperAdmin, uid, managerId } = params;
  if (!isSuperAdmin || !uid || !managerId || managerId === uid) return null;
  return managerId;
}

/** "silvio.dionizio" → "Silvio Dionizio" — fallback de nome quando o Auth não tem displayName. */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function initialsOfName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase() || '—';
}

/** Shell do painel do organizador — navegação em cascata (Portal → Torneio → Categoria).
 *  A sidebar é contextual: os itens trocam conforme o nível derivado da rota
 *  (`PanelContextService`), com link de voltar e card do torneio/categoria em contexto. */
@Component({
  selector: 'og-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterOutlet, OgIconComponent, OgAvatarComponent, OgPersonPhotoComponent, OgBellComponent],
  host: {
    class: 'og-shell',
    '[class.drawer-open]': 'drawerOpen()',
    '(document:click)': 'userMenuOpen.set(false)',
    '(document:keydown.escape)': 'onEscape()',
  },
  template: `
    <nav id="og-sidebar" class="og-sidebar" [attr.inert]="compact() && !drawerOpen() ? '' : null">
      <button
        #drawerClose
        type="button"
        class="og-drawer-close"
        aria-label="Fechar menu"
        (click)="closeDrawer()"
      >
        <og-icon name="close" [size]="18" [strokeWidth]="2" />
      </button>

      <a class="og-sidebar-brand" routerLink="/painel/inicio">
        <img class="og-sidebar-mark" src="/brand/logo.png" alt="" width="32" height="32" />
        <span>
          <div class="og-sidebar-name">nexa<em>GO</em></div>
          <div class="og-sidebar-kicker">Organizador</div>
        </span>
      </a>

      @if (ctx.level() !== 'global') {
        <a class="og-side-back" [routerLink]="backLink()">
          <og-icon name="back" [size]="14" />
          <span>{{ backLabel() }}</span>
        </a>
        <div class="og-side-context">
          <span class="og-side-context-icon">
            <og-icon [name]="contextIcon()" [size]="14" />
          </span>
          <span class="og-side-context-body">
            <span class="og-side-context-kicker">{{ contextKicker() }}</span>
            <span class="og-side-context-name">{{ contextName() }}</span>
            <span class="og-side-context-meta">{{ contextMeta() }}</span>
          </span>
        </div>
      }

      <div class="og-nav" [style.margin-top.px]="ctx.level() === 'global' ? 26 : 18">
        <div class="og-nav-label">{{ sectionLabel() }}</div>
        @for (item of nav(); track item.link) {
          <a class="og-nav-item" [class.active]="isActive(item)" [routerLink]="item.link">
            <og-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
            <span class="og-nav-item-label">{{ item.label }}</span>
          </a>
        }
      </div>

      <div class="og-nav-spacer"></div>

      <div class="og-nav">
        @if (ctx.level() === 'torneio') {
          <a class="og-nav-item" routerLink="/painel/novo-torneio" [queryParams]="{ editar: ctx.tournamentId() }">
            <og-icon name="edit" [size]="17" [strokeWidth]="1.9" />
            <span class="og-nav-item-label">Editar torneio</span>
          </a>
        } @else if (ctx.level() === 'global') {
          <a class="og-nav-item" routerLink="/painel/config" [class.active]="url().startsWith('/painel/config')">
            <og-icon name="gear" [size]="17" [strokeWidth]="1.9" />
            <span class="og-nav-item-label">Configurações</span>
          </a>
        }
      </div>

      <div class="og-sidebar-user">
        @if (userMenuOpen()) {
          <div class="og-user-menu" role="menu" (click)="$event.stopPropagation()">
            <a class="og-user-menu-item" role="menuitem" routerLink="/painel/config" (click)="userMenuOpen.set(false)">
              <og-icon name="gear" [size]="15" [strokeWidth]="1.9" />Configurações
            </a>
            <div class="og-user-menu-sep"></div>
            <button type="button" class="og-user-menu-item danger" role="menuitem" (click)="signOut()">
              <og-icon name="logout" [size]="15" [strokeWidth]="1.9" />Sair da conta
            </button>
          </div>
        }
        <button
          type="button"
          class="og-sidebar-user-inner"
          aria-haspopup="menu"
          [attr.aria-expanded]="userMenuOpen()"
          (click)="toggleUserMenu($event)"
        >
          <og-avatar [initials]="userInitials()" [photoUrl]="userPhoto()" [size]="32" />
          <span class="og-sidebar-user-body">
            <span class="og-sidebar-user-name">{{ userName() }}</span>
            <span class="og-sidebar-user-role">{{ userSubLabel() }}</span>
          </span>
          <og-icon name="chevron" [size]="13" class="og-user-caret" [class.open]="userMenuOpen()" />
        </button>
      </div>
    </nav>

    @if (drawerOpen()) {
      <button type="button" class="og-scrim" aria-label="Fechar menu" (click)="closeDrawer()"></button>
    }

    <div class="og-main" [attr.inert]="compact() && drawerOpen() ? '' : null">
      <!-- Só abaixo de 1024px (o CSS acende). Carrega o contexto da cascata porque no
           desktop ele mora dentro do <nav>, e sumiria junto com a sidebar recolhida —
           e o sino, que no desktop fica no cabeçalho de página (og-page-header). -->
      <header class="og-topbar">
        <button
          #burger
          type="button"
          class="og-topbar-burger"
          aria-label="Abrir menu"
          aria-controls="og-sidebar"
          [attr.aria-expanded]="drawerOpen()"
          (click)="openDrawer($event)"
        >
          <og-icon name="menu" [size]="20" [strokeWidth]="2" />
        </button>

        @if (ctx.level() === 'global') {
          <span class="og-topbar-brand">
            <img src="/brand/logo.png" alt="" width="26" height="26" />
            <span class="og-topbar-title">nexa<em>GO</em></span>
          </span>
        } @else {
          <a class="og-topbar-back" [routerLink]="backLink()" [attr.aria-label]="'Voltar para ' + backLabel()">
            <og-icon name="back" [size]="18" [strokeWidth]="2" />
          </a>
          <span class="og-topbar-body">
            <span class="og-topbar-kicker">{{ contextKicker() }}</span>
            <span class="og-topbar-title">{{ contextName() }}</span>
          </span>
        }
        <og-bell />
      </header>

      @if (supportBanner(); as owner) {
        <div class="og-support-banner" role="status">
          <og-icon name="alert" [size]="16" [strokeWidth]="2" />
          <span>
            Você está operando como super admin o torneio de <strong>{{ owner }}</strong
            >. As alterações são reais e valem para o organizador.
          </span>
        </div>
      }
      <router-outlet />
    </div>

    <!-- Único visualizador de foto do painel: qualquer og-avatar com zoomable abre aqui. -->
    <og-person-photo />
  `,
  styles: `
    .og-support-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding: 10px 14px;
      border: 1px solid var(--nx-orange-500);
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      color: var(--nx-text);
      font-size: 13px;
      line-height: 1.4;
    }
    .og-support-banner og-icon {
      flex: none;
      color: var(--nx-orange-400);
    }
  `,
})
export class PanelShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ctx = inject(PanelContextService);

  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly sectionLabel = computed(() => SECTION_LABEL[this.ctx.level()]);

  // ── Moldura de tablet: a sidebar vira gaveta ────────────────
  /** `true` abaixo de 1024px, onde a sidebar sai do fluxo e vira gaveta. */
  protected readonly compact = signal(false);
  protected readonly drawerOpen = signal(false);

  private readonly drawerClose = viewChild<ElementRef<HTMLButtonElement>>('drawerClose');
  private readonly burger = viewChild<ElementRef<HTMLButtonElement>>('burger');

  /** Nome do dono do torneio aberto — resolvido só quando a faixa de suporte precisa dele. */
  private readonly ownerName = signal<string | null>(null);

  /** Guarda de reentrância do prompt de push — a `localStorage` já cobre entre sessões, isto
   *  cobre o efeito rodando de novo dentro da mesma. */
  private pushPrompted = false;

  /** Dono do torneio quando um super admin abre torneio alheio; `null` no caso normal.
   *  Fica no shell (e não em cada tela) porque vale pra todo o nível torneio/categoria:
   *  chave, inscrições, placar e financeiro herdam o aviso. */
  protected readonly supportBanner = computed<string | null>(() => {
    const managerId = this.foreignTournamentOwnerId();
    if (!managerId) return null;
    return this.ownerName() ?? 'outro organizador';
  });

  private readonly foreignTournamentOwnerId = computed<string | null>(() =>
    foreignTournamentOwnerId({
      isSuperAdmin: this.auth.isSuperAdmin(),
      uid: this.auth.user()?.uid,
      managerId: this.ctx.tournament()?.managerId,
    }),
  );

  constructor() {
    const mq = window.matchMedia(COMPACT_QUERY);
    this.compact.set(mq.matches);
    const onCompactChange = (e: MediaQueryListEvent) => {
      this.compact.set(e.matches);
      // Girar o tablet pra paisagem com a gaveta aberta deixaria o conteúdo `inert`
      // atrás de uma sidebar que voltou a ser fixa: painel inteiro travado, sem
      // nada visível explicando por quê.
      if (!e.matches) this.drawerOpen.set(false);
    };
    mq.addEventListener('change', onCompactChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener('change', onCompactChange));

    // Navegou, fecha — na gaveta todo item de menu leva pra outra tela.
    effect(() => {
      this.url();
      this.drawerOpen.set(false);
    });

    effect(() => {
      const managerId = this.foreignTournamentOwnerId();
      if (!managerId) {
        this.ownerName.set(null);
        return;
      }
      void listOrganizerNames([managerId]).then((names) => {
        // A rota pode ter mudado durante o fetch — só aplica se ainda for o mesmo dono.
        if (this.foreignTournamentOwnerId() === managerId) {
          this.ownerName.set(names.get(managerId) ?? null);
        }
      });
    });

    effect(() => {
      const uid = this.auth.user()?.uid;
      if (uid) void this.maybePromptPush(uid);
    });
  }

  /** Pede notificação do navegador uma única vez por navegador — quieto se recusar ou se o
   *  navegador não suportar (Safari fora de PWA instalada). Configurações tem o toggle manual
   *  pra quem recusou sem querer ou quer desligar depois. */
  private async maybePromptPush(uid: string): Promise<void> {
    if (this.pushPrompted || !isPushSupported() || localStorage.getItem(PUSH_PROMPT_KEY)) return;
    this.pushPrompted = true;
    localStorage.setItem(PUSH_PROMPT_KEY, '1');
    if (pushPermissionStatus() !== 'default') return;
    await subscribeToPush(organizerFirestore(), uid);
  }

  protected readonly nav = computed<OgNavEntry[]>(() => {
    const level = this.ctx.level();
    if (level === 'categoria') {
      const base = this.ctx.categoryBase()!;
      return [
        { label: 'Equipes', icon: 'users', link: `${base}/duplas` },
        { label: 'Cabeças de chave', icon: 'flag', link: `${base}/seeds` },
        { label: 'Grupos', icon: 'grid', link: `${base}/grupos` },
        { label: 'Chaveamento', icon: 'bracket', link: `${base}/chave` },
        { label: 'Jogos & placares', icon: 'whistle', link: `${base}/jogos`, matchPrefixes: [`${base}/jogos`, `${base}/placar`, `${base}/ao-vivo`] },
        { label: 'Agendamento', icon: 'calendar', link: `${base}/agendamento` },
        { label: 'Comunicação', icon: 'mail', link: `${base}/comunicacao` },
      ];
    }
    if (level === 'torneio') {
      const base = this.ctx.tournamentBase()!;
      return [
        { label: 'Visão geral', icon: 'grid', link: base },
        { label: 'Inscrições', icon: 'users', link: `${base}/inscricoes` },
        // Só torneio com uniforme incluso — sem kit, a tela não teria o que consolidar. O doc
        // chega assíncrono (contexto busca o torneio), então o item aparece junto com ele.
        ...(tournamentUsesUniform(this.ctx.tournament())
          ? [{ label: 'Uniformes', icon: 'shirt' as OgIconName, link: `${base}/uniformes` }]
          : []),
        { label: 'Agendamento', icon: 'calendar', link: `${base}/agendamento` },
        { label: 'Telão', icon: 'tv', link: `${base}/telao` },
        { label: 'Comunicação', icon: 'mail', link: `${base}/comunicacao` },
        { label: 'Equipe', icon: 'team', link: `${base}/equipe` },
      ];
    }
    if (level === 'liga') {
      const base = this.ctx.leagueBase()!;
      return [
        { label: 'Visão geral', icon: 'grid', link: base },
        { label: 'Etapas', icon: 'calendar', link: `${base}/etapas`, matchPrefixes: [`${base}/etapas`, `${base}/nova-etapa`] },
        { label: 'Ranking', icon: 'trophy', link: `${base}/ranking` },
      ];
    }
    return [
      { label: 'Início', icon: 'home', link: '/painel/inicio' },
      { label: 'Meus eventos', icon: 'trophy', link: '/painel/eventos', matchPrefixes: ['/painel/eventos', '/painel/ligas'] },
      // Os três wizards acendem "Criar evento", não "Meus eventos": chega-se neles por aqui,
      // e enquanto se cria alguma coisa é este o ramo em que se está.
      {
        label: 'Criar evento',
        icon: 'plus',
        link: '/painel/novo-evento',
        matchPrefixes: ['/painel/novo-evento', '/painel/novo-torneio', '/painel/nova-liga', '/painel/nova-etapa'],
      },
      { label: 'Financeiro', icon: 'cash', link: '/painel/financeiro' },
      { label: 'Links', icon: 'share', link: '/painel/links' },
    ];
  });

  /** Um nível acima: categoria → torneio, torneio de etapa → liga, resto → Meus eventos. */
  protected readonly backLink = computed(() => {
    const level = this.ctx.level();
    if (level === 'categoria') return this.ctx.tournamentBase() ?? '/painel/eventos';
    if (level === 'torneio') return this.ctx.leagueBase() ?? '/painel/eventos';
    return '/painel/eventos';
  });

  protected readonly backLabel = computed(() => {
    const level = this.ctx.level();
    if (level === 'categoria') return this.ctx.tournament()?.name ?? 'Torneio';
    if (level === 'torneio' && this.ctx.leagueBase()) return this.ctx.league()?.name ?? 'Liga';
    return 'Meus eventos';
  });

  protected readonly contextIcon = computed<OgIconName>(() => {
    const level = this.ctx.level();
    return level === 'global' ? 'trophy' : CONTEXT_ICON[level];
  });

  protected readonly contextKicker = computed(() => {
    const level = this.ctx.level();
    return level === 'global' ? '' : CONTEXT_KICKER[level];
  });

  protected readonly contextName = computed(() => {
    const level = this.ctx.level();
    if (level === 'liga') return this.ctx.league()?.name ?? 'Carregando…';
    if (level === 'categoria') return this.ctx.category()?.name ?? 'Categoria';
    return this.ctx.tournament()?.name ?? 'Carregando…';
  });

  protected readonly contextMeta = computed(() => {
    const level = this.ctx.level();
    if (level === 'liga') {
      const l = this.ctx.league();
      if (!l) return '';
      const n = l.stages.length;
      return `${l.sportLabel} · ${n} etapa${n === 1 ? '' : 's'}`;
    }
    const t = this.ctx.tournament();
    if (level === 'categoria') return t?.name ?? '';
    if (!t) return '';
    const n = t.categories.length;
    return `${t.sportLabel} · ${n} categoria${n === 1 ? '' : 's'}`;
  });

  protected isActive(item: OgNavEntry): boolean {
    const current = this.url().split('?')[0]!;
    if (item.matchPrefixes) return item.matchPrefixes.some((p) => current.startsWith(p));
    return current === item.link;
  }

  // ── Perfil do usuário (dados reais do Firebase Auth) ────────
  protected readonly userMenuOpen = signal(false);

  protected readonly userName = computed(() => {
    const name = this.auth.displayName()?.trim();
    if (name) return name;
    const email = this.auth.user()?.email;
    return email ? nameFromEmail(email) : 'Organizador';
  });

  /** E-mail da conta; sem e-mail (não deve ocorrer), mostra o papel. */
  protected readonly userSubLabel = computed(() => this.auth.user()?.email ?? 'Organizador');

  protected readonly userInitials = computed(() => initialsOfName(this.userName()));

  protected readonly userPhoto = computed(() => this.auth.user()?.photoURL ?? null);

  protected toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.userMenuOpen.update((open) => !open);
  }

  protected openDrawer(event: Event): void {
    event.stopPropagation();
    this.drawerOpen.set(true);
    // O foco precisa esperar o `inert` sair da gaveta: dentro de subárvore inerte
    // o `focus()` é ignorado em silêncio, e o teclado ficaria preso no conteúdo.
    this.focusAfterRender(() => this.drawerClose()?.nativeElement);
  }

  protected closeDrawer(): void {
    if (!this.drawerOpen()) return;
    this.drawerOpen.set(false);
    // Mesmo motivo ao contrário: o hambúrguer está dentro do `.og-main`, que só
    // deixa de ser inerte no render seguinte.
    this.focusAfterRender(() => this.burger()?.nativeElement);
  }

  /** Esc fecha o que estiver aberto — menu do usuário e gaveta. */
  protected onEscape(): void {
    this.userMenuOpen.set(false);
    this.closeDrawer();
  }

  private focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }

  protected async signOut(): Promise<void> {
    this.userMenuOpen.set(false);
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
