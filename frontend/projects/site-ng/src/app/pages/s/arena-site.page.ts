import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { RevealDirective } from '../../shared/reveal.directive';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { ArenaNav, type ArenaNavAnchor } from './arena-nav';
import { ArenaHeroOpenNow, ArenaHoursCard, ArenaOpenNowPill, injectOpenNowState } from './arena-schedule';
import { ArenaMap } from './arena-map';
import {
  getArenaPublicInfo,
  getArenaReviews,
  getArenaUpcomingTournaments,
  getArenaWeekSchedule,
  type AmenityKey,
  type ArenaPublicInfo,
  type ArenaSiteReviews,
  type ArenaSiteTournament,
  type WeekSchedule,
} from '../../../lib/firestore/arena-site-data';
import { getArenaSiteBySlug, type PublicArenaSite } from '../../../lib/firestore/arena-sites';

const SPORT_LABEL: Partial<Record<string, string>> = {
  beachTennis: 'Beach tennis',
  beachVolleyball: 'Vôlei de praia',
  footvolley: 'Futevôlei',
};

const AMENITY_INFO: Record<AmenityKey, { label: string; hint: string }> = {
  parking: { label: 'Estacionamento', hint: 'Para clientes da arena' },
  lockerRoom: { label: 'Vestiários', hint: 'Com chuveiros' },
  coveredCourt: { label: 'Quadra coberta', hint: 'Jogo com sol ou chuva' },
  bar: { label: 'Bar & lanchonete', hint: 'Comanda na arena' },
  racketRental: { label: 'Aluguel de raquete', hint: 'É só chegar e jogar' },
  hasAccessibleCourt: { label: 'Quadra acessível', hint: 'Estrutura PCD' },
  hasAccessibleBathroom: { label: 'Banheiro acessível', hint: 'Estrutura PCD' },
  hasPcdParking: { label: 'Vaga PCD', hint: 'Estacionamento reservado' },
};

/** Quebra o texto livre do "sobre" em parágrafos (linha em branco ou quebra simples). */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "R$ 100 / mês" → ["R$ 100", "mês"]. Sem barra, o preço vai inteiro. */
function splitPrice(price: string): [string, string] {
  const at = price.indexOf('/');
  if (at < 0) return [price.trim(), ''];
  return [price.slice(0, at).trim(), price.slice(at + 1).trim()];
}

/** WhatsApp já vem só dígitos do espelho; garante o 55 do wa.me. */
function withCountryCode(digits: string): string {
  return digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
}

function formatWhatsapp(digits: string): string {
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length < 10) return local;
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
}

/**
 * Mini-site público de uma arena — `nexago.com.br/s/{slug}`. Porta de `ArenaSitePage.tsx`
 * (site Next.js). A fonte é Server Component + ISR de 5 min lendo o Firestore no build/edge;
 * aqui é CSR puro — todo o `Promise.all` das seções automáticas roda no navegador, dentro de um
 * `effect()` reagindo a `slug()` (o Router reaproveita a instância entre navegações
 * `/s/:slug` → `/s/:slug`, então o construtor não roda de novo — precisa do guard de
 * staleness, igual a `LigaDetailPage`).
 */
@Component({
  selector: 'app-arena-site-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealDirective, ButtonDirective, ArenaNav, ArenaHeroOpenNow, ArenaOpenNowPill, ArenaHoursCard, ArenaMap],
  templateUrl: './arena-site.page.html',
  styleUrl: './arena-site.page.scss',
})
export class ArenaSitePage {
  readonly slug = input.required<string>();

  protected readonly site = signal<PublicArenaSite | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly schedule = signal<WeekSchedule | null>(null);
  protected readonly tournaments = signal<ArenaSiteTournament[]>([]);
  protected readonly reviews = signal<ArenaSiteReviews | null>(null);
  protected readonly arenaInfo = signal<ArenaPublicInfo | null>(null);

  protected readonly openNow = injectOpenNowState(this.schedule);

  protected readonly showAbout = computed(() => {
    const s = this.site();
    return !!s && s.about.enabled && (!!s.about.body || s.about.imageUrls.length > 0);
  });
  protected readonly amenities = computed(() => this.arenaInfo()?.amenities ?? []);
  protected readonly courtsCount = computed(() => this.arenaInfo()?.courtsCount ?? 0);
  protected readonly showStructure = computed(() => this.amenities().length > 0 || this.courtsCount() > 0);
  protected readonly showGallery = computed(() => {
    const s = this.site();
    return !!s && s.gallery.enabled && s.gallery.imageUrls.length > 0;
  });
  protected readonly showPlans = computed(() => {
    const s = this.site();
    return !!s && s.plans.enabled && s.plans.items.length > 0;
  });
  protected readonly showFaq = computed(() => {
    const s = this.site();
    return !!s && s.faq.enabled && s.faq.items.length > 0;
  });

  protected readonly whatsappUrl = computed(() => {
    const wa = this.site()?.contact.whatsapp;
    return wa ? `https://wa.me/${withCountryCode(wa)}` : null;
  });
  protected readonly instagramUrl = computed(() => {
    const ig = this.site()?.contact.instagram;
    return ig ? `https://instagram.com/${ig}` : null;
  });
  protected readonly showContact = computed(() => {
    const s = this.site();
    if (!s) return false;
    return s.contact.enabled && !!(this.whatsappUrl() || this.instagramUrl() || s.contact.address);
  });

  protected readonly reserveUrl = computed(() => this.site()?.hero.ctaUrl || this.whatsappUrl());
  protected readonly address = computed(() => this.site()?.contact.address || this.arenaInfo()?.address || '');
  protected readonly cityLine = computed(() =>
    [this.arenaInfo()?.city, this.arenaInfo()?.state].filter(Boolean).join(' — '),
  );
  protected readonly hasCoords = computed(() => this.arenaInfo()?.lat != null && this.arenaInfo()?.lng != null);
  protected readonly directionsUrl = computed(() => {
    const info = this.arenaInfo();
    if (info?.lat != null && info?.lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${info.lat},${info.lng}`;
    }
    const addr = this.address();
    if (!addr) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([addr, this.cityLine()].filter(Boolean).join(', '))}`;
  });

  protected readonly aboutParagraphs = computed(() => splitParagraphs(this.site()?.about.body ?? ''));
  protected readonly aboutLead = computed(() => this.aboutParagraphs()[0] ?? '');
  protected readonly aboutRest = computed(() => this.aboutParagraphs().slice(1));

  protected readonly planCols = computed(() => {
    const n = this.site()?.plans.items.length ?? 3;
    return n === 4 ? 2 : Math.min(n, 3);
  });

  protected readonly anchors = computed<ArenaNavAnchor[]>(() => {
    const list: (ArenaNavAnchor | false)[] = [
      this.showAbout() && { id: 'sobre', label: 'Sobre' },
      this.showStructure() && { id: 'estrutura', label: 'Estrutura' },
      !!this.schedule() && { id: 'horarios', label: 'Horários' },
      this.showGallery() && { id: 'galeria', label: 'Galeria' },
      this.showPlans() && { id: 'planos', label: 'Planos' },
      this.tournaments().length > 0 && { id: 'torneios', label: 'Torneios' },
      !!this.reviews() && { id: 'avaliacoes', label: 'Avaliações' },
      this.showFaq() && { id: 'duvidas', label: 'Dúvidas' },
      this.showContact() && { id: 'contato', label: 'Contato' },
    ];
    return list.filter((a): a is ArenaNavAnchor => a !== false);
  });

  protected readonly amenityInfo = AMENITY_INFO;
  protected readonly sportLabel = SPORT_LABEL;
  protected readonly currentYear = new Date().getFullYear();
  /** Exposto para o template poder usar `.filter(Boolean)` — globais do JS não são visíveis
   *  em expressões de template do Angular. */
  protected readonly Boolean = Boolean;

  constructor() {
    const title = inject(Title);

    effect(() => {
      const slug = this.slug();
      this.loading.set(true);
      this.notFound.set(false);
      this.site.set(null);
      this.schedule.set(null);
      this.tournaments.set([]);
      this.reviews.set(null);
      this.arenaInfo.set(null);

      getArenaSiteBySlug(slug).then((site) => {
        if (this.slug() !== slug) return; // resposta de uma navegação anterior, já obsoleta

        if (!site) {
          this.notFound.set(true);
          this.loading.set(false);
          title.setTitle('Página não encontrada · nexaGO');
          return;
        }

        this.site.set(site);
        this.loading.set(false);
        title.setTitle(`${site.arenaName} — ${site.hero.headline}`);

        void Promise.all([
          site.schedule.enabled ? getArenaWeekSchedule(site.arenaId) : Promise.resolve(null),
          site.events.enabled ? getArenaUpcomingTournaments(site.arenaId) : Promise.resolve([]),
          site.reviews.enabled ? getArenaReviews(site.arenaId) : Promise.resolve(null),
          getArenaPublicInfo(site.arenaId),
        ]).then(([schedule, tournaments, reviews, arenaInfo]) => {
          if (this.slug() !== slug) return;
          this.schedule.set(schedule);
          this.tournaments.set(tournaments);
          this.reviews.set(reviews);
          this.arenaInfo.set(arenaInfo);
        });
      });
    });
  }

  protected formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'America/Sao_Paulo',
    })
      .format(date)
      .replace(',', ' ·');
  }

  protected formatWhatsapp(digits: string): string {
    return formatWhatsapp(digits);
  }

  /** Estrelas cheias por arredondamento simples — sem meia estrela na v2. */
  protected starsFilled(value: number): number {
    return Math.round(Math.min(5, Math.max(0, value)));
  }

  protected splitPrice(price: string): [string, string] {
    return splitPrice(price);
  }

  /** Classe da célula da galeria: reproduz o mosaico do protótipo (destaque 2×2 + faixa de 2
   *  colunas) e mantém a grade de 4 colunas cheia para 1–5 fotos. */
  protected galleryCellClass(index: number, total: number): string {
    if (total === 1) return 'gal-full';
    if (total === 2) return 'gal-half';
    if (index === 0) return 'gal-a';
    if (total === 3) return 'gal-b';
    if (total === 4 && index === 3) return 'gal-b';
    return '';
  }
}
