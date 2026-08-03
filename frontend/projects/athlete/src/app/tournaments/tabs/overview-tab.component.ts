import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fetchAllLeagues } from '../../data/leagues-repository';
import { categoryAcceptsRegistration, tournamentListingStatus, type TournamentCategoryOffer } from '../../data/tournaments-repository';
import { leagueContextLabel, resolveLeagueContext } from '../tournament-league.helpers';
import type { DiscoveryLeague } from '../tournament-discovery.models';
import { TournamentLiveStore } from '../tournament-live.store';

function hashHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  return hash < 0 ? hash + 360 : hash;
}

function heroGradient(id: string): string {
  const hue = hashHue(id);
  return `linear-gradient(120deg, hsl(${hue} 55% 20%), hsl(${(hue + 40) % 360} 55% 10%))`;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function genderLabelOf(cat: TournamentCategoryOffer['genderType']): string {
  return cat === 'F' ? 'Feminino' : cat === 'Mix' ? 'Misto' : 'Masculino';
}

export type CategoryCtaKind = 'register' | 'waitlist' | 'disabled' | 'view-registration';

/** Aba "Visão geral": a face de venda do torneio (capa, categorias, prêmio, regulamento). É o
 *  conteúdo que antes era a página `/torneios/:id` inteira. Continua sem feed social, comunicados
 *  ou etapas fictícias — o Flutter também não tem nada disso no detalhe. */
@Component({
  selector: 'app-overview-tab',
  imports: [RouterLink],
  templateUrl: './overview-tab.component.html',
  styleUrl: './overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewTabComponent {
  protected readonly store = inject(TournamentLiveStore);

  protected readonly tournament = this.store.tournament;
  protected readonly coverFailed = signal(false);
  private readonly leagues = signal<DiscoveryLeague[]>([]);

  protected readonly leagueContextLine = computed(() => {
    const id = this.tournament()?.id;
    if (!id) return null;
    const ctx = resolveLeagueContext(this.leagues(), id);
    return ctx ? leagueContextLabel(ctx) : null;
  });

  protected readonly mapsUrl = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const q = t.locationAddress ?? `${t.location}, ${t.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly heroStatus = computed(() => {
    const t = this.tournament();
    if (!t) return { label: '', tone: 'neutral' as const };
    switch (tournamentListingStatus(t, this.store.now())) {
      case 'open':
        return { label: 'Inscrições abertas', tone: 'open' as const };
      case 'almost_full':
        return { label: 'Últimas vagas', tone: 'urgent' as const };
      case 'live':
        return { label: 'Ao vivo agora', tone: 'live' as const };
      case 'ended':
        return { label: 'Encerrado', tone: 'ended' as const };
    }
  });

  /** A vitrine de inscrição — lista de categorias, "inscrição a partir de" e o botão de
   *  inscrever — só faz sentido enquanto alguma categoria aceita dupla nova. Encerradas todas,
   *  a Visão geral vira a face do evento (capa, prêmio, regulamento) e as categorias seguem na
   *  aba "Categorias", com jogos e chave.
   *
   *  Deliberadamente ignora se o atleta já está inscrito: enquanto houver categoria aberta a
   *  vitrine fica de pé, e o botão da categoria dele é que vira "Ver inscrição". */
  protected readonly registrationOpen = computed(() => (this.tournament()?.categories ?? []).some((c) => this.categoryIsOpen(c)));

  /** Sem vitrine e sem regulamento a coluna principal fica vazia — aí o grid vira uma coluna só,
   *  senão o card de prêmio ficaria espremido em 340px com metade da tela em branco. */
  protected readonly hasMainColumn = computed(() => this.registrationOpen() || (this.tournament()?.regulationsText ?? '').length > 0);

  protected readonly totalPrizeLabel = computed(() => {
    const t = this.tournament();
    if (!t) return null;
    const total = t.tournamentPrizes.reduce((s, p) => s + p.value, 0) + t.categories.flatMap((c) => c.prizes).reduce((s, p) => s + p.value, 0);
    return total > 0 ? formatBRL(total) : null;
  });

  protected readonly cheapestPriceLabel = computed(() => {
    const t = this.tournament();
    if (!t || t.categories.length === 0) return '—';
    return formatBRL(Math.min(...t.categories.map((c) => c.entryFee)));
  });

  protected readonly heroBackground = computed(() => heroGradient(this.tournament()?.id ?? ''));

  /** Capa do organizador; o gradiente segue por baixo enquanto carrega e vira fallback se falhar. */
  protected readonly heroCover = computed(() => {
    const url = this.tournament()?.coverUrl;
    return url && !this.coverFailed() ? url : null;
  });

  constructor() {
    void this.loadLeagues();
  }

  /** Só a linha de contexto da liga depende disso — carrega em segundo plano, sem travar a aba. */
  private async loadLeagues(): Promise<void> {
    const db = this.store.firestore;
    if (!db) return;
    try {
      const leagues = await fetchAllLeagues(db);
      this.leagues.set(
        leagues.map((l) => ({
          id: l.id,
          name: l.name,
          seasonLabel: l.seasonLabel ?? undefined,
          city: l.city ?? undefined,
          coverUrl: l.coverUrl,
          stages: l.stages.map((s) => ({ id: s.id, name: s.name, order: s.order, dateLabel: s.dateLabel ?? undefined, tournamentIds: s.tournamentIds })),
        })),
      );
    } catch {
      this.leagues.set([]);
    }
  }

  protected scrollToCategories(): void {
    document.getElementById('ovw-categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected genderLabel(cat: TournamentCategoryOffer): string {
    return genderLabelOf(cat.genderType);
  }

  protected categorySpotsLeft(cat: TournamentCategoryOffer): number {
    const enrolled = this.store.enrolledByCategory().get(cat.id);
    return enrolled != null ? Math.max(0, cat.maxTeams - enrolled) : cat.spotsLeft;
  }

  protected categoryFillPercent(cat: TournamentCategoryOffer): number {
    if (cat.maxTeams <= 0) return 0;
    return Math.round(((cat.maxTeams - this.categorySpotsLeft(cat)) / cat.maxTeams) * 100);
  }

  protected categoryIsOpen(cat: TournamentCategoryOffer): boolean {
    const t = this.tournament();
    return t != null && categoryAcceptsRegistration(t, cat, this.categorySpotsLeft(cat), this.store.now());
  }

  protected categoryCta(cat: TournamentCategoryOffer): CategoryCtaKind {
    if (this.store.myCategoryIds().has(cat.id)) return 'view-registration';
    if (!this.categoryIsOpen(cat)) return 'disabled';
    // Aberta e sem vaga só acontece com lista de espera ativa — `categoryAcceptsRegistration`
    // já barrou o caso contrário.
    return this.categorySpotsLeft(cat) <= 0 ? 'waitlist' : 'register';
  }

  protected categoryCtaLabel(cat: TournamentCategoryOffer): string {
    switch (this.categoryCta(cat)) {
      case 'register':
        return 'Inscrever';
      case 'waitlist':
        return 'Entrar na espera';
      case 'view-registration':
        return 'Ver inscrição';
      case 'disabled':
        return 'Encerrado';
    }
  }

  /** Quem já está inscrito vai para a aba da inscrição, não para o wizard de novo. */
  protected categoryCtaLink(cat: TournamentCategoryOffer): unknown[] {
    const t = this.tournament();
    if (!t) return ['/torneios'];
    return this.categoryCta(cat) === 'view-registration' ? ['/torneios', t.id, 'minha-inscricao'] : ['/torneios', t.id, 'inscricao'];
  }

  protected priceLabel(cat: TournamentCategoryOffer): string {
    return formatBRL(cat.entryFee);
  }
}
