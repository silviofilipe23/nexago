import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { NxToastService } from '../shared/feedback';
import { NxPageLoadingComponent } from '../shared/loading/nx-page-loading.component';
import { tournamentListingStatus } from '../data/tournaments-repository';
import { endOfDay, eventDayOf, startOfDay } from './tournament-days';
import { type TournamentTabId } from './tournament-live.selectors';
import { TournamentLiveStore } from './tournament-live.store';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function nameFromEmail(email: string | null | undefined): string {
  const local = email?.split('@')[0]?.trim();
  return local ? titleCase(local) : 'Atleta';
}

const TAB_LABELS: Record<TournamentTabId, string> = {
  'visao-geral': 'Visão geral',
  categorias: 'Categorias',
  'minha-inscricao': 'Minha inscrição',
  palpites: 'Palpites',
};

const HEADER_DATE = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Sao_Paulo' });

/** Casca do torneio: cabeçalho + abas + `<router-outlet>`. Todas as abas leem o mesmo
 *  `TournamentLiveStore`, providenciado na ROTA pai (`app.routes.ts`) e não aqui — assim a tela
 *  de partida, que é irmã e não filha desta casca, compartilha a mesma instância. */
@Component({
  selector: 'app-tournament-shell',
  imports: [RouterLink, RouterOutlet, AtPanelShellComponent, NxPageLoadingComponent],
  templateUrl: './tournament-shell.component.html',
  styleUrl: './tournament-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(NxToastService);
  protected readonly store = inject(TournamentLiveStore);

  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), { initialValue: '' });

  /** Último segmento da URL — dirige o estado ativo das abas sem depender do outlet. */
  private readonly activeSegment = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.currentSegment()),
      startWith(this.currentSegment()),
    ),
    { initialValue: this.currentSegment() },
  );

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  // O ponto laranja "acontecendo agora" era da aba Hoje, aposentada: quem tem jogo ao vivo hoje
  // entra pelo Modo Focus, não por uma aba desta casca.
  protected readonly tabs = computed(() => this.store.visibleTabs().map((id) => ({ id, label: TAB_LABELS[id] })));

  protected readonly heroTitle = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    return this.isToday() ? `${t.name} — hoje` : t.name;
  });

  /** "Sáb 29 ago · dia 2 de 3 · Arena ErreJota, Goiânia" */
  protected readonly heroMeta = computed(() => {
    const t = this.store.tournament();
    if (!t) return '';
    const parts: string[] = [];
    const start = t.startAt;
    if (start) parts.push(capitalize(HEADER_DATE.format(this.isToday() ? this.store.now() : start).replace(/\./g, '')));
    else if (t.dateLabel) parts.push(t.dateLabel);
    const day = eventDayOf(t.startAt, t.endAt, this.store.now());
    if (day) parts.push(`dia ${day.current} de ${day.total}`);
    const place = [t.location, t.city].filter((s) => s.length > 0).join(', ');
    if (place) parts.push(place);
    return parts.join(' · ');
  });

  protected readonly isEnded = computed(() => {
    const t = this.store.tournament();
    return t ? tournamentListingStatus(t, this.store.now()) === 'ended' : false;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.store.load(id);
    });

    // Rota canônica: `/torneios/:id` sem aba resolve para "Visão geral" assim que os dados
    // chegam — quem tem jogo hoje é levado ao Modo Focus por outro caminho, não por aqui.
    // `replaceUrl` mantém o back funcionando.
    effect(() => {
      if (this.store.loading()) return;
      if (this.currentSegment() !== null) return;
      const target = this.store.defaultTab();
      void this.router.navigate([target], { relativeTo: this.route, replaceUrl: true });
    });
  }

  /** Só o primeiro segmento da rota filha: `categorias/:categoriaId` também é a aba "Categorias". */
  private currentSegment(): TournamentTabId | null {
    const child = this.route.snapshot.firstChild?.routeConfig?.path ?? '';
    const first = child.split('/')[0] ?? '';
    return first.length > 0 ? (first as TournamentTabId) : null;
  }

  protected isActive(id: TournamentTabId): boolean {
    return this.activeSegment() === id;
  }

  private isToday(): boolean {
    const start = this.store.tournament()?.startAt;
    const end = this.store.tournament()?.endAt ?? start;
    if (!start || !end) return false;
    const now = this.store.now();
    return now >= startOfDay(start) && now <= endOfDay(end);
  }

  protected async shareTournament(): Promise<void> {
    const t = this.store.tournament();
    if (!t) return;
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const url = `${origin}/torneios/${t.id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.toast.success('Link copiado', 'Cole onde quiser para convidar quem ainda não se inscreveu.');
        return;
      }
      this.toast.info('Copie o link da barra de endereço.');
    } catch {
      this.toast.error('Não foi possível copiar agora.');
    }
  }
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
