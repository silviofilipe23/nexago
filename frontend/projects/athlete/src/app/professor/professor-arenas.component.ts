import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxInlineMessageComponent } from '../shared/feedback';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { ProfessorDialogsComponent, ProfessorDialogsController } from './professor-dialogs';
import {
  PROFESSOR_ACTION_LABEL,
  displayStatus,
  effectivePermissions,
  inviteBannerSubtitle,
  inviteBannerTitle,
  isLinkOpen,
  isOpenInvite,
  linkActions,
  linkDateLine,
  linkReasonLine,
  linksSubtitle,
  openInvites,
  sortLinksForList,
  type ProfessorLink,
  type ProfessorLinkAction,
} from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';
import {
  PfArenaMarkComponent,
  PfNoteComponent,
  PfPermListComponent,
  PfStatusComponent,
  PfTypeTagComponent,
} from './ui/professor-ui.components';

/** Ações que vão no botão cheio do card; as demais são "ghost" (protótipo VcArenaCard). */
const PRIMARY_ACTIONS: ReadonlySet<ProfessorLinkAction> = new Set(['accept', 'details', 'viewRequest']);
const DANGER_ACTIONS: ReadonlySet<ProfessorLinkAction> = new Set(['cancelRequest']);

/**
 * P1 — "Minhas arenas" (`VcMinhasArenasScreen`): convites em aberto num banner no topo e um card
 * por arena com tipo, estado, permissões efetivas e as ações do estado. É também o `webUrl` dos
 * avisos `professor_link_*` sem vínculo específico.
 */
@Component({
  selector: 'app-professor-arenas',
  imports: [
    RouterLink,
    AtPanelShellComponent,
    NxInlineMessageComponent,
    NxPageLoadingComponent,
    PfArenaMarkComponent,
    PfNoteComponent,
    PfPermListComponent,
    PfStatusComponent,
    PfTypeTagComponent,
    ProfessorDialogsComponent,
  ],
  providers: [ProfessorDialogsController],
  templateUrl: './professor-arenas.component.html',
  styleUrl: './professor-arenas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorArenasComponent {
  private readonly auth = inject(AuthService);
  protected readonly service = inject(ProfessorLinksService);
  protected readonly ctrl = inject(ProfessorDialogsController);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  /** Relógio da tela: "expira em N dias" e o convite que vence com a página aberta. */
  private readonly now = signal(Date.now());

  protected readonly subtitle = computed(() => linksSubtitle(this.service.links()));

  protected readonly invites = computed(() =>
    openInvites(this.service.links(), this.now()).map((link) => ({
      link,
      title: inviteBannerTitle(link),
      subtitle: inviteBannerSubtitle(link, this.now()),
    })),
  );

  /** Convite em aberto fica só no banner (como no protótipo); o resto vira card. */
  protected readonly cards = computed(() => {
    const now = this.now();
    return sortLinksForList(this.service.links(), now)
      .filter((link) => !isOpenInvite(link, now))
      .map((link) => ({
        link,
        status: displayStatus(link, now),
        closed: !isLinkOpen(link, now),
        dateLine: linkDateLine(link, now),
        reason: linkReasonLine(link, now),
        perms: effectivePermissions(link),
        actions: linkActions(link, now).map((action) => ({
          action,
          label: PROFESSOR_ACTION_LABEL[action],
          primary: PRIMARY_ACTIONS.has(action),
          danger: DANGER_ACTIONS.has(action),
        })),
      }));
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected act(link: ProfessorLink, action: ProfessorLinkAction): void {
    this.ctrl.run(link, action);
  }
}
