import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxInlineMessageComponent } from '../shared/feedback';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { ProfessorDialogsComponent, ProfessorDialogsController } from './professor-dialogs';
import {
  PROFESSOR_ACTION_LABEL,
  PROFESSOR_TYPE_COPY,
  courtDiscountLine,
  displayStatus,
  eventMetaLine,
  eventTitle,
  linkActions,
  linkDetailSubtitle,
  linkReasonLine,
  permissionsCaption,
  permissionsToShow,
  type ProfessorLinkAction,
  type ProfessorLinkEvent,
} from './professor-links.model';
import { ProfessorLinksService } from './professor-links.service';
import {
  PfArenaMarkComponent,
  PfNoteComponent,
  PfPermListComponent,
  PfStatusComponent,
  PfTimelineComponent,
  PfTypeTagComponent,
  type PfTimelineItem,
} from './ui/professor-ui.components';

/** No cabeçalho do detalhe: aceitar vira "Ver convite" (abre o P2) e os atalhos de navegação
 *  (detalhe/histórico) somem — já estamos nele. */
const HEADER_LABEL: Partial<Record<ProfessorLinkAction, string>> = { accept: 'Ver convite' };
const HIDDEN_IN_HEADER: ReadonlySet<ProfessorLinkAction> = new Set(['details', 'viewRequest', 'history']);
const DANGER: ReadonlySet<ProfessorLinkAction> = new Set(['end', 'cancelRequest']);

/**
 * P4 — detalhe do vínculo (`VcVinculoDetalheScreen`): arena + tipo, permissões efetivas,
 * histórico e a ação do estado. É o `webUrl` dos avisos `professor_link_*`
 * (`/professor/arenas/{linkId}`).
 */
@Component({
  selector: 'app-professor-link-detail',
  imports: [
    RouterLink,
    AtPanelShellComponent,
    NxInlineMessageComponent,
    NxPageLoadingComponent,
    PfArenaMarkComponent,
    PfNoteComponent,
    PfPermListComponent,
    PfStatusComponent,
    PfTimelineComponent,
    PfTypeTagComponent,
    ProfessorDialogsComponent,
  ],
  providers: [ProfessorDialogsController],
  templateUrl: './professor-link-detail.component.html',
  styleUrl: './professor-link-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfessorLinkDetailComponent {
  private readonly auth = inject(AuthService);
  protected readonly service = inject(ProfessorLinksService);
  protected readonly ctrl = inject(ProfessorDialogsController);

  protected readonly accountLabel = computed(() => this.auth.user()?.displayName?.trim() || 'Atleta');

  /** Por `paramMap`, não snapshot: "Ver pedido atual" de um detalhe leva a outro detalhe e o
   *  Router reaproveita a instância. */
  protected readonly linkId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('linkId') ?? '')), {
    initialValue: '',
  });

  private readonly now = signal(Date.now());

  protected readonly link = computed(() => this.service.links().find((l) => l.id === this.linkId()) ?? null);
  protected readonly status = computed(() => {
    const link = this.link();
    return link ? displayStatus(link, this.now()) : null;
  });
  protected readonly subtitle = computed(() => {
    const link = this.link();
    return link ? linkDetailSubtitle(link, this.now()) : '';
  });
  protected readonly typeCopy = computed(() => {
    const link = this.link();
    return link ? PROFESSOR_TYPE_COPY[link.relationshipType] : null;
  });
  protected readonly reason = computed(() => {
    const link = this.link();
    return link ? linkReasonLine(link, this.now()) : null;
  });
  protected readonly perms = computed(() => {
    const link = this.link();
    return link ? permissionsToShow(link, this.now()) : null;
  });
  protected readonly permsCaption = computed(() => {
    const link = this.link();
    return link ? permissionsCaption(link, this.now()) : '';
  });
  protected readonly courtDiscount = computed(() => {
    const link = this.link();
    return link ? courtDiscountLine(link, this.now()) : null;
  });
  /** Quem escreveu a mensagem da rodada: convite é da arena, pedido é do professor. */
  protected readonly messageLabel = computed(() =>
    this.link()?.initiatedBy === 'ARENA' ? 'Mensagem da arena' : 'Sua mensagem no pedido',
  );
  protected readonly actions = computed(() => {
    const link = this.link();
    if (!link) return [];
    return linkActions(link, this.now())
      .filter((a) => !HIDDEN_IN_HEADER.has(a))
      .map((action) => ({
        action,
        label: HEADER_LABEL[action] ?? PROFESSOR_ACTION_LABEL[action],
        primary: action === 'accept' || action === 'requestAgain',
        danger: DANGER.has(action),
      }))
      // Botão cheio por último (mais à direita), como no rodapé dos diálogos.
      .sort((a, b) => Number(a.primary) - Number(b.primary));
  });

  protected readonly events = signal<readonly ProfessorLinkEvent[]>([]);
  protected readonly eventsLoaded = signal(false);
  protected readonly eventsError = signal(false);
  protected readonly timeline = computed<PfTimelineItem[]>(() => {
    const link = this.link();
    if (!link) return [];
    return this.events().map((e) => ({ id: e.id, title: eventTitle(e, link), meta: eventMetaLine(e) }));
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Única dependência: o id da rota. O histórico só existe para quem lê o vínculo (rules), e o
    // listener do serviço já decide se o vínculo é deste professor.
    effect((onCleanup) => {
      const id = this.linkId();
      this.events.set([]);
      this.eventsLoaded.set(false);
      this.eventsError.set(false);
      if (!id) return;
      const stop = this.service.watchEvents(
        id,
        (events) => {
          this.events.set(events);
          this.eventsError.set(false);
          this.eventsLoaded.set(true);
        },
        () => {
          this.eventsError.set(true);
          this.eventsLoaded.set(true);
        },
      );
      onCleanup(() => stop());
    });
  }

  protected act(action: ProfessorLinkAction): void {
    const link = this.link();
    if (link) this.ctrl.run(link, action);
  }
}
