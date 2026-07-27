import { LinkManagerComponent, type LinkSuggestion } from '@nexago/link-pages';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

/** Tela Links do painel da arena: a página pública estilo link-in-bio (`/a/{slug}` no site).
 *
 *  A gestão em si vive em `nx-link-manager` (`@nexago/link-pages`), compartilhada com o painel
 *  do organizador — aqui ficam só o shell, o cabeçalho e as sugestões específicas da arena. */
@Component({
  selector: 'ar-panel-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, IconComponent, LinkManagerComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Links" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" (click)="createLink()">
          <ar-icon name="plus" [size]="14" />
          Novo link
        </button>
      </ar-page-header>

      @if (arenaNotFound()) {
        <p class="state">Nenhuma arena vinculada à sua conta ainda.</p>
      } @else {
        <nx-link-manager
          [db]="db"
          [functions]="functions"
          ownerType="arena"
          [ownerId]="arenaId()"
          [defaultTitle]="arenaName() ?? ''"
          [publicBaseUrl]="publicBaseUrl"
          [suggestions]="suggestions()"
        />
      }
    </ar-panel-shell>
  `,
  styles: `
    .state {
      font-size: 13.5px;
      color: var(--nx-text-mute);
      margin: 0;
      padding: 22px 32px;
    }
  `,
})
export class PanelLinksComponent {
  private readonly arenaContext = inject(ArenaContextService);
  /** O gerenciador vive dentro de um `@if`, então a referência de template não alcança o
   *  cabeçalho — a consulta por view é o jeito de o botão "Novo link" chegar nele. */
  private readonly manager = viewChild(LinkManagerComponent);

  protected readonly db = arenaFirestore();
  protected readonly functions = arenaFunctions();
  protected readonly publicBaseUrl = environment.publicSiteUrl;

  protected readonly arenaId = computed(() => this.arenaContext.arenaId());
  protected readonly arenaName = computed(() => this.arenaContext.arenaName());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly headerSubtitle = computed(
    () => `${this.arenaName() ?? 'Arena'} · sua página pública de links`,
  );

  protected createLink(): void {
    this.manager()?.openCreate();
  }

  /** Atalhos que quase toda arena quer no primeiro dia — o destino aponta para o hub público. */
  protected readonly suggestions = computed<LinkSuggestion[]>(() => {
    const arenaId = this.arenaId();
    if (!arenaId) return [];
    return [
      {
        label: 'Reservar quadra',
        title: 'Reserve sua quadra',
        subtitle: 'Horários em tempo real',
        url: `${this.publicBaseUrl}/arena/${arenaId}`,
        icon: 'calendar',
      },
      {
        label: 'WhatsApp',
        title: 'Fale com a gente',
        subtitle: 'Atendimento no WhatsApp',
        url: 'https://wa.me/55',
        icon: 'whatsapp',
      },
      {
        label: 'Instagram',
        title: 'Instagram',
        subtitle: 'Acompanhe o dia a dia da arena',
        url: 'https://instagram.com/',
        icon: 'instagram',
      },
      {
        label: 'Como chegar',
        title: 'Como chegar',
        subtitle: 'Abrir no mapa',
        url: 'https://maps.google.com/',
        icon: 'pin',
      },
    ];
  });
}
