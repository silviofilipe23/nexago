import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { callableErrorMessage } from '../data/callable-error';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { IconComponent, type PanelIconName } from '../ui/icon.component';
import { KpiMiniComponent, type KpiMiniTone } from '../ui/kpi-mini.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { OrganizersRepository, type OrganizerListRow } from './data/organizers.repository';
import { ACCESS_REQUESTS, cityStateLabel, findAthlete, initialsOf } from './organizadores.data';
import { roleLabels, userDisplayName } from './role-subject';
import { OrganizadoresDemoComponent } from './ui/organizadores-demo.component';

interface KpiItem {
  label: string;
  value: string;
  tone?: KpiMiniTone;
}

interface RequestCard {
  id: string;
  name: string;
  initials: string;
  elo: string;
  city: string;
  reason: string;
  age: string;
}

/** Só filtros com sinal real hoje (Auth): status da conta e verificação de e-mail. */
const FILTERS = ['Todos', 'Ativos', 'Suspensos', 'E-mail pendente'] as const;

type OrganizerFilter = (typeof FILTERS)[number];

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; rows: readonly OrganizerListRow[] }
  | { kind: 'error'; message: string };

const EMPTY = '—';

/** Tela de Organizadores (protótipo BoOrganizadoresScreen): KPIs, solicitações, tabela e visão operacional. */
@Component({
  selector: 'bo-panel-organizadores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    KpiMiniComponent,
    PillComponent,
    IconComponent,
    ConfirmDialogComponent,
    OrganizadoresDemoComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header title="Organizadores" [subtitle]="subtitle()">
        <div class="header-actions">
          <div class="bo-search-box">
            <bo-icon name="search" [size]="15" />
            <span>Buscar…</span>
            <span class="kbd">⌘K</span>
          </div>
          <button type="button" class="bo-bell-btn" aria-label="Notificações">
            <bo-icon name="bell" [size]="17" />
            <span class="dot" aria-hidden="true"></span>
          </button>
          <a class="bo-mini-btn bo-mini-btn-primary" routerLink="/painel/organizadores/promover">
            <bo-icon name="plus" [size]="14" />
            Promover atleta
          </a>
        </div>
      </bo-page-header>

      <div class="bo-filter-bar">
        <bo-icon name="filter" [size]="14" style="color: var(--nx-text-dim); flex: none" />
        @for (f of filters; track f) {
          <button
            type="button"
            class="bo-chip"
            [class.active]="activeFilter() === f"
            (click)="activeFilter.set(f)"
          >
            {{ f }}
          </button>
        }
      </div>

      <div class="body">
        @if (feedback(); as message) {
          <div class="bo-feedback">
            <bo-icon name="check" [size]="15" />
            <span>{{ message }}</span>
          </div>
        }

        <div class="demo-notice">
          <bo-icon name="alert" [size]="15" />
          <span>
            A tabela de organizadores usa dados reais deste projeto. KPIs sem número, solicitações de
            acesso e os painéis analíticos abaixo são exemplos — essas métricas ainda não existem no
            backend.
          </span>
        </div>

        <div class="kpi-grid">
          @for (kpi of kpis(); track kpi.label) {
            <bo-kpi-mini [label]="kpi.label" [value]="kpi.value" [tone]="kpi.tone ?? 'neutral'" />
          }
        </div>

        <bo-panel-card
          pad="sm"
          kicker="Atletas pedindo a role de organizador"
          title="Solicitações de acesso"
        >
          <div class="card-head-actions" card-actions>
            <bo-pill tone="yellow">{{ pendingRequests }}</bo-pill>
            <button type="button" class="bo-ghost-btn">Ver todas</button>
          </div>

          <div>
            @for (request of requests; track request.id) {
              <div class="request-row">
                <div class="avatar" aria-hidden="true">{{ request.initials }}</div>
                <div class="request-body">
                  <div class="request-line">
                    <span class="request-name">{{ request.name }}</span>
                    <bo-pill tone="dim">{{ request.elo }}</bo-pill>
                    <span class="request-city">{{ request.city }}</span>
                  </div>
                  <p class="request-reason">“{{ request.reason }}”</p>
                </div>
                <span class="request-age">{{ request.age }}</span>
                <div class="request-actions">
                  <button type="button" class="bo-ghost-btn">Recusar</button>
                  <a
                    class="bo-mini-btn bo-mini-btn-primary"
                    [routerLink]="['/painel/organizadores/solicitacoes', request.id]"
                  >
                    Analisar
                  </a>
                </div>
              </div>
            }
          </div>
        </bo-panel-card>

        <bo-panel-card pad="sm" title="Todos os organizadores">
          <div class="card-head-actions" card-actions>
            <button type="button" class="bo-ghost-btn">
              <bo-icon name="download" [size]="14" />
              Exportar
            </button>
            <button type="button" class="bo-mini-btn">
              <bo-icon name="filter" [size]="13" />
              Filtros avançados
            </button>
          </div>

          @if (activeFilter() !== 'Todos') {
            <div class="bo-results-hint">
              <span class="bo-filter-badge">
                {{ activeFilter() }}
                <button type="button" aria-label="Limpar filtro" (click)="activeFilter.set('Todos')">
                  ✕
                </button>
              </span>
              Mostrando {{ filteredOrganizers().length }} de {{ organizers().length }} organizadores
            </div>
          }

          @switch (state().kind) {
            @case ('loading') {
              <p class="table-status">Carregando organizadores…</p>
            }
            @case ('error') {
              <div class="bo-alert">
                <bo-icon name="alert" [size]="16" />
                <span>{{ errorMessage() }}</span>
              </div>
              <button type="button" class="bo-mini-btn retry" (click)="load()">Tentar de novo</button>
            }
            @case ('ok') {
              <div class="table-head">
                <span>Organizador</span>
                <span>Cidade</span>
                <span>E-mail</span>
                <span>Status</span>
                <span class="right">GMV</span>
                <span class="right">Nota</span>
                <span class="right">Desde</span>
                <span></span>
              </div>

              <div>
                @for (organizer of filteredOrganizers(); track organizer.uid) {
                  <div class="table-row">
                    <div class="cell-org">
                      <div class="avatar sm" aria-hidden="true">{{ initials(name(organizer)) }}</div>
                      <div class="cell-org-body">
                        <div class="cell-name">{{ name(organizer) }}</div>
                        <div class="cell-brand">{{ organizer.email || organizer.uid }}</div>
                      </div>
                    </div>
                    <div class="cell-city">{{ organizer.city || empty }}</div>
                    <div>
                      <bo-pill [tone]="organizer.emailVerified ? 'green' : 'yellow'">
                        {{ organizer.emailVerified ? 'Verificado' : 'Pendente' }}
                      </bo-pill>
                    </div>
                    <div>
                      <bo-pill [tone]="organizer.disabled ? 'red' : 'green'">
                        {{ organizer.disabled ? 'Suspenso' : 'Ativo' }}
                      </bo-pill>
                    </div>
                    <div class="right cell-empty">{{ empty }}</div>
                    <div class="right cell-empty">{{ empty }}</div>
                    <div class="right cell-dim">{{ organizer.since || empty }}</div>
                    <div class="right">
                      @if (blockedReason(organizer); as reason) {
                        <span class="blocked" [title]="reason">{{ reason }}</span>
                      } @else {
                        <button type="button" class="bo-ghost-btn danger" (click)="askRemoval(organizer)">
                          Remover role
                        </button>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="table-status">
                    Nenhuma conta com a role <code>organizer</code> neste projeto
                    @if (activeFilter() !== 'Todos') {
                      para o filtro selecionado
                    }
                    .
                  </p>
                }
              </div>
            }
          }
        </bo-panel-card>

        <bo-organizadores-demo />
      </div>

      @if (removalTarget(); as target) {
        <bo-confirm-dialog
          [open]="true"
          title="Remover role de organizador"
          [description]="removalDescription(target)"
          confirmLabel="Remover role"
          tone="danger"
          [busy]="removing()"
          [error]="removalError()"
          (confirmed)="confirmRemoval()"
          (dismissed)="cancelRemoval()"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-actions a.bo-mini-btn {
      text-decoration: none;
    }

    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }

    .card-head-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .avatar {
      width: 36px;
      height: 36px;
      flex: none;
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.35);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 12px;
      color: var(--nx-orange-500);
    }

    .avatar.sm {
      width: 30px;
      height: 30px;
      font-size: 10px;
    }

    .request-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .request-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .request-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .request-line {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    .request-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }

    .request-city {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
    }

    .request-reason {
      margin: 0;
      font-size: 11.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .request-age {
      flex: none;
      font-family: var(--nx-font-mono);
      font-size: 10px;
      color: var(--nx-text-dim);
    }

    .request-actions {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .request-actions a.bo-mini-btn {
      text-decoration: none;
    }

    .table-head,
    .table-row {
      display: grid;
      grid-template-columns: 1.9fr 1.2fr 108px 100px 92px 60px 68px 132px;
      gap: 8px;
      align-items: center;
    }


    .blocked {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .bo-ghost-btn.danger {
      white-space: nowrap;
    }

    .demo-notice {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 11px 14px;
      border-radius: var(--nx-r-3);
      background: rgba(244, 197, 67, 0.08);
      border: 1px solid rgba(244, 197, 67, 0.28);
      color: var(--nx-pending);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .demo-notice bo-icon {
      flex: none;
      margin-top: 1px;
    }

    .table-status {
      margin: 18px 0 6px;
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .table-status code {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-mute);
    }

    .retry {
      align-self: flex-start;
      margin-top: 12px;
    }

    .cell-empty {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text-dim);
    }

    .table-head {
      padding: 0 4px 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }

    .table-head span {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }

    .table-head span.right {
      text-align: right;
    }

    .table-row {
      padding: 9px 4px;
      border-bottom: 1px solid var(--nx-line);
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row .right {
      text-align: right;
    }

    .table-row a.bo-mini-btn {
      text-decoration: none;
    }

    .cell-org {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .cell-org-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .cell-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13px;
      color: var(--nx-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-brand {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      color: var(--nx-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-city {
      min-width: 0;
      font-size: 12.5px;
      color: var(--nx-text-mute);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cell-gmv {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--nx-text);
    }

    .cell-gmv.empty {
      font-weight: 400;
      color: var(--nx-text-dim);
    }

    .cell-num {
      font-family: var(--nx-font-mono);
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .cell-dim {
      font-family: var(--nx-font-mono);
      font-size: 11.5px;
      color: var(--nx-text-dim);
    }



















































    @media (max-width: 720px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class PanelOrganizadoresComponent {
  private readonly repository = inject(OrganizersRepository);
  private readonly auth = inject(AuthService);

  protected readonly filters = FILTERS;
  protected readonly initials = initialsOf;
  protected readonly name = userDisplayName;
  protected readonly empty = EMPTY;
  protected readonly pendingRequests = ACCESS_REQUESTS.length;

  protected readonly activeFilter = signal<OrganizerFilter>('Todos');
  protected readonly state = signal<LoadState>({ kind: 'loading' });

  protected readonly removalTarget = signal<OrganizerListRow | null>(null);
  protected readonly removing = signal(false);
  protected readonly removalError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  /**
   * Motivo pelo qual a remoção não é oferecida — as duas travas vêm do backend
   * (`removeUserRole`): ninguém fica sem papel e ninguém tira o próprio.
   */
  protected blockedReason(row: OrganizerListRow): string {
    if (row.uid === this.auth.user()?.uid) {
      return 'sua conta';
    }
    if (row.roles.length <= 1) {
      return 'único papel';
    }
    return '';
  }

  protected removalDescription(row: OrganizerListRow): string {
    const remaining = row.roles.filter((r) => r !== 'organizer');
    return (
      `${this.name(row)} perde o acesso ao portal do organizador e fica com: ${roleLabels(remaining)}. ` +
      'Os torneios já criados continuam existindo. A mudança só vale quando o usuário pegar um token novo — ' +
      'sair e entrar de novo no app.'
    );
  }

  protected askRemoval(row: OrganizerListRow): void {
    this.removalError.set(null);
    this.feedback.set(null);
    this.removalTarget.set(row);
  }

  protected cancelRemoval(): void {
    if (this.removing()) {
      return;
    }
    this.removalTarget.set(null);
  }

  protected async confirmRemoval(): Promise<void> {
    const target = this.removalTarget();
    if (!target || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.removalError.set(null);
    try {
      const remaining = await this.repository.revokeOrganizerRole(target.uid);
      this.removalTarget.set(null);
      this.feedback.set(
        `${this.name(target)} não é mais organizador — papéis atuais: ${roleLabels(remaining) || '—'}.`,
      );
      await this.load();
    } catch (err) {
      this.removalError.set(callableErrorMessage(err));
    } finally {
      this.removing.set(false);
    }
  }

  protected readonly organizers = computed<readonly OrganizerListRow[]>(() => {
    const state = this.state();
    return state.kind === 'ok' ? state.rows : [];
  });

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.message : '';
  });

  protected readonly subtitle = computed(() => {
    const state = this.state();
    if (state.kind === 'loading') {
      return 'Carregando organizadores…';
    }
    if (state.kind === 'error') {
      return 'Não foi possível carregar os organizadores';
    }
    const total = state.rows.length;
    return `${total} ${total === 1 ? 'organizador' : 'organizadores'} com a role no Auth`;
  });

  protected async load(): Promise<void> {
    this.state.set({ kind: 'loading' });
    try {
      this.state.set({ kind: 'ok', rows: await this.repository.listOrganizers() });
    } catch (err) {
      this.state.set({ kind: 'error', message: callableErrorMessage(err) });
    }
  }

  /** Só os três primeiros vêm dos dados reais; o resto não tem fonte ainda. */
  protected readonly kpis = computed<KpiItem[]>(() => {
    const rows = this.organizers();
    const loaded = this.state().kind === 'ok';
    const active = rows.filter((r) => !r.disabled).length;
    const suspended = rows.filter((r) => r.disabled).length;
    return [
      { label: 'Organizadores totais', value: loaded ? String(rows.length) : EMPTY },
      { label: 'Ativos', value: loaded ? String(active) : EMPTY, tone: 'green' },
      { label: 'Suspensos', value: loaded ? String(suspended) : EMPTY, tone: 'red' },
      { label: 'Solicitações pendentes', value: EMPTY },
      { label: 'Torneios ativos agora', value: EMPTY },
      { label: 'Inscrições (GMV)', value: EMPTY },
      { label: 'Receita NexaGO', value: EMPTY },
      { label: 'Nota média', value: EMPTY },
    ];
  });

  /** As 4 solicitações mais recentes ficam no card; o restante fica em "Ver todas". */
  protected readonly requests: RequestCard[] = ACCESS_REQUESTS.slice(0, 4).map((request) => {
    const athlete = findAthlete(request.athleteId);
    return {
      id: request.id,
      name: athlete?.name ?? '—',
      initials: initialsOf(athlete?.name ?? ''),
      elo: athlete?.elo ?? '—',
      city: athlete ? cityStateLabel(athlete.city, athlete.state) : '—',
      reason: request.reason,
      age: request.age,
    };
  });

  protected readonly filteredOrganizers = computed<readonly OrganizerListRow[]>(() => {
    const rows = this.organizers();
    switch (this.activeFilter()) {
      case 'Ativos':
        return rows.filter((o) => !o.disabled);
      case 'Suspensos':
        return rows.filter((o) => o.disabled);
      case 'E-mail pendente':
        return rows.filter((o) => !o.emailVerified);
      default:
        return rows;
    }
  });








}
