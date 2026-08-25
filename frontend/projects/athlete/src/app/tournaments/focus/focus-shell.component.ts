import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { eventDayOf } from '../tournament-days';
import { TournamentLiveStore } from '../tournament-live.store';

export type FocusSectionId = 'agora' | 'trajetoria' | 'grupo' | 'chave';

// Toda entrada aqui PRECISA ter uma rota irmã correspondente em `focus.children`
// (`app.routes.ts`), adicionada no MESMO commit que a entrada — nunca uma sem a outra. Uma
// seção listada aqui sem rota correspondente falha em silêncio: o segmento não casa com nenhum
// filho de `focus`, o router recua por todos os irmãos em `torneios/:id` e cai no catch-all
// `{ path: '**', redirectTo: 'painel' }` de `app.routes.ts` — o atleta é ejetado do Focus pro
// painel, sem erro nenhum no console. `chave` só entrou junto com a rota `focus/chave` (Task 10),
// que aponta pro wrapper `FocusBracketComponent` (alimenta `CategoryBracketComponent` via input).
const SECTIONS: readonly { id: FocusSectionId; label: string }[] = [
  { id: 'agora', label: 'Agora' },
  { id: 'trajetoria', label: 'Trajetória' },
  { id: 'grupo', label: 'Grupo' },
  { id: 'chave', label: 'Chave' },
];

const CLOCK = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/**
 * Casca do Modo Focus: cabeçalho + navegação + `<router-outlet>`.
 *
 * O que faz o resto do portal sumir é esta casca NÃO envolver o conteúdo em
 * `AtPanelShellComponent`, como todas as outras telas fazem — sem sidebar, sem bottom-nav do
 * portal, sem busca.
 *
 * O tempo real é adquirido aqui, uma vez: trocar de seção dentro do Focus não derruba e reabre
 * o listener, como aconteceria se cada seção chamasse `acquireLive` por conta própria.
 */
@Component({
  selector: 'app-focus-shell',
  imports: [RouterLink, RouterOutlet, NxPageLoadingComponent],
  templateUrl: './focus-shell.component.html',
  styleUrl: './focus-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(TournamentLiveStore);

  protected readonly sections = SECTIONS;

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  protected readonly activeSection = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentSection()),
      startWith(this.currentSection()),
    ),
    { initialValue: this.currentSection() },
  );

  // protected readonly clock = computed(() => CLOCK.format(this.store.now()));

  protected readonly hasLive = computed(() => this.store.liveInTournament().length > 0);

  /** "DIA 2 DE 3" — só quando o torneio declara início E fim, ocupa mais de um dia e `now` cai
   *  dentro da janela do evento. Sem isso o trecho some, em vez de afirmar um dia errado. */
  protected readonly dayLine = computed<string | null>(() => {
    const t = this.store.tournament();
    const day = eventDayOf(t?.startAt, t?.endAt, this.store.now());
    return day ? `Dia ${day.current} de ${day.total}` : null;
  });

  protected readonly headerMeta = computed(() =>
    [this.dayLine(), this.store.focusCategory()?.categoryName, this.store.tournament()?.location]
      .filter((p): p is string => p != null && p.length > 0)
      .join(' · '),
  );

  constructor() {
    const release = this.store.acquireLive();
    inject(DestroyRef).onDestroy(release);
    // Reativo, não uma leitura única: sem isso, navegar de /torneios/A/focus direto para
    // /torneios/B/focus (mesma instância de componente, o router reaproveita) deixava o
    // cabeçalho e as seções presos nos dados de A. Mesmo padrão do `TournamentShellComponent`.
    effect(() => {
      const id = this.id();
      if (id) void this.store.load(id);
    });
  }

  /**
   * Sair devolve o atleta à HOME, não à página do torneio: no dia de jogo a home é a base da
   * navegação dele — é de lá que o Focus abre, e é lá que ele quer voltar pra reservar quadra,
   * ver ranking ou qualquer outra coisa do portal.
   *
   * Não silencia mais nada: a trava que impede o painel de puxar o atleta de volta pra cá na
   * mesma sessão é o `offeredKey` em memória do `FocusDayService`. Recarregar a página reabre o
   * Focus de propósito — é o que "sempre abrir no dia de jogo" quer dizer.
   */
  protected async exit(): Promise<void> {
    await this.router.navigate(['/painel']);
  }

  private currentSection(): FocusSectionId {
    const last = this.router.url.split('?')[0]?.split('/').pop() ?? '';
    return SECTIONS.some((s) => s.id === last) ? (last as FocusSectionId) : 'agora';
  }
}
