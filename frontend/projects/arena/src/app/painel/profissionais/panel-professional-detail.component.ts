import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { AvatarComponent } from '../ui/avatar.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import {
  detailSubtitle,
  displayStatus,
  effectivePermissions,
  eventMetaLine,
  eventTitle,
  isClosedStatus,
  defaultProfessorPermissions,
  linkActions,
  permissionAllowedForType,
  permissionsEditable,
  permissionsStateNote,
  resendInviteInput,
  type ArenaProfessorEvent,
  type ArenaProfessorLink,
  type ProfessorPermissionKey,
  type ProfessorPermissions,
} from './arena-professor.model';
import { ArenaProfessorsService } from './arena-professors.service';
import { arenaChannelConversationId, unreadBadge, unreadFor, type ArenaChannel } from './arena-professor-channel.model';
import { ArenaProfessorChannelService } from './arena-professor-channel.service';
import { ProfessorChannelComponent } from './professor-channel.component';
import {
  ProfessorAnalyzeModalComponent,
  ProfessorConfirmModalComponent,
  ProfessorSuspendModalComponent,
} from './professor-modals.component';
import {
  ProfessorNoteComponent,
  ProfessorPermListComponent,
  ProfessorStatusComponent,
  ProfessorTimelineComponent,
  ProfessorTypeTagComponent,
  type PermissionChange,
  type TimelineItem,
} from './professor-ui';

type ConfirmKind = 'end' | 'cancel' | 'reject';

interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

/** A4 · Detalhe do vínculo — dados do professor, permissões (ajuste item a item, cada mudança
 *  vira evento no histórico), histórico imutável e as ações que o estado atual permite. */
@Component({
  selector: 'ar-panel-professional-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    IconComponent,
    AvatarComponent,
    ProfessorTypeTagComponent,
    ProfessorStatusComponent,
    ProfessorPermListComponent,
    ProfessorNoteComponent,
    ProfessorTimelineComponent,
    ProfessorAnalyzeModalComponent,
    ProfessorSuspendModalComponent,
    ProfessorConfirmModalComponent,
    ProfessorChannelComponent,
  ],
  template: `
    <ar-panel-shell>
      <ar-page-header [title]="title()" [subtitle]="subtitle()">
        <button type="button" class="ar-mini-btn" (click)="back()">
          <ar-icon name="chevron-left" [size]="14" />
          Profissionais
        </button>
        @if (canWrite() && link(); as l) {
          @for (action of actions(); track action) {
            @switch (action) {
              @case ('analyze') {
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="analyzeOpen.set(true)">Analisar</button>
              }
              @case ('suspend') {
                <button type="button" class="ar-mini-btn" [disabled]="actionBusy()" (click)="suspendOpen.set(true)">Suspender</button>
              }
              @case ('reactivate') {
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="actionBusy()" (click)="reactivate(l)">
                  {{ actionBusy() ? 'Reativando…' : 'Reativar' }}
                </button>
              }
              @case ('end') {
                <button type="button" class="ar-mini-btn danger" [disabled]="actionBusy()" (click)="askConfirm('end')">Encerrar vínculo</button>
              }
              @case ('resendInvite') {
                <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="actionBusy()" (click)="resend(l)">
                  {{ actionBusy() ? 'Reenviando…' : 'Reenviar convite' }}
                </button>
              }
              @case ('cancelInvite') {
                <button type="button" class="ar-mini-btn" [disabled]="actionBusy()" (click)="askConfirm('cancel')">Cancelar convite</button>
              }
            }
          }
        }
      </ar-page-header>

      <div class="body">
        @if (loadingView()) {
          <ar-panel-card pad="lg"><p class="state-text">Carregando vínculo…</p></ar-panel-card>
        } @else if (!link()) {
          <ar-panel-card pad="lg">
            <p class="state-text">Vínculo não encontrado nesta arena.</p>
          </ar-panel-card>
        } @else if (link(); as l) {
          @if (notice(); as n) {
            <div class="notice" [class.error]="n.tone === 'error'" role="status">
              <span>{{ n.text }}</span>
              <button type="button" class="notice-dismiss" aria-label="Fechar aviso" (click)="notice.set(null)">×</button>
            </div>
          }

          <div class="tabs" role="tablist" aria-label="Seções do vínculo">
            <button type="button" role="tab" class="ar-chip" [class.active]="tab() === 'vinculo'" [attr.aria-selected]="tab() === 'vinculo'" (click)="selectTab('vinculo')">
              Vínculo
            </button>
            <button type="button" role="tab" class="ar-chip tab-msg" [class.active]="tab() === 'mensagens'" [attr.aria-selected]="tab() === 'mensagens'" (click)="selectTab('mensagens')">
              Mensagens
              @if (unread() > 0) {
                <span class="tab-badge" [attr.aria-label]="unread() + ' não lidas'">{{ unreadLabel() }}</span>
              }
            </button>
          </div>

          @if (tab() === 'mensagens') {
            <ar-prof-channel [link]="l" [canWrite]="canWrite()" />
          } @else {
          <div class="grid">
            <ar-panel-card pad="lg">
              <div class="who">
                <ar-avatar [name]="l.professorName" [photoUrl]="l.professorPhotoUrl" [size]="56" zoomable personRole="Professor" />
                <div class="who-text">
                  <div class="who-name">{{ l.professorName }}</div>
                  <div class="who-sub">{{ modalities() }}</div>
                </div>
              </div>
              <div class="facts">
                <div class="fact"><span class="kick">Tipo</span><ar-prof-type-tag [type]="l.relationshipType" [sm]="true" /></div>
                <div class="fact"><span class="kick">Status</span><ar-prof-status [status]="status()" /></div>
                <div class="fact"><span class="kick">Iniciado por</span><span class="fact-v">{{ l.initiatedBy === 'ARENA' ? 'Arena' : 'Professor' }}</span></div>
                @if (l.approvedByName) {
                  <div class="fact"><span class="kick">Aprovado por</span><span class="fact-v">{{ l.approvedByName }}</span></div>
                } @else if (l.invitedByName) {
                  <div class="fact"><span class="kick">Convidado por</span><span class="fact-v">{{ l.invitedByName }}</span></div>
                }
                @if (reasonFact(); as r) {
                  <div class="fact fact-col"><span class="kick">{{ r.label }}</span><span class="fact-v">{{ r.text }}</span></div>
                }
              </div>
              @if (l.message) {
                <div class="kick msg-kick">{{ l.initiatedBy === 'ARENA' ? 'Mensagem do convite' : 'Mensagem do pedido' }}</div>
                <div class="msg">“{{ l.message }}”</div>
              }
            </ar-panel-card>

            <ar-panel-card title="Permissões neste vínculo" kicker="Alterações ficam no histórico">
              @if (permError(); as err) {
                <div class="error-banner">{{ err }}</div>
              }
              <ar-prof-perm-list
                [permissions]="shownPermissions()"
                [relationshipType]="l.relationshipType"
                [editable]="!closed()"
                [disabled]="!canEditPermissions()"
                [busyKey]="saving()?.key ?? null"
                (changed)="changePermission(l, $event)"
              />
              @if (permNote(); as note) {
                <ar-prof-note tone="yellow" class="card-note">{{ note }}</ar-prof-note>
              }
              <ar-prof-note class="card-note">
                Sem acesso a financeiro, preços ou administração da arena — independentemente do tipo de vínculo.
              </ar-prof-note>
            </ar-panel-card>

            <ar-panel-card title="Histórico" kicker="Eventos imutáveis">
              @if (timeline().length > 0) {
                <ar-prof-timeline [items]="timeline()" />
              } @else {
                <p class="state-text">Sem eventos registrados ainda.</p>
              }
            </ar-panel-card>
          </div>
          }
        }
      </div>

      @if (link(); as l) {
        @if (analyzeOpen() && l.status === 'PENDING') {
          <ar-prof-analyze-modal [link]="l" (closed)="analyzeOpen.set(false)" (approved)="onApproved($event)" (rejectRequested)="askConfirm('reject')" />
        }
        @if (suspendOpen()) {
          <ar-prof-suspend-modal [link]="l" (closed)="suspendOpen.set(false)" (suspended)="onSuspended(l)" />
        }
        @switch (confirmKind()) {
          @case ('end') {
            <ar-prof-confirm-modal
              [title]="'Encerrar o vínculo com ' + l.professorName + '?'"
              subtitle="As permissões dele nesta arena acabam agora e ele sai da página pública. O histórico fica guardado e os vínculos com outras arenas não mudam."
              confirmLabel="Encerrar vínculo"
              busyLabel="Encerrando…"
              [withReason]="true"
              [busy]="confirmBusy()"
              [error]="confirmError()"
              (closed)="closeConfirm()"
              (confirmed)="confirm(l, 'end', $event)"
            />
          }
          @case ('cancel') {
            <ar-prof-confirm-modal
              [title]="'Cancelar o convite para ' + l.professorName + '?'"
              subtitle="O convite deixa de valer. Você pode convidar de novo quando quiser."
              confirmLabel="Cancelar convite"
              busyLabel="Cancelando…"
              [busy]="confirmBusy()"
              [error]="confirmError()"
              (closed)="closeConfirm()"
              (confirmed)="confirm(l, 'cancel', $event)"
            />
          }
          @case ('reject') {
            <ar-prof-confirm-modal
              [title]="'Rejeitar a solicitação de ' + l.professorName + '?'"
              subtitle="O professor recebe o aviso e pode pedir de novo depois."
              confirmLabel="Rejeitar"
              busyLabel="Rejeitando…"
              [withReason]="true"
              [busy]="confirmBusy()"
              [error]="confirmError()"
              (closed)="closeConfirm()"
              (confirmed)="confirm(l, 'reject', $event)"
            />
          }
        }
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

    .danger { background: var(--nx-live); border-color: var(--nx-live); color: #fff; }
    .danger:hover:not(:disabled) { background: #ff564c; }

    .notice {
      flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border-radius: var(--nx-r-2); border: 1px solid rgba(43, 209, 126, 0.35); background: rgba(43, 209, 126, 0.08);
      padding: 10px 14px; font-size: 12.5px; color: var(--nx-win);
    }
    .notice.error { border-color: var(--nx-live); background: rgba(255, 59, 48, 0.08); color: var(--nx-live); }
    .notice-dismiss { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; }

    .error-banner {
      border-radius: var(--nx-r-2); border: 1px solid var(--nx-live); background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live); padding: 10px 14px; font-size: 12.5px; margin-bottom: 8px;
    }

    .grid { display: grid; grid-template-columns: 360px minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }

    .who { display: flex; align-items: center; gap: 14px; }
    .who-text { min-width: 0; }
    .who-name { font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; color: var(--nx-text); overflow-wrap: anywhere; }
    .who-sub { font-size: 12px; color: var(--nx-text-dim); margin-top: 3px; }

    .kick {
      font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--nx-text-dim);
    }
    .facts { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
    .fact {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding-bottom: 12px; border-bottom: 1px solid var(--nx-line);
    }
    .fact-col { flex-direction: column; align-items: flex-start; gap: 6px; }
    .fact-v { font-size: 12.5px; color: var(--nx-text); text-align: right; overflow-wrap: anywhere; }
    .fact-col .fact-v { text-align: left; line-height: 1.45; }
    .msg-kick { display: block; margin-top: 18px; margin-bottom: 8px; }
    .msg { font-size: 13px; color: var(--nx-text); line-height: 1.5; overflow-wrap: anywhere; }

    .card-note { margin-top: 14px; }

    .tabs { flex: none; display: flex; gap: 8px; }
    .tab-msg { display: inline-flex; align-items: center; gap: 7px; }
    .tab-badge {
      min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; box-sizing: border-box;
      background: var(--nx-orange-500); color: var(--nx-text-on-orange);
      font-family: var(--nx-font-mono); font-size: 10px; font-weight: 800; display: inline-grid; place-items: center;
    }
    .ar-chip.active .tab-badge { background: var(--nx-text-on-orange); color: var(--nx-orange-500); }

    @include ar.below(lg) {
      .grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .grid > :first-child { grid-column: 1 / -1; }
    }

    @include ar.below(md) {
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class PanelProfessionalDetailComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly service = inject(ArenaProfessorsService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly channelService = inject(ArenaProfessorChannelService);

  /** Da rota `painel/profissionais/:linkId` (`withComponentInputBinding`). */
  readonly linkId = input.required<string>();
  /** Query param `?aba=mensagens` (link do push de mensagem do professor). */
  readonly aba = input<string | undefined>();

  protected readonly tab = computed<'vinculo' | 'mensagens'>(() => (this.aba() === 'mensagens' ? 'mensagens' : 'vinculo'));
  /** Doc do canal só para o badge da aba — quem não é membro recebe `null` (rule nega a leitura). */
  private readonly channel = signal<ArenaChannel | null>(null);
  /** String: o efeito só reassina quando muda o canal, não a cada snapshot do vínculo. */
  private readonly conversationId = computed(() => {
    const link = this.link();
    return link && this.canWrite() ? arenaChannelConversationId(link.arenaId, link.professorUserId) : null;
  });
  protected readonly unread = computed(() => unreadFor(this.channel(), this.auth.user()?.uid ?? null));
  protected readonly unreadLabel = computed(() => unreadBadge(this.unread()));

  private readonly rawLink = signal<ArenaProfessorLink | null>(null);
  private readonly loading = signal(true);
  private readonly events = signal<ArenaProfessorEvent[]>([]);
  private readonly now = signal(Date.now());

  protected readonly canWrite = computed(() => this.access.ready() && this.access.canWrite('perfil'));
  /** Só o vínculo da arena selecionada — trocar de arena com o detalhe aberto não mostra o de outra. */
  protected readonly link = computed(() => {
    const link = this.rawLink();
    return link && link.arenaId === this.arenaContext.arenaId() ? link : null;
  });
  protected readonly loadingView = computed(() => this.arenaContext.loading() || this.loading());

  protected readonly status = computed(() => {
    const link = this.link();
    return link ? displayStatus(link, this.now()) : 'PENDING';
  });
  protected readonly closed = computed(() => isClosedStatus(this.status()));
  protected readonly actions = computed(() => {
    const link = this.link();
    return link ? linkActions(link, this.now()) : [];
  });

  protected readonly title = computed(() => {
    const link = this.link();
    return link ? `Profissionais › ${link.professorName}` : 'Profissionais';
  });
  protected readonly subtitle = computed(() => {
    const link = this.link();
    return link ? detailSubtitle(link, this.now()) : '';
  });
  protected readonly modalities = computed(() => this.link()?.professorModalities.join(' · ') || 'Modalidades não informadas');

  protected readonly reasonFact = computed<{ label: string; text: string } | null>(() => {
    const link = this.link();
    if (!link) return null;
    if (link.status === 'SUSPENDED' && link.suspensionReason) {
      const text = link.suspensionDetails ? `${link.suspensionReason} — ${link.suspensionDetails}` : link.suspensionReason;
      return { label: 'Motivo da suspensão', text };
    }
    if (link.status === 'ENDED' && link.endedReason) {
      return { label: link.endedBySide === 'PROFESSOR' ? 'Encerrado pelo professor' : 'Motivo do encerramento', text: link.endedReason };
    }
    if (link.status === 'REJECTED' && link.rejectionReason) return { label: 'Motivo da recusa', text: link.rejectionReason };
    return null;
  });

  /** Toggle em gravação: mostra o valor novo até o listener trazer o doc já alterado — soltar
   *  na resposta do callable faria o toggle piscar de volta antes do snapshot chegar. */
  protected readonly saving = signal<{ key: ProfessorPermissionKey; value: boolean; inFlight: boolean } | null>(null);
  private echoTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly permError = signal<string | null>(null);
  protected readonly canEditPermissions = computed(
    () => this.canWrite() && permissionsEditable(this.status()) && this.saving() == null,
  );
  protected readonly shownPermissions = computed<ProfessorPermissions>(() => {
    const link = this.link();
    if (!link) return { ...defaultProfessorPermissions('INDEPENDENT'), canManageOwnLessons: false, canBookCourts: false };
    // Fechado: mostra o que vale (nada). Aberto: a configuração, que é o que o toggle edita.
    const base = this.closed() ? effectivePermissions(link) : link.permissions;
    const saving = this.saving();
    return saving ? { ...base, [saving.key]: saving.value } : base;
  });
  protected readonly permNote = computed(() => {
    const link = this.link();
    return link ? permissionsStateNote(link, this.now()) : null;
  });

  protected readonly timeline = computed<TimelineItem[]>(() => {
    const link = this.link();
    if (!link) return [];
    return this.events().map((event) => ({ id: event.id, title: eventTitle(event, link), meta: eventMetaLine(event) }));
  });

  protected readonly analyzeOpen = signal(false);
  protected readonly suspendOpen = signal(false);
  protected readonly confirmKind = signal<ConfirmKind | null>(null);
  protected readonly confirmBusy = signal(false);
  protected readonly confirmError = signal<string | null>(null);
  protected readonly actionBusy = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  constructor() {
    effect((onCleanup) => {
      const linkId = this.linkId();
      this.rawLink.set(null);
      this.events.set([]);
      this.loading.set(true);
      const stopLink = this.service.watchLink(linkId, (link) => {
        this.rawLink.set(link);
        this.loading.set(false);
      });
      const stopEvents = this.service.watchEvents(linkId, (events) => this.events.set(events));
      onCleanup(() => {
        stopLink();
        stopEvents();
      });
    });

    effect((onCleanup) => {
      const conversationId = this.conversationId();
      this.channel.set(null);
      if (!conversationId) return;
      onCleanup(this.channelService.watchChannel(conversationId, (c) => this.channel.set(c)));
    });

    effect(() => {
      const saving = this.saving();
      const link = this.link();
      if (saving && !saving.inFlight && (!link || link.permissions[saving.key] === saving.value)) this.saving.set(null);
    });

    const tick = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      if (this.echoTimer) clearTimeout(this.echoTimer);
    });
  }

  protected selectTab(tab: 'vinculo' | 'mensagens'): void {
    void this.router.navigate([], {
      queryParams: { aba: tab === 'mensagens' ? 'mensagens' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected back(): void {
    void this.router.navigate(['/painel/profissionais']);
  }

  protected async changePermission(link: ArenaProfessorLink, change: PermissionChange): Promise<void> {
    if (!this.canEditPermissions()) return;
    // As das Aulas da arena só existem na equipe — o servidor recusaria `true` para independente.
    if (!permissionAllowedForType(change.key, link.relationshipType)) return;
    if (this.echoTimer) clearTimeout(this.echoTimer);
    this.saving.set({ ...change, inFlight: true });
    this.permError.set(null);
    try {
      await this.service.updatePermissions(link.id, { [change.key]: change.value });
      this.saving.set({ ...change, inFlight: false });
      // Rede de segurança: se o snapshot não vier (listener caiu), o toggle não fica travado.
      this.echoTimer = setTimeout(() => this.saving.set(null), 4000);
    } catch (err) {
      this.saving.set(null);
      this.permError.set(err instanceof Error ? err.message : 'Não foi possível alterar a permissão.');
    }
  }

  protected askConfirm(kind: ConfirmKind): void {
    this.analyzeOpen.set(false);
    this.confirmError.set(null);
    this.confirmKind.set(kind);
  }

  protected closeConfirm(): void {
    if (this.confirmBusy()) return;
    this.confirmKind.set(null);
    this.confirmError.set(null);
  }

  protected async confirm(link: ArenaProfessorLink, kind: ConfirmKind, reason: string | null): Promise<void> {
    if (this.confirmBusy()) return;
    this.confirmBusy.set(true);
    this.confirmError.set(null);
    try {
      if (kind === 'end') await this.service.end(link.id, reason);
      else if (kind === 'cancel') await this.service.cancelInvite(link.id);
      else await this.service.reject(link.id, reason);
      this.confirmKind.set(null);
      const done: Record<ConfirmKind, string> = {
        end: 'Vínculo encerrado. O professor foi avisado.',
        cancel: 'Convite cancelado.',
        reject: 'Solicitação rejeitada. O professor foi avisado.',
      };
      this.notice.set({ tone: 'ok', text: done[kind] });
    } catch (err) {
      this.confirmError.set(err instanceof Error ? err.message : 'Não foi possível concluir. Tente novamente.');
    } finally {
      this.confirmBusy.set(false);
    }
  }

  protected onApproved(name: string): void {
    this.analyzeOpen.set(false);
    this.notice.set({ tone: 'ok', text: `Vínculo com ${name} aprovado.` });
  }

  protected onSuspended(link: ArenaProfessorLink): void {
    this.suspendOpen.set(false);
    this.notice.set({ tone: 'ok', text: `Vínculo com ${link.professorName} suspenso. O professor foi avisado.` });
  }

  protected async reactivate(link: ArenaProfessorLink): Promise<void> {
    await this.runAction(() => this.service.reactivate(link.id), `Vínculo com ${link.professorName} reativado.`, 'Não foi possível reativar o vínculo.');
  }

  protected async resend(link: ArenaProfessorLink): Promise<void> {
    await this.runAction(
      () => this.service.invite(resendInviteInput(link)),
      `Convite reenviado para ${link.professorName}. Vale por mais 7 dias.`,
      'Não foi possível reenviar o convite.',
    );
  }

  private async runAction(action: () => Promise<unknown>, success: string, fallback: string): Promise<void> {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    this.notice.set(null);
    try {
      await action();
      this.notice.set({ tone: 'ok', text: success });
    } catch (err) {
      this.notice.set({ tone: 'error', text: err instanceof Error ? err.message : fallback });
    } finally {
      this.actionBusy.set(false);
    }
  }
}
