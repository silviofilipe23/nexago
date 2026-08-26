import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DocsSearch } from './docs-search';
import { DocsSidebar, type SidebarGroup } from './docs-sidebar';
import { FeatureSection } from './feature-section';
import { DOC_AUDIENCES, SEARCH_INDEX } from '../../../lib/docs';
import type { DocAudienceId } from '../../../lib/docs/types';

const AUDIENCE_IDS: readonly DocAudienceId[] = ['atletas', 'organizadores', 'arenas'];

function isDocAudienceId(value: string): value is DocAudienceId {
  return (AUDIENCE_IDS as readonly string[]).includes(value);
}

/**
 * Página de uma audiência (`/docs/atletas`, `/docs/organizadores`, `/docs/arenas`): trilha +
 * hero + busca + sumário lateral (scrollspy) + todas as features em grupos + navegação pra
 * audiência anterior/próxima. Porta de `app/docs/[audience]/page.tsx`.
 *
 * `audience` chega via `withComponentInputBinding()` (rota `docs/:audience`). Diferente do
 * source (`notFound()` de rota, server-side), aqui é validado em duas camadas — primeiro contra
 * a união literal `DocAudienceId` (`isDocAudienceId`), depois contra `DOC_AUDIENCES` de fato
 * (audiência válida mas ausente dos dados também cai no estado "não encontrada") — e computed,
 * não efeito, porque é derivação pura e síncrona de `audience()`. Como o Router reaproveita a
 * MESMA instância ao navegar entre duas audiências (`/docs/:audience` → `/docs/:audience`), o
 * único efeito real (side-effect de fato) é o título da página, que precisa reagir à mudança.
 */
@Component({
  selector: 'app-docs-audience-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective, ButtonDirective, DocsSearch, DocsSidebar, FeatureSection],
  host: { class: 'block' },
  templateUrl: './docs-audience.page.html',
})
export class DocsAudiencePage {
  readonly audience = input.required<string>();

  protected readonly searchIndex = SEARCH_INDEX;

  private readonly audienceId = computed<DocAudienceId | null>(() => {
    const value = this.audience();
    return isDocAudienceId(value) ? value : null;
  });

  private readonly index = computed(() => {
    const id = this.audienceId();
    return id === null ? -1 : DOC_AUDIENCES.findIndex((a) => a.id === id);
  });

  protected readonly current = computed(() => (this.index() === -1 ? null : DOC_AUDIENCES[this.index()]));
  protected readonly prev = computed(() => (this.index() > 0 ? DOC_AUDIENCES[this.index() - 1] : null));
  protected readonly next = computed(() =>
    this.index() !== -1 && this.index() < DOC_AUDIENCES.length - 1 ? DOC_AUDIENCES[this.index() + 1] : null,
  );

  protected readonly sidebarGroups = computed<SidebarGroup[]>(() => {
    const audience = this.current();
    if (!audience) return [];
    return audience.groups.map((g) => ({
      title: g.title,
      items: g.features.map((f) => ({ id: f.id, title: f.title })),
    }));
  });

  private readonly titleService = inject(Title);

  constructor() {
    effect(() => {
      const audience = this.current();
      this.titleService.setTitle(
        audience ? `Documentação para ${audience.label.toLowerCase()} · nexaGO` : 'Documentação não encontrada · nexaGO',
      );
    });
  }
}
