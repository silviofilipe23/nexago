import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  arenaListItemImageUrl,
  arenaSlotIsAvailable,
  fetchArenaById,
  fetchArenaDaySlotsMerged,
  fetchCourts,
  isPastSlot,
  toggleFavoriteArena,
  watchFavoriteArenaIds,
  type ArenaAmenities,
  type ArenaCourtDoc,
  type ArenaListItem,
} from '@nexago/arena-discovery';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';

export interface ArenaCourtView {
  id: string;
  name: string;
  sportLabel: string;
  pricePerHourReais: number;
  nextSlotLabel: string | null;
}

const AMENITY_LABELS: readonly { key: keyof ArenaAmenities; label: string }[] = [
  { key: 'coveredCourt', label: 'Quadra coberta' },
  { key: 'parking', label: 'Estacionamento' },
  { key: 'lockerRoom', label: 'Vestiário' },
  { key: 'bar', label: 'Bar' },
  { key: 'racketRental', label: 'Aluguel de raquetes' },
];

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) {
    return null;
  }
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AT';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || 'AT';
}

function hashHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360;
  }
  return hash < 0 ? hash + 360 : hash;
}

function heroGradient(id: string): string {
  const hue = hashHue(id);
  return `linear-gradient(135deg, hsl(${hue} 55% 22%), hsl(${(hue + 42) % 360} 55% 11%))`;
}

function ratingLabel(ratingAverage: number): string {
  return ratingAverage > 0 ? ratingAverage.toFixed(1) : '—';
}

/** Lê o esporte de um doc de quadra (`sport` ou `courtType`, mesmo schema usado pelo site público). */
function courtSportLabel(data: Record<string, unknown>): string {
  const raw = data['sport'] ?? data['courtType'];
  return typeof raw === 'string' && raw.trim().length > 0 ? titleCase(raw.trim()) : 'Esporte não informado';
}

/** Preço/hora da quadra, com fallback pro preço-base da arena. */
function courtHourlyPrice(data: Record<string, unknown>, arenaFallbackReais: number): number {
  const fromCourt =
    (typeof data['basePricePerHourReais'] === 'number' ? data['basePricePerHourReais'] : null) ??
    (typeof data['basePriceReais'] === 'number' ? data['basePriceReais'] : null);
  return fromCourt != null && fromCourt > 0 ? fromCourt : arenaFallbackReais;
}

@Component({
  selector: 'app-arena-detail',
  standalone: true,
  imports: [RouterLink, AtPanelShellComponent],
  templateUrl: './arena-detail.component.html',
  styleUrl: './arena-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArenaDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly firestore = createFirestore();

  private noticeTimeout: ReturnType<typeof setTimeout> | undefined;

  protected readonly accountLabel = computed(() => {
    const liveUser = this.auth.user();
    if (liveUser?.displayName?.trim()) return liveUser.displayName.trim();
    if (liveUser?.email?.trim()) return nameFromEmail(liveUser.email);
    const devEmail = this.auth.devEmail();
    return devEmail?.trim() ? nameFromEmail(devEmail) : 'Atleta';
  });

  protected readonly arenaId = computed(() => this.route.snapshot.paramMap.get('arenaId') ?? '');

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly arena = signal<ArenaListItem | null>(null);
  protected readonly courts = signal<ArenaCourtDoc[]>([]);
  protected readonly nextSlotByCourtId = signal<Record<string, string | null>>({});
  protected readonly favoriteIds = signal<ReadonlySet<string>>(new Set());
  protected readonly pendingFavorite = signal(false);
  protected readonly shareFeedback = signal<string | null>(null);
  protected readonly heroImageLoaded = signal(false);
  protected readonly heroImageFailed = signal(false);

  protected readonly isFavorite = computed(() => this.favoriteIds().has(this.arenaId()));
  protected readonly heroImageUrl = computed(() => {
    const a = this.arena();
    return a ? arenaListItemImageUrl(a) : null;
  });

  protected readonly courtViews = computed<ArenaCourtView[]>(() => {
    const arenaFallback = this.arena()?.pricePerHourReais ?? 0;
    const nextByCourt = this.nextSlotByCourtId();
    return this.courts().map((c) => ({
      id: c.id,
      name: c.name,
      sportLabel: courtSportLabel(c.data),
      pricePerHourReais: courtHourlyPrice(c.data, arenaFallback),
      nextSlotLabel: nextByCourt[c.id] ?? null,
    }));
  });

  protected readonly cheapestPrice = computed(() => {
    const views = this.courtViews();
    if (views.length === 0) return this.arena()?.pricePerHourReais ?? 0;
    return Math.min(...views.map((v) => v.pricePerHourReais));
  });

  protected readonly earliestSlotLabel = computed(() => {
    const labels = this.courtViews()
      .map((v) => v.nextSlotLabel)
      .filter((v): v is string => v != null)
      .sort();
    return labels[0] ?? null;
  });

  protected readonly amenityLabels = computed(() => {
    const amenities = this.arena()?.amenities;
    if (!amenities) return [];
    return AMENITY_LABELS.filter((a) => amenities[a.key]).map((a) => a.label);
  });

  protected readonly mapsUrl = computed(() => {
    const a = this.arena();
    if (!a) return '';
    const q = a.lat != null && a.lng != null ? `${a.lat},${a.lng}` : `${a.name}, ${a.locationLabel}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  });

  protected readonly heroGradient = heroGradient;
  protected readonly ratingLabel = ratingLabel;
  protected readonly arenaInitials = initialsOf;

  constructor() {
    void this.load();

    effect((onCleanup) => {
      const user = this.auth.user();
      const db = this.firestore;
      const id = this.arenaId();
      if (!user || !db || !id) {
        this.favoriteIds.set(new Set());
        return;
      }
      const unsubscribe = watchFavoriteArenaIds(db, user.uid, (ids) => this.favoriteIds.set(new Set(ids)));
      onCleanup(() => unsubscribe());
    });

    this.destroyRef.onDestroy(() => clearTimeout(this.noticeTimeout));
  }

  private async load(): Promise<void> {
    const id = this.arenaId();
    if (!id || !this.firestore) {
      this.error.set('Arena não disponível no momento.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const arena = await fetchArenaById(this.firestore, id);
      if (!arena) {
        this.error.set('Arena não encontrada.');
        this.loading.set(false);
        return;
      }
      this.arena.set(arena);

      const courts = await fetchCourts(this.firestore, id);
      this.courts.set(courts);

      const today = new Date();
      const slots = await fetchArenaDaySlotsMerged(this.firestore, id, today);
      const nextByCourtId: Record<string, string | null> = {};
      for (const court of courts) {
        const available = slots
          .filter((s) => s.courtId === court.id && arenaSlotIsAvailable(s) && !isPastSlot(today, s.startTime))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        nextByCourtId[court.id] = available[0]?.startTime ?? null;
      }
      this.nextSlotByCourtId.set(nextByCourtId);
    } catch (err) {
      if (!environment.production) {
        console.error('[arena-detail] load error', err);
      }
      this.error.set('Não foi possível carregar esta arena agora.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleFollow(): Promise<void> {
    const user = this.auth.user();
    const db = this.firestore;
    const id = this.arenaId();
    if (!user || !db) {
      this.showNotice('Faça login para seguir arenas.');
      return;
    }
    const wasFavorite = this.isFavorite();
    this.pendingFavorite.set(true);
    this.favoriteIds.update((ids) => {
      const next = new Set(ids);
      if (wasFavorite) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await toggleFavoriteArena(db, { userId: user.uid, arenaId: id, isFavorite: wasFavorite });
    } catch {
      this.favoriteIds.update((ids) => {
        const next = new Set(ids);
        if (wasFavorite) next.add(id);
        else next.delete(id);
        return next;
      });
      this.showNotice('Não foi possível atualizar agora.');
    } finally {
      this.pendingFavorite.set(false);
    }
  }

  protected async shareArena(): Promise<void> {
    const origin = typeof location !== 'undefined' ? location.origin : 'https://nexago.app';
    const url = `${origin}/reservar/${this.arenaId()}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        this.showNotice('Link copiado.');
        return;
      }
      this.showNotice('Copie o link manualmente.');
    } catch {
      this.showNotice('Não foi possível copiar agora.');
    }
  }

  protected onHeroImageLoad(): void {
    this.heroImageLoaded.set(true);
  }

  protected onHeroImageError(): void {
    this.heroImageFailed.set(true);
  }

  private showNotice(message: string): void {
    this.shareFeedback.set(message);
    clearTimeout(this.noticeTimeout);
    this.noticeTimeout = setTimeout(() => this.shareFeedback.set(null), 3500);
  }
}
