import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../auth/auth.service';
import { callableErrorMessage } from '../../data/callable-error';
import { SquadBadgesService } from '../../data/squad-badges.service';
import { IconComponent } from '../../ui/icon.component';
import { PanelShellComponent } from '../../ui/panel-shell.component';
import { dayMonthOfKey } from '../comissoes/data/commission';
import { commissionFloor } from '../niveis-regras/data/squad-rules';
import { STAGES, dropAction, freeSeats, nextCycleStart, type ArchivedReason, type Stage } from '../data/squad-program';
import { SquadProgramRepository, type SendInviteInput } from '../data/squad-program.repository';
import { InviteDialogComponent, type PresetAthlete } from '../ui/invite-dialog.component';
import {
  ARCHIVED_LABELS,
  COLUMN_LABELS,
  byColumn,
  cardFacts,
  cardNote,
  isHot,
  matchesApplication,
  placeOf,
  type Application,
  type Column,
  type Invite,
} from './data/application';
import { ApplicationsRepository, type BoardState } from './data/applications.repository';
import { ApplicationCardComponent } from './ui/application-card.component';
import { ApplicationDrawerComponent, type DrawerAction } from './ui/application-drawer.component';

type ArchivedFilter = 'all' | Exclude<ArchivedReason, 'accepted'>;
const ARCHIVED_FILTERS: readonly ArchivedFilter[] = ['all', 'rejected', 'waitlist', 'expired', 'canceled'];

/** `not-found` cru ("NOT FOUND") é callable que ainda não foi publicada, não registro sumido. */
function errorText(error: unknown): string {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  if (code.includes('not-found')) {
    return message && message !== 'NOT FOUND' ? message : 'Função ainda não publicada no servidor.';
  }
  return callableErrorMessage(error);
}

/**
 * Squad › Candidaturas & convites (tela 04). Kanban das candidaturas (`squadApplications`) com os
 * convites (`squadInvites`); arrastar entre colunas vizinhas = a ação do card. Escrita só por callable.
 */
@Component({
  selector: 'bo-panel-candidaturas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, IconComponent, ApplicationCardComponent, ApplicationDrawerComponent, InviteDialogComponent],
  template: `
    <bo-panel-shell>
      <header class="head">
        <div class="titles">
          <div class="crumb">Squad</div>
          <h1>Candidaturas &amp; convites
            @if (data()) {
              <span class="cap" [class.full]="seatsLeft() === 0">
                {{ seatsLeft() === 0 ? 'Piloto cheio · lista de espera' : seatsLeft() + (seatsLeft() === 1 ? ' vaga no ciclo' : ' vagas no ciclo') }}
              </span>
            }
          </h1>
        </div>
        <div class="spacer"></div>
        <label class="search">
          <bo-icon name="search" [size]="15" />
          <input type="search" placeholder="Buscar candidato..." aria-label="Buscar candidato (nome, @ ou cidade)"
            [value]="term()" (input)="term.set(text($event))" />
        </label>
        @if (canEdit()) {
          <button type="button" class="bo-mini-btn bo-mini-btn-primary big" [disabled]="!data()" (click)="openInvite(null)">
            <bo-icon name="plus" [size]="14" /> Convidar atleta
          </button>
        }
      </header>

      <div class="body">
        <div class="criteria">
          <bo-icon name="squad" [size]="18" />
          <p><strong>Seleção criteriosa, não aleatória.</strong> Os dados de torneios, Elo e indicações vêm do próprio NexaGO — seguidores entram como critério secundário.</p>
          @if (data()) {
            <span class="next">Próximo ciclo · {{ nextCycle() }}</span>
          }
        </div>

        @if (error(); as e) {
          <div class="bo-alert" role="alert">
            <bo-icon name="alert" [size]="16" />
            <span>{{ e }}</span>
            <button type="button" class="bo-mini-btn push" (click)="error.set(null)">Fechar</button>
          </div>
        }

        @switch (state()) {
          @case ('loading') {
            <div class="skel" aria-busy="true" aria-label="Carregando candidaturas"></div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="reload()">Tentar de novo</button>
            </div>
          }
          @default {
            @if (showArchived()) {
              <section class="archived" aria-label="Arquivadas">
                <div class="arch-head">
                  <button type="button" class="bo-mini-btn" (click)="showArchived.set(false)">
                    <bo-icon name="chevron-left" [size]="13" /> Voltar ao kanban
                  </button>
                  <div class="chips" role="tablist" aria-label="Motivo">
                    @for (f of archivedFilters; track f) {
                      <button type="button" role="tab" class="chip" [class.on]="archivedFilter() === f" [attr.aria-selected]="archivedFilter() === f"
                        (click)="archivedFilter.set(f)">{{ f === 'all' ? 'Todas' : archivedLabels[f] }} <span>{{ archivedCount(f) }}</span></button>
                    }
                  </div>
                </div>
                @if (archivedLoading()) {
                  <div class="skel small" aria-busy="true"></div>
                } @else {
                  <div class="grid">
                    @for (a of archivedVisible(); track a.id) {
                      <div class="arch-card">
                        <span class="reason">{{ a.archivedReason ? archivedLabels[a.archivedReason] : '' }}</span>
                        <bo-application-card
                          [app]="a" [facts]="facts(a)" [note]="a.internalReason" [place]="place(a)" [term]="term()"
                          (opened)="open(a)" />
                      </div>
                    } @empty {
                      <p class="none">Nenhuma candidatura arquivada{{ term().trim() ? ' com "' + term().trim() + '"' : '' }}.</p>
                    }
                  </div>
                }
              </section>
            } @else {
              <div class="board">
                @for (col of columns; track col) {
                  <section class="col" [class.drop-ok]="dropTarget() === col" [attr.aria-label]="columnLabels[col]"
                    (dragover)="onDragOver($event, col)" (dragleave)="onDragLeave(col)" (drop)="onDrop($event, col)">
                    <h2>{{ columnLabels[col] }} <span>{{ visible()[col].length }}</span></h2>
                    <div class="cards">
                      @for (a of visible()[col]; track a.id) {
                        <bo-application-card
                          [app]="a"
                          [facts]="facts(a)"
                          [note]="note(a)"
                          [place]="place(a)"
                          [hot]="hot(a)"
                          [term]="term()"
                          [draggable]="canDrag(a)"
                          [dragging]="dragId() === a.id"
                          (opened)="open(a)"
                          (dragstart)="onDragStart($event, a)"
                          (dragend)="onDragEnd()"
                        />
                      } @empty {
                        <p class="none">{{ term().trim() ? 'Nada encontrado para "' + term().trim() + '"' : 'Nenhuma candidatura aqui' }}</p>
                      }
                    </div>
                    <button type="button" class="see-archived" (click)="openArchived()">Ver arquivadas</button>
                  </section>
                }
              </div>
            }
          }
        }
      </div>

      @if (toast(); as t) {
        <div class="toast" role="status"><bo-icon name="check" [size]="15" /> {{ t }}</div>
      }

      @if (current(); as a) {
        <bo-application-drawer
          [app]="a"
          [invite]="inviteOf(a)"
          [place]="place(a)"
          [canEdit]="canEdit()"
          [busy]="busy()"
          [error]="drawerError()"
          (action)="onDrawerAction(a, $event)"
          (closed)="currentId.set(null)"
        />
      }

      @if (data(); as d) {
        <bo-invite-dialog
          [open]="inviteOpen()"
          [rules]="d.rules"
          [rulesVersion]="d.rulesVersion"
          [cycle]="d.cycle"
          [pilotFull]="seatsLeft() === 0"
          [contracts]="d.contracts"
          [preset]="preset()"
          [busy]="busy()"
          [error]="inviteError()"
          [now]="now"
          (submitted)="sendInvite($event)"
          (dismissed)="inviteOpen.set(false)"
        />
      }
    </bo-panel-shell>
  `,
  styles: `
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 32px; border-bottom: 1px solid var(--nx-line); flex-wrap: wrap; }
    .titles { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .crumb { font-family: var(--nx-font-mono); font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    h1 { margin: 0; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em; }
    .cap { display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: var(--nx-r-pill); font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-win); background: rgba(43, 209, 126, 0.08); border: 1px solid rgba(43, 209, 126, 0.35); }
    .cap.full { color: var(--nx-pending); background: rgba(244, 197, 67, 0.08); border-color: rgba(244, 197, 67, 0.45); }
    .spacer { flex: 1; }
    .search { width: min(340px, 100%); height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 14px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-dim); }
    .search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--nx-text); font-size: 14px; }
    .big { height: 42px; padding: 0 18px; font-size: 14px; }
    .body { flex: 1; padding: 22px 32px 32px; display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .criteria { display: flex; align-items: center; gap: 14px; padding: 16px 22px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-orange-500); }
    .criteria p { flex: 1; margin: 0; font-size: 14px; color: var(--nx-text-mute); }
    .criteria strong { color: var(--nx-text); font-family: var(--nx-font-display); }
    .next { font-family: var(--nx-font-mono); font-size: 12.5px; color: var(--nx-text-dim); white-space: nowrap; }
    .push { margin-left: auto; flex: none; }
    .skel { height: 560px; border-radius: var(--nx-r-4); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .skel.small { height: 240px; }
    .board { display: grid; grid-template-columns: repeat(4, minmax(260px, 1fr)); gap: 18px; overflow-x: auto; align-items: stretch; }
    .col { display: flex; flex-direction: column; gap: 14px; min-height: 520px; padding: 18px 16px; border-radius: var(--nx-r-4); border: 1px solid var(--nx-line); background: rgba(255, 255, 255, 0.012); transition: border-color 120ms var(--nx-ease-out), background 120ms; }
    .col.drop-ok { border-color: rgba(255, 106, 26, 0.6); background: var(--nx-orange-tint); }
    .col h2 { margin: 0 4px; font-family: var(--nx-font-display); font-weight: 700; font-size: 17px; }
    .col h2 span { margin-left: 6px; font-family: var(--nx-font-mono); font-size: 11px; font-weight: 500; color: var(--nx-text-dim); }
    .cards { flex: 1; display: flex; flex-direction: column; gap: 14px; }
    .none { margin: 4px; font-size: 13px; color: var(--nx-text-dim); }
    .see-archived { align-self: flex-start; margin: 0 4px; padding: 0; border: none; background: none; color: var(--nx-text-dim); font-size: 12.5px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .see-archived:hover { color: var(--nx-text); }
    .archived { display: flex; flex-direction: column; gap: 16px; }
    .arch-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { height: 34px; padding: 0 12px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line); background: var(--nx-surface-0); color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; cursor: pointer; }
    .chip span { margin-left: 4px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); }
    .chip.on { color: var(--nx-text); border-color: rgba(255, 106, 26, 0.45); background: var(--nx-orange-tint); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .arch-card { display: flex; flex-direction: column; gap: 6px; }
    .reason { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: var(--nx-text-dim); }
    .toast { position: fixed; right: 24px; bottom: 24px; z-index: 50; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: var(--nx-r-3); background: var(--nx-surface-1); border: 1px solid rgba(43, 209, 126, 0.4); font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); }
    @media (max-width: 760px) {
      .head, .body { padding-left: 16px; padding-right: 16px; }
      .criteria { flex-wrap: wrap; }
    }
  `,
})
export class PanelCandidaturasComponent {
  private readonly repo = inject(ApplicationsRepository);
  private readonly program = inject(SquadProgramRepository);
  private readonly auth = inject(AuthService);
  private readonly badges = inject(SquadBadgesService);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly now = new Date();
  protected readonly columns = STAGES;
  protected readonly columnLabels = COLUMN_LABELS;
  protected readonly archivedLabels = ARCHIVED_LABELS;
  protected readonly archivedFilters = ARCHIVED_FILTERS;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly data = signal<BoardState | null>(null);
  protected readonly term = signal('');

  protected readonly showArchived = signal(false);
  protected readonly archived = signal<Application[] | null>(null);
  protected readonly archivedInvites = signal<Invite[]>([]);
  protected readonly archivedLoading = signal(false);
  protected readonly archivedFilter = signal<ArchivedFilter>('all');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly drawerError = signal<string | null>(null);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly currentId = signal<string | null>(null);
  protected readonly inviteOpen = signal(false);
  protected readonly preset = signal<PresetAthlete | null>(null);

  protected readonly dragId = signal<string | null>(null);
  protected readonly dropTarget = signal<Column | null>(null);

  private readonly roles = computed(() => new Set(this.auth.roles()));
  /** Admin e Growth editam; Financeiro (e o resto) só lê. */
  protected readonly canEdit = computed(() => this.auth.isSuperAdmin() || ['admin', 'growth'].some((r) => this.roles().has(r)));

  protected readonly seatsLeft = computed(() => {
    const d = this.data();
    return d ? freeSeats(d.cycle, d.contracts.length, d.outstandingInvites) : 0;
  });
  protected readonly nextCycle = computed(() => {
    const d = this.data();
    return d ? dayMonthOfKey(nextCycleStart(d.cycle)) : '';
  });

  private readonly invitesById = computed(() => {
    const map = new Map<string, Invite>();
    for (const i of [...(this.data()?.invites ?? []), ...this.archivedInvites()]) map.set(i.id, i);
    return map;
  });
  protected readonly visible = computed(() => {
    const apps = (this.data()?.applications ?? []).filter((a) => matchesApplication(a, this.term()));
    return byColumn(apps);
  });
  protected readonly archivedVisible = computed(() => {
    const f = this.archivedFilter();
    return (this.archived() ?? []).filter((a) => (f === 'all' || a.archivedReason === f) && matchesApplication(a, this.term()));
  });

  /** A candidatura do drawer, relida depois de cada ação. */
  protected readonly current = computed(() => {
    const id = this.currentId();
    if (!id) return null;
    return this.data()?.applications.find((a) => a.id === id) ?? this.archived()?.find((a) => a.id === id) ?? null;
  });

  constructor() {
    void this.reload();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.toastTimer));
  }

  async reload(silent = false): Promise<void> {
    try {
      const d = await this.repo.board();
      this.data.set(d);
      this.state.set('ready');
      this.badges.setNewApplications(d.applications.filter((a) => a.stage === 'new').length);
      if (this.archived() !== null) await this.loadArchived();
    } catch (error) {
      this.loadError.set(callableErrorMessage(error));
      this.state.set('error');
    }
  }

  private async loadArchived(): Promise<void> {
    this.archivedLoading.set(true);
    try {
      const list = await this.repo.archived();
      this.archived.set(list);
      this.archivedInvites.set(await this.repo.invitesFor(list.filter((a) => a.archivedReason === 'expired').map((a) => a.id)));
    } catch (error) {
      this.error.set(callableErrorMessage(error));
    } finally {
      this.archivedLoading.set(false);
    }
  }

  protected openArchived(): void {
    this.showArchived.set(true);
    if (this.archived() === null) void this.loadArchived();
  }

  protected archivedCount(f: ArchivedFilter): number {
    const list = this.archived() ?? [];
    return f === 'all' ? list.length : list.filter((a) => a.archivedReason === f).length;
  }

  // ── card ─────────────────────────────────────────────────────────────────

  protected inviteOf(a: Application): Invite | null {
    if (a.inviteId) {
      const byId = this.invitesById().get(a.inviteId);
      if (byId) return byId;
    }
    return [...this.invitesById().values()].find((i) => i.applicationId === a.id) ?? null;
  }

  protected facts(a: Application) {
    const d = this.data();
    const invite = this.inviteOf(a);
    const pct = d && invite ? commissionFloor(d.rules.tiers[invite.tier].commissionPct) : null;
    return cardFacts(a, invite, pct);
  }

  protected note(a: Application): string | null {
    return cardNote(a, this.inviteOf(a), this.now);
  }

  protected place(a: Application): string {
    return placeOf(a);
  }

  protected hot(a: Application): boolean {
    return isHot(a);
  }

  protected open(a: Application): void {
    this.drawerError.set(null);
    this.currentId.set(a.id);
  }

  // ── arrastar ─────────────────────────────────────────────────────────────

  protected canDrag(a: Application): boolean {
    return this.canEdit() && (a.stage === 'new' || a.stage === 'review');
  }

  protected onDragStart(event: DragEvent, a: Application): void {
    if (!this.canDrag(a)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', a.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragId.set(a.id);
  }

  protected onDragEnd(): void {
    this.dragId.set(null);
    this.dropTarget.set(null);
  }

  private dragged(): Application | null {
    const id = this.dragId();
    return id ? (this.data()?.applications.find((a) => a.id === id) ?? null) : null;
  }

  protected onDragOver(event: DragEvent, col: Column): void {
    const a = this.dragged();
    if (!a || !dropAction(a.stage, col)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropTarget.set(col);
  }

  protected onDragLeave(col: Column): void {
    if (this.dropTarget() === col) this.dropTarget.set(null);
  }

  protected onDrop(event: DragEvent, col: Column): void {
    event.preventDefault();
    const a = this.dragged();
    this.onDragEnd();
    if (!a) return;
    const action = dropAction(a.stage as Stage, col);
    if (action === 'review') void this.applicationAction(a, { action: 'review' }, `${a.name} em análise`);
    if (action === 'invite') this.openInvite(a);
  }

  // ── ações ────────────────────────────────────────────────────────────────

  protected openInvite(a: Application | null): void {
    this.inviteError.set(null);
    this.preset.set(a ? { uid: a.athleteId, name: a.name, applicationId: a.id, suggestedTier: a.suggestedTier } : null);
    this.inviteOpen.set(true);
  }

  protected async sendInvite(input: SendInviteInput): Promise<void> {
    this.busy.set(true);
    this.inviteError.set(null);
    try {
      const out = await this.program.sendInvite(input);
      this.inviteOpen.set(false);
      this.showToast(
        out.status === 'scheduled' && out.scheduledFor
          ? `Convite agendado para ${dayMonthOfKey(out.scheduledFor)}`
          : 'Convite enviado · push no app do atleta',
      );
      await this.reload(true);
    } catch (error) {
      this.inviteError.set(errorText(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected onDrawerAction(a: Application, e: DrawerAction): void {
    switch (e.kind) {
      case 'invite':
        this.openInvite(a);
        return;
      case 'resend':
      case 'cancel': {
        const invite = this.inviteOf(a);
        if (!invite) return;
        const done =
          e.kind === 'cancel'
            ? 'Convite cancelado'
            : invite.status === 'opened'
              ? `Lembrete enviado a ${a.name}`
              : `Convite reenviado a ${a.name} · prazo de 7 dias recomeça`;
        void this.run(() => this.program.updateInvite(invite.id, e.kind as 'resend' | 'cancel'), done);
        return;
      }
      case 'review':
        void this.applicationAction(a, { action: 'review' }, `${a.name} em análise`);
        return;
      case 'restore':
        void this.applicationAction(a, { action: 'restore' }, `${a.name} voltou para análise`);
        return;
      case 'reject':
        void this.applicationAction(a, { action: 'reject', reason: e.reason }, 'Candidatura recusada · atleta avisado');
        return;
      case 'waitlist':
        void this.applicationAction(a, { action: 'waitlist', reason: e.reason }, `${a.name} na lista de espera`);
        return;
      case 'note':
        void this.applicationAction(a, { action: 'note', text: e.text }, 'Nota adicionada');
        return;
      case 'social':
        void this.applicationAction(
          a,
          { action: 'social', followers: e.followers, engagementPct: e.engagementPct },
          'Redes atualizadas',
        );
        return;
      case 'suggest':
        void this.applicationAction(a, { action: 'suggest', tier: e.tier }, 'Sugestão atualizada');
        return;
    }
  }

  private applicationAction(a: Application, input: Record<string, unknown> & { action: string }, done: string): Promise<boolean> {
    return this.run(() => this.program.updateApplication(a.id, input), done);
  }

  private async run(action: () => Promise<void>, done: string): Promise<boolean> {
    this.busy.set(true);
    this.drawerError.set(null);
    try {
      await action();
      this.showToast(done);
      await this.reload(true);
      return true;
    } catch (error) {
      if (this.currentId()) this.drawerError.set(errorText(error));
      else this.error.set(errorText(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}
