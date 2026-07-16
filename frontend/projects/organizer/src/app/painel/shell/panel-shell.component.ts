import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
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

const SECTION_LABEL = { global: 'Geral', torneio: 'Torneio', categoria: 'Categoria' } as const;

/** Shell do painel do organizador — navegação em cascata (Portal → Torneio → Categoria).
 *  A sidebar é contextual: os itens trocam conforme o nível derivado da rota
 *  (`PanelContextService`), com link de voltar e card do torneio/categoria em contexto. */
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

      @if (ctx.level() !== 'global') {
        <a class="og-side-back" [routerLink]="backLink()">
          <og-icon name="back" [size]="14" />
          <span>{{ backLabel() }}</span>
        </a>
        <div class="og-side-context">
          <span class="og-side-context-icon">
            <og-icon [name]="ctx.level() === 'torneio' ? 'trophy' : 'bracket'" [size]="14" />
          </span>
          <span class="og-side-context-body">
            <span class="og-side-context-kicker">{{ ctx.level() === 'torneio' ? 'Torneio' : 'Categoria' }}</span>
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

  protected readonly nav = computed<OgNavEntry[]>(() => {
    const level = this.ctx.level();
    if (level === 'categoria') {
      const base = this.ctx.categoryBase()!;
      return [
        { label: 'Equipes', icon: 'users', link: `${base}/duplas` },
        { label: 'Cabeças de chave', icon: 'flag', link: `${base}/seeds` },
        { label: 'Grupos', icon: 'grid', link: `${base}/grupos` },
        { label: 'Chaveamento', icon: 'bracket', link: `${base}/chave` },
        { label: 'Jogos & placares', icon: 'whistle', link: `${base}/jogos`, matchPrefixes: [`${base}/jogos`, `${base}/placar`] },
        { label: 'Agendamento', icon: 'calendar', link: `${base}/agendamento` },
        { label: 'Comunicação', icon: 'mail', link: `${base}/comunicacao` },
      ];
    }
    if (level === 'torneio') {
      const base = this.ctx.tournamentBase()!;
      return [
        { label: 'Visão geral', icon: 'grid', link: base },
        { label: 'Inscrições', icon: 'users', link: `${base}/inscricoes` },
        { label: 'Agendamento', icon: 'calendar', link: `${base}/agendamento` },
        { label: 'Comunicação', icon: 'mail', link: `${base}/comunicacao` },
      ];
    }
    return [
      { label: 'Início', icon: 'home', link: '/painel/inicio' },
      { label: 'Meus eventos', icon: 'trophy', link: '/painel/eventos', matchPrefixes: ['/painel/eventos', '/painel/novo-torneio', '/painel/nova-liga', '/painel/nova-etapa'] },
      { label: 'Financeiro', icon: 'cash', link: '/painel/financeiro' },
    ];
  });

  protected readonly backLink = computed(() =>
    this.ctx.level() === 'categoria' ? (this.ctx.tournamentBase() ?? '/painel/eventos') : '/painel/eventos',
  );

  protected readonly backLabel = computed(() =>
    this.ctx.level() === 'categoria' ? (this.ctx.tournament()?.name ?? 'Torneio') : 'Meus eventos',
  );

  protected readonly contextName = computed(() => {
    if (this.ctx.level() === 'categoria') return this.ctx.category()?.name ?? 'Categoria';
    return this.ctx.tournament()?.name ?? 'Carregando…';
  });

  protected readonly contextMeta = computed(() => {
    const t = this.ctx.tournament();
    if (this.ctx.level() === 'categoria') return t?.name ?? '';
    if (!t) return '';
    const n = t.categories.length;
    return `${t.sportLabel} · ${n} categoria${n === 1 ? '' : 's'}`;
  });

  protected isActive(item: OgNavEntry): boolean {
    const current = this.url().split('?')[0]!;
    if (item.matchPrefixes) return item.matchPrefixes.some((p) => current.startsWith(p));
    return current === item.link;
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
