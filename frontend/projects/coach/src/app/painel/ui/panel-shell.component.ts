import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { CoachContextService } from '../access/coach-context.service';
import { CoachStaffService } from '../access/coach-staff.service';
import { ROLE_LABELS, type PanelArea } from '../access/coach-roles.model';
import { IconComponent, type PanelIconName } from './icon.component';
import { initialsOf } from './initials';
import { SquadContextService } from './squad-context.service';

interface PanelNavItem {
  id: string;
  label: string;
  icon: PanelIconName;
  route: string;
  area: PanelArea;
}

export const NAV_ITEMS: PanelNavItem[] = [
  { id: 'inicio', label: 'Início', icon: 'home', route: '/painel', area: 'atletas' },
  { id: 'atletas', label: 'Atletas', icon: 'person', route: '/painel/atletas', area: 'atletas' },
  { id: 'equipes', label: 'Equipes', icon: 'team', route: '/painel/equipes', area: 'atletas' },
  { id: 'treinos', label: 'Treinos', icon: 'clipboard', route: '/painel/treinos', area: 'treinos' },
  { id: 'presenca', label: 'Presença', icon: 'check', route: '/painel/presenca', area: 'treinos' },
  { id: 'avaliacoes', label: 'Avaliações', icon: 'radar', route: '/painel/avaliacoes', area: 'avaliacoes' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar', route: '/painel/agenda', area: 'treinos' },
  { id: 'convocacoes', label: 'Convocações', icon: 'bell', route: '/painel/convocacoes', area: 'convocacoes' },
  { id: 'torneios', label: 'Torneios', icon: 'trophy', route: '/painel/torneios', area: 'atletas' },
  { id: 'historico', label: 'Histórico', icon: 'clock', route: '/painel/historico', area: 'treinos' },
  { id: 'lesoes', label: 'Lesões', icon: 'medical', route: '/painel/lesoes', area: 'saude' },
  { id: 'permissoes', label: 'Permissões', icon: 'gear', route: '/painel/permissoes', area: 'equipe' },
  { id: 'financeiro', label: 'Financeiro', icon: 'wallet', route: '/painel/financeiro', area: 'financeiro' },
  { id: 'comunicacao', label: 'Comunicação', icon: 'chat', route: '/painel/comunicacao', area: 'comunicacao' },
  { id: 'biblioteca', label: 'Biblioteca', icon: 'folder', route: '/painel/biblioteca', area: 'principal' },
  { id: 'ia', label: 'IA do treinador', icon: 'sparkle', route: '/painel/ia', area: 'principal' },
];

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

/** Shell do painel do treinador: sidebar fixa (protótipo TrPanelShell/TrSidebar) + conteúdo projetado. */
@Component({
  selector: 'co-panel-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="mark" src="/brand/logo.png" alt="" width="30" height="30" />
          <div class="wordmark">
            <div class="name">nexa<span>GO</span></div>
            <div class="tag">Treinador</div>
          </div>
        </div>

        <div class="switcher" routerLink="/painel/equipes">
          <div class="switcher-avatar" aria-hidden="true">{{ activeSquadInitials() }}</div>
          <div class="switcher-body">
            <div class="switcher-name">{{ activeSquadName() }}</div>
            <div class="switcher-meta">{{ squadCountLabel() }}</div>
          </div>
          <co-icon name="chevron-right" [size]="13" style="color: var(--nx-text-dim); transform: rotate(90deg)" />
        </div>

        @if (ctx.contexts().length > 1) {
          <label class="coach-switcher">
            <span class="nav-kicker">Painel</span>
            <select (change)="onCoachChange($event)">
              @for (c of ctx.contexts(); track c.coachUid) {
                <option [value]="c.coachUid" [selected]="c.coachUid === ctx.activeCoachUid()">
                  {{ c.isOwn ? 'Meu painel' : c.coachName }}
                </option>
              }
            </select>
          </label>
        }

        <nav class="nav">
          <div class="nav-kicker">Comissão técnica</div>
          @for (item of navItems(); track item.id) {
            <a class="nav-item" [class.active]="activeId() === item.id" [routerLink]="item.route">
              <co-icon [name]="item.icon" [size]="17" [strokeWidth]="1.9" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="spacer"></div>

        <div class="user-row">
          <div class="avatar" aria-hidden="true">{{ initials() }}</div>
          <div class="who">
            <div class="who-name">{{ displayName() }}</div>
            <div class="who-role">{{ roleLabel() }}</div>
          </div>
        </div>

        @if (ctx.activeContext()?.isOwn === false) {
          <div class="leave">
            @if (confirmingLeave()) {
              <button type="button" class="leave-btn danger" [disabled]="leaving()" (click)="leave()">Confirmar saída</button>
              <button type="button" class="leave-btn" (click)="cancelLeave()">Cancelar</button>
            } @else {
              <button type="button" class="leave-btn" (click)="leaveArmedFor.set(ctx.activeCoachUid())">Sair desta comissão</button>
            }
            @if (leaveError(); as err) {
              <div class="leave-error" role="alert">{{ err }}</div>
            }
          </div>
        }
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
      grid-template-columns: 224px 1fr;
      background: var(--nx-bg);
      color: var(--nx-text);
    }

    .sidebar {
      background: #070708;
      border-right: 1px solid var(--nx-line);
      display: flex;
      flex-direction: column;
      padding: 18px 14px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 2px 8px 0;
    }

    .mark {
      width: 30px;
      height: 30px;
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
      font-size: 14.5px;
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
      background: linear-gradient(135deg, #ff8a4a 0%, #2260b8 100%);
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

    .coach-switcher {
      display: block;
      margin-top: 10px;
    }

    .coach-switcher select {
      width: 100%;
      padding: 8px 10px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12.5px;
      cursor: pointer;
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-top: 18px;
    }

    .nav-kicker {
      font-family: var(--nx-font-mono);
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      padding: 0 12px;
      margin-bottom: 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--nx-r-2);
      color: var(--nx-text-mute);
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -0.005em;
      position: relative;
      text-decoration: none;
      cursor: pointer;
      transition: background 140ms var(--nx-ease-out);
    }

    .nav-item:hover {
      background: var(--nx-surface-1);
    }

    .nav-item.active {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .nav-item.active span {
      color: var(--nx-text);
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      left: -14px;
      top: 9px;
      bottom: 9px;
      width: 3px;
      border-radius: 2px;
      background: var(--nx-orange-500);
    }

    .spacer {
      flex: 1;
    }

    .user-row {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--nx-line);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 30px;
      height: 30px;
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
      font-size: 12px;
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

    .leave {
      margin-top: 10px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .leave-btn {
      background: none;
      border: none;
      padding: 2px 4px;
      font-family: var(--nx-font-ui);
      font-size: 11px;
      color: var(--nx-text-dim);
      cursor: pointer;
      text-decoration: underline;
    }

    .leave-btn.danger {
      color: var(--nx-red-500, #ff5b5b);
    }

    .leave-btn:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .leave-error {
      width: 100%;
      font-size: 11px;
      color: #ff9b94;
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
  private readonly squadContext = inject(SquadContextService);
  private readonly staff = inject(CoachStaffService);
  protected readonly ctx = inject(CoachContextService);

  /** Painel para o qual a saída foi armada; só vale enquanto ele continuar sendo o ativo. */
  protected readonly leaveArmedFor = signal<string | null>(null);
  protected readonly confirmingLeave = computed(
    () => this.leaveArmedFor() !== null && this.leaveArmedFor() === this.ctx.activeCoachUid(),
  );
  protected readonly leaving = signal(false);
  protected readonly leaveError = signal<string | null>(null);

  protected readonly navItems = computed(() => NAV_ITEMS.filter((i) => this.ctx.can(i.area)));
  protected readonly roleLabel = computed(() => ROLE_LABELS[this.ctx.role() ?? 'principal']);

  /** Painel/cargo com que esta página foi aberta; muda só se o vínculo mudar por baixo dela. */
  private baseline: { coachUid: string | null; role: string | null } | null = null;

  constructor() {
    effect(() => {
      if (!this.ctx.ready()) {
        return;
      }
      if (this.ctx.contexts().length === 0) {
        void this.router.navigateByUrl('/sem-acesso');
        return;
      }
      const current = { coachUid: this.ctx.activeCoachUid(), role: this.ctx.role() };
      if (this.leaveArmedFor() !== current.coachUid) {
        this.leaveArmedFor.set(null);
        this.leaveError.set(null);
      }
      const before = this.baseline;
      this.baseline = current;
      if (before && (before.coachUid !== current.coachUid || before.role !== current.role)) {
        // O cargo/painel mudou com a página aberta: ela pode não ser mais permitida.
        void this.router.navigateByUrl('/painel');
      }
    });
  }

  protected cancelLeave(): void {
    this.leaveArmedFor.set(null);
    this.leaveError.set(null);
  }

  protected async leave(): Promise<void> {
    const coachUid = this.ctx.activeContext()?.isOwn === false ? this.ctx.activeCoachUid() : null;
    if (!coachUid || this.leaveArmedFor() !== coachUid) {
      return;
    }
    this.leaveError.set(null);
    this.leaving.set(true);
    try {
      await this.staff.leave(coachUid);
      this.leaveArmedFor.set(null);
      // O espelho some em ~1 s e o contexto cai para outro painel (ou /sem-acesso, pelo effect acima).
      void this.router.navigateByUrl('/painel');
    } catch (err) {
      this.leaveError.set(err instanceof Error && err.message ? err.message : 'Não foi possível sair da comissão.');
    } finally {
      this.leaving.set(false);
    }
  }

  protected onCoachChange(event: Event): void {
    this.switchCoach((event.target as HTMLSelectElement).value);
  }

  protected switchCoach(coachUid: string): void {
    this.leaveArmedFor.set(null);
    this.leaveError.set(null);
    this.ctx.select(coachUid);
    void this.router.navigateByUrl('/painel');
  }

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

  protected readonly displayName = computed(
    () => this.auth.displayName() || this.auth.user()?.email || 'Conta',
  );

  protected readonly initials = computed(() => initialsOf(this.displayName()));

  protected readonly activeSquadName = computed(() => this.squadContext.activeSquad()?.name ?? 'Nenhuma equipe');
  protected readonly activeSquadInitials = computed(() => this.squadContext.activeSquad()?.initials ?? '·');
  protected readonly squadCountLabel = computed(() => {
    const n = this.squadContext.squads().length;
    if (n === 0) {
      return 'Crie sua primeira equipe';
    }
    return n === 1 ? '1 equipe' : `${n} equipes`;
  });
}
