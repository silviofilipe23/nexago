import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { listOrganizerNames } from '../data/tournaments-repository';
import { tournamentUsesUniform } from '../data/uniforms';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgIconComponent, type OgIconName } from '../ui/icon.component';
import { PanelContextService } from './panel-context.service';

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
  imports: [RouterLink, RouterOutlet, OgIconComponent, OgAvatarComponent],
  host: {
    class: 'og-shell',
    '(document:click)': 'userMenuOpen.set(false)',
    '(document:keydown.escape)': 'userMenuOpen.set(false)',
  },
  template: `
    <nav class="og-sidebar">
      <a class="og-sidebar-brand" routerLink="/painel/inicio">
        <span class="og-sidebar-mark"><og-icon name="trophy" [size]="16" style="color:#0A0A0A" /></span>
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

    <div class="og-main">
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

  /** Nome do dono do torneio aberto — resolvido só quando a faixa de suporte precisa dele. */
  private readonly ownerName = signal<string | null>(null);

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
      { label: 'Meus eventos', icon: 'trophy', link: '/painel/eventos', matchPrefixes: ['/painel/eventos', '/painel/ligas', '/painel/novo-torneio', '/painel/nova-liga', '/painel/nova-etapa'] },
      { label: 'Financeiro', icon: 'cash', link: '/painel/financeiro' },
      { label: 'Telão', icon: 'tv', link: '/painel/telao' },
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

  protected async signOut(): Promise<void> {
    this.userMenuOpen.set(false);
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
