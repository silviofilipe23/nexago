import { ChangeDetectionStrategy, Component, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NxToastService } from '../shared/feedback';
import { ProfessorConfirmDialogComponent } from './professor-confirm-dialog.component';
import { ProfessorInviteDialogComponent } from './professor-invite-dialog.component';
import {
  professorErrorMessage,
  type ProfessorArenaOption,
  type ProfessorLink,
  type ProfessorLinkAction,
  type ProfessorLinkType,
} from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';
import { ProfessorRequestDialogComponent } from './professor-request-dialog.component';

interface RequestState {
  arena: ProfessorArenaOption | null;
  type: ProfessorLinkType | null;
  lock: boolean;
}

interface ConfirmState {
  kind: 'end' | 'cancel';
  link: ProfessorLink;
}

/**
 * Qual diálogo de professor está aberto e o que cada botão de vínculo faz. Provido por TELA
 * (Minhas arenas, detalhe, card da página da arena) junto do `<app-professor-dialogs />` — as
 * três telas oferecem as mesmas ações e não podem divergir no texto nem no fluxo.
 */
@Injectable()
export class ProfessorDialogsController {
  private readonly service = inject(ProfessorLinksService);
  private readonly router = inject(Router);
  private readonly toasts = inject(NxToastService);

  readonly invite = signal<{ linkId: string; declining: boolean } | null>(null);
  readonly request = signal<RequestState | null>(null);
  readonly confirm = signal<ConfirmState | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  /** Convite pelo id, da lista AO VIVO — o diálogo vê o vínculo mudar (ex.: arena cancelou). */
  readonly inviteLink = computed(() => {
    const open = this.invite();
    return open ? (this.service.links().find((l) => l.id === open.linkId) ?? null) : null;
  });

  run(link: ProfessorLink, action: ProfessorLinkAction): void {
    switch (action) {
      case 'accept':
        this.invite.set({ linkId: link.id, declining: false });
        return;
      case 'decline':
        this.invite.set({ linkId: link.id, declining: true });
        return;
      case 'details':
      case 'viewRequest':
      case 'history':
        void this.router.navigate(['/professor/arenas', link.id]);
        return;
      case 'end':
      case 'cancelRequest':
        this.error.set(null);
        this.confirm.set({ kind: action === 'end' ? 'end' : 'cancel', link });
        return;
      case 'requestAgain':
        this.openRequest(
          { id: link.arenaId, name: link.arenaName, city: link.arenaCity, logoUrl: link.arenaLogoUrl },
          link.relationshipType,
        );
        return;
    }
  }

  openRequest(arena: ProfessorArenaOption | null = null, type: ProfessorLinkType | null = null, lock = false): void {
    this.request.set({ arena, type, lock });
  }

  closeInvite(): void {
    this.invite.set(null);
  }

  closeRequest(): void {
    this.request.set(null);
  }

  closeConfirm(): void {
    if (this.busy()) return;
    this.confirm.set(null);
    this.error.set(null);
  }

  async runConfirm(reason: string | null): Promise<void> {
    const state = this.confirm();
    if (!state || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (state.kind === 'end') {
        await this.service.endLink(state.link.id, reason);
        this.toasts.success('Vínculo encerrado', `A ${state.link.arenaName} recebe um aviso.`);
      } else {
        await this.service.cancelRequest(state.link.id);
        this.toasts.info('Pedido cancelado', 'Você pode pedir de novo quando quiser.');
      }
      this.busy.set(false);
      this.confirm.set(null);
    } catch (err) {
      this.busy.set(false);
      this.error.set(
        professorErrorMessage(
          err,
          state.kind === 'end'
            ? 'Não foi possível encerrar o vínculo agora. Tente de novo.'
            : 'Não foi possível cancelar o pedido agora. Tente de novo.',
        ),
      );
    }
  }
}

/** Os diálogos do controlador da tela — um lugar só para o texto de cada confirmação. */
@Component({
  selector: 'app-professor-dialogs',
  imports: [ProfessorConfirmDialogComponent, ProfessorInviteDialogComponent, ProfessorRequestDialogComponent],
  template: `
    @if (ctrl.invite(); as open) {
      @if (ctrl.inviteLink(); as link) {
        <app-professor-invite-dialog [link]="link" [startDeclining]="open.declining" (closed)="ctrl.closeInvite()" />
      }
    }
    @if (ctrl.request(); as req) {
      <app-professor-request-dialog
        [presetArena]="req.arena"
        [presetType]="req.type"
        [lockArena]="req.lock"
        (closed)="ctrl.closeRequest()"
      />
    }
    @if (ctrl.confirm(); as c) {
      @if (c.kind === 'end') {
        <app-professor-confirm-dialog
          [heading]="'Encerrar vínculo com a ' + c.link.arenaName + '?'"
          body="O encerramento é imediato: suas permissões nesta arena acabam agora e a arena recebe um aviso. Para voltar, será preciso pedir um vínculo novo."
          note="Encerrar aqui não afeta seus vínculos com outras arenas."
          confirmLabel="Encerrar vínculo"
          busyLabel="Encerrando…"
          [withReason]="true"
          [busy]="ctrl.busy()"
          [error]="ctrl.error()"
          (confirmed)="ctrl.runConfirm($event)"
          (dismissed)="ctrl.closeConfirm()"
        />
      } @else {
        <app-professor-confirm-dialog
          [heading]="'Cancelar o pedido para a ' + c.link.arenaName + '?'"
          body="A arena deixa de ver sua solicitação. Você pode pedir de novo quando quiser."
          confirmLabel="Cancelar pedido"
          cancelLabel="Manter pedido"
          busyLabel="Cancelando…"
          [busy]="ctrl.busy()"
          [error]="ctrl.error()"
          (confirmed)="ctrl.runConfirm($event)"
          (dismissed)="ctrl.closeConfirm()"
        />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorDialogsComponent {
  protected readonly ctrl = inject(ProfessorDialogsController);
}
