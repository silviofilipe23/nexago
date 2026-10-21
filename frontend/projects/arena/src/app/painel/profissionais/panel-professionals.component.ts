import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { AulaStatComponent } from '../aulas/aulas-ui';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  PROFESSOR_STATUS_FILTERS,
  PROFESSOR_TYPE_META,
  activeKpiSub,
  arenaProfessorRequestUrl,
  courtDiscountPillLabel,
  displayStatus,
  filterProfessorRows,
  inviteKpiSub,
  isClosedStatus,
  linkActions,
  pendingRequests,
  permissionsCell,
  professorKpis,
  resendInviteInput,
  statusDateLine,
  statusGroupOf,
  type ArenaProfessorLink,
  type ProfessorLinkType,
  type ProfessorStatusFilter,
  type ProfessorStatusGroup,
  type ProfessorTypeFilter,
} from './arena-professor.model';
import { ArenaProfessorsService } from './arena-professors.service';
import { unreadBadge, unreadByLinkId, type ArenaChannel } from './arena-professor-channel.model';
import { ArenaProfessorChannelService } from './arena-professor-channel.service';
import {
  ProfessorAnalyzeModalComponent,
  ProfessorConfirmModalComponent,
  ProfessorInviteModalComponent,
} from './professor-modals.component';
import { ProfessorNoteComponent, ProfessorRadioCardComponent, ProfessorStatusComponent, ProfessorTypeTagComponent } from './professor-ui';

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

const TYPE_CHIPS: ReadonlyArray<{ id: ProfessorLinkType; label: string; color: string }> = [
  { id: 'ARENA_STAFF', label: 'Equipe da arena', color: PROFESSOR_TYPE_META.ARENA_STAFF.color },
  { id: 'INDEPENDENT', label: 'Independentes', color: PROFESSOR_TYPE_META.INDEPENDENT.color },
];

/** A1 · Profissionais — professores vinculados à arena (equipe e independentes), pedidos
 *  aguardando decisão e convites em aberto. A6 quando a arena ainda não tem vínculo nenhum.
 *  Dono e gestor (área `perfil`); sem gate de plano. */
@Component({
  selector: 'ar-panel-professionals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    AvatarComponent,
    AulaStatComponent,
    ProfessorTypeTagComponent,
    ProfessorStatusComponent,
    ProfessorNoteComponent,
    ProfessorRadioCardComponent,
    ProfessorInviteModalComponent,
    ProfessorAnalyzeModalComponent,
    ProfessorConfirmModalComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Profissionais" [subtitle]="subtitle()">
        @if (links().length > 0) {
          <label class="search">
            <ar-icon name="search" [size]="14" />
            <input type="search" placeholder="Buscar professor" aria-label="Buscar professor pelo nome" [value]="term()" (input)="term.set($any($event.target).value)" />
          </label>
        }
        @if (canWrite()) {
          <button type="button" class="ar-mini-btn" [disabled]="!arenaId()" (click)="openNotices()">
            <ar-icon name="bell" [size]="14" />
            Comunicados
          </button>
          <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="!arenaId()" (click)="inviteOpen.set(true)">
            <ar-icon name="plus" [size]="14" />
            Convidar professor
          </button>
        }
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <ar-panel-card pad="lg"><p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p></ar-panel-card>
        } @else if (loadingView()) {
          <ar-panel-card pad="lg"><p class="state-text">Carregando professores…</p></ar-panel-card>
        } @else if (loadError(); as err) {
          <ar-panel-card pad="lg"><p class="state-text">{{ err }}</p></ar-panel-card>
        } @else {
          @if (notice(); as n) {
            <div class="notice" [class.error]="n.tone === 'error'" role="status">
              <span>{{ n.text }}</span>
              <button type="button" class="notice-dismiss" aria-label="Fechar aviso" (click)="notice.set(null)">×</button>
            </div>
          }

          @if (links().length === 0) {
            <ar-panel-card pad="lg" class="empty-card">
              <div class="empty">
                <div class="empty-icon"><ar-icon name="person" [size]="28" /></div>
                <div class="empty-title">Adicione seu primeiro professor</div>
                <p class="empty-text">
                  Convide professores da sua equipe ou libere independentes para usar a estrutura.
                  Professores também podem pedir vínculo pela página da arena — os pedidos aparecem aqui.
                </p>
                <div class="empty-actions">
                  @if (canWrite()) {
                    <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="inviteOpen.set(true)">Convidar professor</button>
                  }
                  <button type="button" class="ar-mini-btn" (click)="copyPageLink()">{{ copied() ? 'Link copiado' : 'Copiar link da página' }}</button>
                </div>
                <div class="empty-types">
                  <ar-prof-radio-card type="ARENA_STAFF" [selectable]="false" [compact]="true" />
                  <ar-prof-radio-card type="INDEPENDENT" [selectable]="false" [compact]="true" />
                </div>
              </div>
            </ar-panel-card>
          } @else {
            <div class="kpi-row">
              <ar-aula-stat label="Equipe da arena" [value]="'' + kpis().staffActive" [sub]="staffSub()" />
              <ar-aula-stat label="Independentes" [value]="'' + kpis().independentActive" [sub]="independentSub()" />
              <ar-aula-stat
                label="Solicitações"
                [value]="'' + kpis().pending"
                [sub]="kpis().pending > 0 ? 'aguardando sua decisão' : 'nenhuma no momento'"
                [tone]="kpis().pending > 0 ? 'orange' : 'default'"
              />
              <ar-aula-stat label="Convites enviados" [value]="'' + kpis().invitesOpen" [sub]="inviteSub()" />
            </div>

            <div class="ar-split layout">
              <ar-panel-card class="table-card">
                <div class="ar-filter-bar chips">
                  <button type="button" class="ar-chip" [class.active]="noFilter()" (click)="resetFilters()">Todos · {{ tableTotal() }}</button>
                  @for (chip of typeChips; track chip.id) {
                    <button type="button" class="ar-chip" [class.active]="typeFilter() === chip.id" (click)="toggleType(chip.id)">
                      <span class="chip-dot" [style.background]="chip.color"></span>{{ chip.label }}
                    </button>
                  }
                  <span class="chip-sep" aria-hidden="true"></span>
                  @for (chip of statusChips; track chip.id) {
                    <button type="button" class="ar-chip" [class.active]="statusFilter() === chip.id" (click)="toggleStatus(chip.id)">{{ chip.label }}</button>
                  }
                </div>

                <div class="ar-table-scroll" tabindex="0" role="region" aria-label="Tabela de professores">
                  <div class="table-inner">
                    <div class="table-head">
                      <span>Professor</span>
                      <span>Tipo</span>
                      <span>Status</span>
                      <span>Permissões</span>
                      <span></span>
                    </div>
                    @for (row of rows(); track row.link.id) {
                      <div
                        class="table-row"
                        [class.off]="row.closed"
                        role="link"
                        tabindex="0"
                        [attr.aria-label]="'Abrir vínculo de ' + row.link.professorName"
                        (click)="open(row.link.id)"
                        (keydown.enter)="open(row.link.id)"
                      >
                        <div class="cell-prof">
                          <ar-avatar [name]="row.link.professorName" [photoUrl]="row.link.professorPhotoUrl" [size]="32" />
                          <div class="prof-text">
                            <div class="prof-name-row">
                              <span class="prof-name">{{ row.link.professorName }}</span>
                              @if (row.unread > 0) {
                                <button
                                  type="button"
                                  class="unread"
                                  [attr.aria-label]="row.unread + ' mensagens não lidas de ' + row.link.professorName"
                                  (click)="$event.stopPropagation(); openMessages(row.link.id)"
                                  (keydown.enter)="$event.stopPropagation()"
                                >
                                  <ar-icon name="mail" [size]="11" />{{ row.unreadLabel }}
                                </button>
                              }
                            </div>
                            <div class="prof-mod">{{ row.modalities }}</div>
                          </div>
                        </div>
                        <div><ar-prof-type-tag [type]="row.link.relationshipType" [sm]="true" /></div>
                        <div class="cell-status">
                          <ar-prof-status [status]="row.status" [sm]="true" />
                          <div class="date-line">{{ row.dateLine }}</div>
                        </div>
                        <div class="cell-perms">
                          @if (row.pills; as pills) {
                            @for (p of pills; track p.key) {
                              <span class="perm" [class.perm-off]="!p.on">{{ p.label }}</span>
                            }
                            @if (row.link.courtDiscountPercent > 0) {
                              <span class="perm" title="Desconto no aluguel de quadra">{{ row.discountPill }}</span>
                            }
                          } @else if (row.canResend && canWrite()) {
                            <button
                              type="button"
                              class="link-btn"
                              [disabled]="resendingId() === row.link.id"
                              (click)="$event.stopPropagation(); resend(row.link)"
                              (keydown.enter)="$event.stopPropagation()"
                            >
                              {{ resendingId() === row.link.id ? 'Reenviando…' : 'Reenviar convite' }}
                            </button>
                          } @else {
                            <span class="perm-text">{{ row.permText }}</span>
                          }
                        </div>
                        <ar-icon class="chev" name="chevron-right" [size]="14" />
                      </div>
                    } @empty {
                      <p class="state-text empty-rows">Nenhum professor com esses filtros.</p>
                    }
                  </div>
                </div>
              </ar-panel-card>

              <ar-panel-card title="Solicitações pendentes" [kicker]="pendingKicker()">
                <div class="pending-list">
                  @for (p of pending(); track p.id; let first = $first) {
                    <div class="pending" [class.first]="first">
                      <div class="pending-head">
                        <ar-avatar [name]="p.professorName" [photoUrl]="p.professorPhotoUrl" [size]="36" zoomable personRole="Professor" />
                        <div class="pending-text">
                          <div class="pending-name">{{ p.professorName }}</div>
                          <div class="pending-sub">{{ pendingSub(p) }}</div>
                        </div>
                      </div>
                      <div class="pending-type">
                        <span>Quer atuar como</span>
                        <ar-prof-type-tag [type]="p.relationshipType" [sm]="true" />
                      </div>
                      @if (canWrite()) {
                        <div class="pending-actions">
                          <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="analyzeId.set(p.id)">Analisar</button>
                          <button type="button" class="ar-ghost-btn danger-text" (click)="askReject(p)">Rejeitar</button>
                        </div>
                      }
                    </div>
                  } @empty {
                    <p class="state-text">Nenhum pedido aguardando. Professores pedem vínculo pela página da arena.</p>
                  }
                </div>
                <ar-prof-note class="pending-note">
                  Ser “Equipe da arena” não dá acesso ao financeiro, aos preços ou à administração. Só valem as
                  permissões marcadas em cada vínculo.
                </ar-prof-note>
              </ar-panel-card>
            </div>
          }
        }
      </div>

      @if (inviteOpen() && arenaId(); as id) {
        <ar-prof-invite-modal
          [arenaId]="id"
          [links]="links()"
          [pageUrl]="pageUrl()"
          (closed)="inviteOpen.set(false)"
          (sent)="onInviteSent($event)"
        />
      }

      @if (analyzing(); as link) {
        <ar-prof-analyze-modal [link]="link" (closed)="analyzeId.set(null)" (approved)="onApproved($event)" (rejectRequested)="askReject(link)" />
      }

      @if (rejectTarget(); as link) {
        <ar-prof-confirm-modal
          [title]="'Rejeitar a solicitação de ' + link.professorName + '?'"
          subtitle="O professor recebe o aviso e pode pedir de novo depois."
          confirmLabel="Rejeitar"
          busyLabel="Rejeitando…"
          [withReason]="true"
          reasonPlaceholder="Ex.: no momento não temos horários livres de manhã"
          [busy]="confirmBusy()"
          [error]="confirmError()"
          (closed)="closeReject()"
          (confirmed)="confirmReject(link, $event)"
        />
      }
    </ar-panel-shell>
  `,
  styles: `
    @use 'breakpoints' as ar;

    .body {
      flex: 1;
      min-height: 0;
      padding: var(--ar-pad-page-y) var(--ar-pad-page-x) 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; line-height: 1.5; }

    .search {
      width: 220px; height: 38px; padding: 0 12px; display: flex; align-items: center; gap: 9px;
      background: var(--nx-surface-0); border: 1px solid var(--nx-line); border-radius: var(--nx-r-2);
      color: var(--nx-text-dim); box-sizing: border-box;
    }
    .search:focus-within { border-color: var(--nx-orange-500); }
    .search input {
      flex: 1; min-width: 0; height: 100%; background: transparent; border: none; outline: none;
      color: var(--nx-text); font-family: var(--nx-font-ui); font-size: 13px;
    }

    .notice {
      flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border-radius: var(--nx-r-2); border: 1px solid rgba(43, 209, 126, 0.35); background: rgba(43, 209, 126, 0.08);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-win);
    }
    .notice.error { border-color: var(--nx-live); background: rgba(255, 59, 48, 0.08); color: var(--nx-live); }
    .notice-dismiss { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; }

    .kpi-row { display: flex; gap: 14px; flex: none; }

    .layout { --ar-split-aside: 320px; }
    .table-card { min-width: 0; }

    .chips { margin-bottom: 16px; }
    .chips .ar-chip { display: inline-flex; align-items: center; gap: 7px; }
    .chip-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
    .chip-sep { width: 1px; align-self: stretch; background: var(--nx-line); margin: 0 4px; }

    .table-head, .table-row {
      display: grid;
      grid-template-columns: minmax(200px, 1fr) 128px 150px 186px 18px;
      gap: 12px;
      align-items: center;
    }
    .table-head {
      padding: 0 0 10px;
      border-bottom: 1px solid var(--nx-line-strong);
    }
    .table-head span {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .table-row { padding: 11px 0; border-bottom: 1px solid var(--nx-line); cursor: pointer; }
    .table-row:last-child { border-bottom: none; }
    .table-row:hover { background: rgba(255, 255, 255, 0.02); }
    .table-row:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: -2px; }
    .table-row.off { opacity: 0.55; }
    .empty-rows { margin: 14px 0 4px; }

    .cell-prof { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .prof-text { min-width: 0; }
    .prof-name-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
    .unread {
      flex: none; height: 18px; padding: 0 6px; border-radius: 9px; border: none; cursor: pointer;
      display: inline-flex; align-items: center; gap: 4px;
      background: var(--nx-orange-500); color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono); font-size: 10px; font-weight: 800;
    }
    .unread:focus-visible { outline: 2px solid var(--nx-text); outline-offset: 1px; }
    .prof-name {
      min-width: 0;
      font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .prof-mod, .date-line {
      font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cell-status { min-width: 0; }
    .date-line { font-size: 9.5px; margin-top: 3px; }
    .cell-perms { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
    .perm {
      height: 20px; padding: 0 7px; border-radius: 5px; display: inline-flex; align-items: center;
      background: var(--nx-surface-1); border: 1px solid var(--nx-line-strong);
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; color: var(--nx-text-mute);
    }
    .perm.perm-off { background: transparent; border-style: dashed; color: var(--nx-text-dim); text-decoration: line-through; }
    .perm-text { font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .link-btn {
      background: none; border: none; padding: 0; cursor: pointer; color: var(--nx-orange-500);
      font-family: var(--nx-font-display); font-weight: 600; font-size: 12px;
    }
    .link-btn:disabled { opacity: 0.6; cursor: default; }
    .chev { color: var(--nx-text-dim); }

    .pending-list { display: flex; flex-direction: column; gap: 10px; }
    .pending { padding: 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid var(--nx-line); }
    .pending.first { border-color: rgba(244, 197, 67, 0.35); }
    .pending-head { display: flex; align-items: center; gap: 10px; }
    .pending-text { flex: 1; min-width: 0; }
    .pending-name { font-family: var(--nx-font-display); font-weight: 700; font-size: 13.5px; color: var(--nx-text); }
    .pending-sub { font-family: var(--nx-font-mono); font-size: 10px; color: var(--nx-text-dim); margin-top: 2px; }
    .pending-type { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 11.5px; color: var(--nx-text-dim); }
    .pending-actions { display: flex; gap: 8px; margin-top: 12px; }
    .danger-text { color: var(--nx-live); }
    .pending-note { margin-top: 14px; }

    .empty-card { flex: 1; }
    .empty {
      max-width: 520px; margin: 24px auto; text-align: center; display: flex; flex-direction: column; align-items: center;
    }
    .empty-icon {
      width: 64px; height: 64px; border-radius: 20px; background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3); display: grid; place-items: center; color: var(--nx-orange-500);
    }
    .empty-title { font-family: var(--nx-font-display); font-weight: 800; font-size: 22px; color: var(--nx-text); margin-top: 18px; }
    .empty-text { font-size: 13.5px; color: var(--nx-text-mute); line-height: 1.55; margin: 8px 0 0; text-wrap: pretty; }
    .empty-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center; }
    .empty-types { display: flex; gap: 12px; margin-top: 30px; width: 100%; }

    @include ar.below(md) {
      .kpi-row { flex-wrap: wrap; }
      .kpi-row ar-aula-stat { flex: 1 1 calc(50% - 7px); }
      .search { width: 100%; }
      .empty-types { flex-direction: column; }
    }
  `,
})
export class PanelProfessionalsComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly service = inject(ArenaProfessorsService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly channelService = inject(ArenaProfessorChannelService);

  protected readonly typeChips = TYPE_CHIPS;
  protected readonly statusChips = PROFESSOR_STATUS_FILTERS;

  protected readonly arenaId = computed(() => this.arenaContext.arenaId());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly canWrite = computed(() => this.access.ready() && this.access.canWrite('perfil'));

  protected readonly links = signal<ArenaProfessorLink[]>([]);
  /** Canais em que o usuário é membro (só a gestão com escrita em `perfil`): badge de não lidas. */
  private readonly channels = signal<ArenaChannel[]>([]);
  private readonly uid = computed(() => this.auth.user()?.uid ?? null);
  private readonly unreadMap = computed(() => unreadByLinkId(this.channels(), this.uid()));
  private readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly loadingView = computed(() => this.arenaContext.loading() || this.loading());
  /** Relógio da tela: o convite vence sem nenhuma escrita no servidor. */
  private readonly now = signal(Date.now());

  protected readonly term = signal('');
  protected readonly typeFilter = signal<ProfessorTypeFilter>('all');
  protected readonly statusFilter = signal<ProfessorStatusFilter>('all');

  protected readonly inviteOpen = signal(false);
  protected readonly analyzeId = signal<string | null>(null);
  protected readonly rejectTarget = signal<ArenaProfessorLink | null>(null);
  protected readonly confirmBusy = signal(false);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly resendingId = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly copied = signal(false);

  protected readonly subtitle = computed(() => {
    const name = this.arenaContext.arenaName() ?? 'Arena';
    return this.links().length === 0 && !this.loadingView() ? `${name} · nenhum professor vinculado` : `${name} · professores vinculados`;
  });

  protected readonly pageUrl = computed(() => arenaProfessorRequestUrl(environment.athleteAppUrl, this.arenaId() ?? ''));

  protected readonly kpis = computed(() => professorKpis(this.links(), this.now()));
  protected readonly staffSub = computed(() => activeKpiSub(this.kpis().staffActive, this.kpis().staffSuspended));
  protected readonly independentSub = computed(() => activeKpiSub(this.kpis().independentActive, this.kpis().independentSuspended));
  protected readonly inviteSub = computed(() => inviteKpiSub(this.kpis()));

  protected readonly pending = computed(() => pendingRequests(this.links()));
  protected readonly pendingKicker = computed(() => {
    const n = this.pending().length;
    if (n === 0) return 'nenhum pedido aguardando';
    return n === 1 ? '1 professor pediu vínculo' : `${n} professores pediram vínculo`;
  });

  /** Linhas fora dos pedidos (que têm o card próprio), antes dos filtros. */
  protected readonly tableTotal = computed(
    () => this.links().filter((l) => statusGroupOf(displayStatus(l, this.now())) !== 'pending').length,
  );
  protected readonly noFilter = computed(() => this.typeFilter() === 'all' && this.statusFilter() === 'all');

  protected readonly rows = computed(() => {
    const now = this.now();
    return filterProfessorRows(this.links(), { type: this.typeFilter(), status: this.statusFilter(), term: this.term() }, now).map(
      (link) => {
        const status = displayStatus(link, now);
        const cell = permissionsCell(link, now);
        const canResend = linkActions(link, now).includes('resendInvite');
        return {
          link,
          status,
          // Fechado fica apagado — menos o convite vencido, que ainda tem ação (reenviar).
          closed: isClosedStatus(status) && !canResend,
          modalities: link.professorModalities.join(' · ') || '—',
          dateLine: statusDateLine(link, now),
          pills: cell.kind === 'pills' ? cell.items : null,
          permText: cell.kind === 'text' ? cell.text : '',
          discountPill: courtDiscountPillLabel(link.courtDiscountPercent, {
            startTime: link.courtDiscountStartTime,
            endTime: link.courtDiscountEndTime,
          }),
          canResend,
          unread: this.unreadMap()[link.id] ?? 0,
          unreadLabel: unreadBadge(this.unreadMap()[link.id] ?? 0),
        };
      },
    );
  });

  /** Modal de análise segue o doc ao vivo; se o pedido sumir da lista, o modal fecha. */
  protected readonly analyzing = computed(() => {
    const id = this.analyzeId();
    return id ? (this.links().find((l) => l.id === id) ?? null) : null;
  });

  constructor() {
    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      this.links.set([]);
      this.loadError.set(null);
      this.loading.set(true);
      if (!arenaId) {
        this.loading.set(false);
        return;
      }
      const stop = this.service.watchLinks(
        arenaId,
        (links) => {
          this.links.set(links);
          this.loading.set(false);
        },
        (message) => {
          this.loadError.set(message);
          this.loading.set(false);
        },
      );
      onCleanup(stop);
    });

    effect((onCleanup) => {
      const arenaId = this.arenaContext.arenaId();
      const uid = this.uid();
      this.channels.set([]);
      if (!arenaId || !uid || !this.canWrite()) return;
      onCleanup(this.channelService.watchArenaChannels(arenaId, uid, (channels) => this.channels.set(channels)));
    });

    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(tick));
  }

  protected openMessages(linkId: string): void {
    void this.router.navigate(['/painel/profissionais', linkId], { queryParams: { aba: 'mensagens' } });
  }

  protected openNotices(): void {
    void this.router.navigate(['/painel/profissionais/comunicados']);
  }

  protected pendingSub(link: ArenaProfessorLink): string {
    const parts = [link.professorModalities.join(' · '), statusDateLine(link, this.now())].filter(Boolean);
    return parts.join(' · ');
  }

  protected resetFilters(): void {
    this.typeFilter.set('all');
    this.statusFilter.set('all');
  }

  protected toggleType(type: ProfessorLinkType): void {
    this.typeFilter.update((current) => (current === type ? 'all' : type));
  }

  protected toggleStatus(group: ProfessorStatusGroup): void {
    this.statusFilter.update((current) => (current === group ? 'all' : group));
  }

  protected open(linkId: string): void {
    void this.router.navigate(['/painel/profissionais', linkId]);
  }

  protected onInviteSent(name: string): void {
    this.inviteOpen.set(false);
    this.notice.set({ tone: 'ok', text: `Convite enviado para ${name}. Ele tem 7 dias para aceitar.` });
  }

  protected onApproved(name: string): void {
    this.analyzeId.set(null);
    this.notice.set({ tone: 'ok', text: `Vínculo com ${name} aprovado.` });
  }

  protected askReject(link: ArenaProfessorLink): void {
    this.analyzeId.set(null);
    this.confirmError.set(null);
    this.rejectTarget.set(link);
  }

  protected closeReject(): void {
    if (this.confirmBusy()) return;
    this.rejectTarget.set(null);
    this.confirmError.set(null);
  }

  protected async confirmReject(link: ArenaProfessorLink, reason: string | null): Promise<void> {
    if (this.confirmBusy()) return;
    this.confirmBusy.set(true);
    this.confirmError.set(null);
    try {
      await this.service.reject(link.id, reason);
      this.rejectTarget.set(null);
      this.notice.set({ tone: 'ok', text: `Solicitação de ${link.professorName} rejeitada.` });
    } catch (err) {
      this.confirmError.set(err instanceof Error ? err.message : 'Não foi possível rejeitar a solicitação.');
    } finally {
      this.confirmBusy.set(false);
    }
  }

  protected async resend(link: ArenaProfessorLink): Promise<void> {
    if (this.resendingId()) return;
    this.resendingId.set(link.id);
    this.notice.set(null);
    try {
      await this.service.invite(resendInviteInput(link));
      this.notice.set({ tone: 'ok', text: `Convite reenviado para ${link.professorName}. Vale por mais 7 dias.` });
    } catch (err) {
      this.notice.set({ tone: 'error', text: err instanceof Error ? err.message : 'Não foi possível reenviar o convite.' });
    } finally {
      this.resendingId.set(null);
    }
  }

  protected async copyPageLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pageUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    } catch {
      this.notice.set({ tone: 'error', text: `Não foi possível copiar. Link da página: ${this.pageUrl()}` });
    }
  }
}
