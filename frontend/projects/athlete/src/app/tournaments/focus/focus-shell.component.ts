import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { NxPageLoadingComponent } from '../../shared/loading/nx-page-loading.component';
import { TournamentLiveStore } from '../tournament-live.store';
import { FocusDayService } from './focus-day.service';

export type FocusSectionId = 'agora' | 'trajetoria' | 'grupo' | 'chave';

const SECTIONS: readonly { id: FocusSectionId; label: string }[] = [
  { id: 'agora', label: 'Agora' },
  { id: 'trajetoria', label: 'Trajetória' },
  { id: 'grupo', label: 'Grupo' },
  { id: 'chave', label: 'Chave' },
];

const CLOCK = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const DAY_MS = 86_400_000;

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
  private readonly focusDay = inject(FocusDayService);
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

  protected readonly clock = computed(() => CLOCK.format(this.store.now()));

  protected readonly hasLive = computed(() => this.store.liveInTournament().length > 0);

  /** "DIA 2 DE 3" — só quando o torneio declara início E fim. Sem as duas datas o trecho some,
   *  em vez de afirmar que hoje é o dia 1. */
  protected readonly dayLine = computed<string | null>(() => {
    const t = this.store.tournament();
    if (!t?.startAt || !t?.endAt) return null;
    const total = Math.round((t.endAt.getTime() - t.startAt.getTime()) / DAY_MS) + 1;
    const current = Math.round((this.store.now().getTime() - t.startAt.getTime()) / DAY_MS) + 1;
    if (total < 1 || current < 1 || current > total) return null;
    return `Dia ${current} de ${total}`;
  });

  protected readonly headerMeta = computed(() =>
    [this.dayLine(), this.store.focusCategory()?.categoryName, this.store.tournament()?.location]
      .filter((p): p is string => p != null && p.length > 0)
      .join(' · '),
  );

  constructor() {
    const release = this.store.acquireLive();
    inject(DestroyRef).onDestroy(release);
    void this.store.load(this.id());
  }

  /** Sair silencia a entrada automática até amanhã — sem isso o painel puxaria o atleta de
   *  volta para cá na navegação seguinte. */
  protected async exit(): Promise<void> {
    this.focusDay.dismissForToday();
    await this.router.navigate(['/torneios', this.id()]);
  }

  private currentSection(): FocusSectionId {
    const last = this.router.url.split('?')[0]?.split('/').pop() ?? '';
    return SECTIONS.some((s) => s.id === last) ? (last as FocusSectionId) : 'agora';
  }
}
