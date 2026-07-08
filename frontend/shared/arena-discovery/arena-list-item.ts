import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';

import { amenitiesFromFirestore, type ArenaAmenities } from './arena-amenities';

const DEFAULT_IMAGE_URL =
  'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=800&q=80&auto=format&fit=crop';

export interface ArenaListItem {
  id: string;
  name: string;
  locationLabel: string;
  coverUrl: string | null;
  logoUrl: string | null;
  pricePerHourReais: number;
  description: string | null;
  city: string | null;
  state: string | null;
  galleryImageUrls: string[];
  ratingAverage: number;
  reviewsCount: number;
  lat: number | null;
  lng: number | null;
  /** Esportes oferecidos (`courtTypes` no Firestore). */
  courtTypes: string[];
  /** Superfícies das quadras (`surfaces` no Firestore). */
  surfaces: string[];
  reputationScore: number;
  onlinePaymentEnabled: boolean;
  onsitePaymentEnabled: boolean;
  amenities: ArenaAmenities;
}

export function arenaListItemFromFirestore(
  doc: DocumentSnapshot<DocumentData>,
): ArenaListItem {
  const data = doc.data() ?? {};
  const nameRaw = typeof data['name'] === 'string' ? data['name'].trim() : '';
  const name = nameRaw.length > 0 ? nameRaw : `Arena ${doc.id}`;

  const city = typeof data['city'] === 'string' ? data['city'].trim() : '';
  const state = typeof data['state'] === 'string' ? data['state'].trim() : '';
  let locationLabel: string;
  if (city || state) {
    locationLabel = [city, state].filter(Boolean).join(', ');
  } else {
    const addr = data['address'] ?? data['location'];
    locationLabel =
      typeof addr === 'string' && addr.trim().length > 0 ? addr.trim() : 'Local a confirmar';
  }

  const pickUrl = (key: string): string | null => {
    const v = data[key];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  };

  const coverUrl =
    pickUrl('coverUrl') ??
    pickUrl('coverImageUrl') ??
    pickUrl('imageUrl') ??
    pickUrl('heroImageUrl');

  const logoUrl = pickUrl('logoUrl') ?? pickUrl('logo') ?? pickUrl('logoImageUrl');

  const price =
    (typeof data['pricePerHourReais'] === 'number' ? data['pricePerHourReais'] : null) ??
    (typeof data['basePriceReais'] === 'number' ? data['basePriceReais'] : null) ??
    89;

  const gallery: string[] = [];
  const rawGallery = data['galleryImageUrls'] ?? data['images'] ?? data['gallery'];
  if (Array.isArray(rawGallery)) {
    for (const e of rawGallery) {
      if (typeof e === 'string' && e.trim().length > 0) {
        gallery.push(e.trim());
      }
    }
  }

  const { lat, lng } = readLatLng(data);

  const courtTypes = readStringArray(data['courtTypes'] ?? data['sports']);
  const surfaces = readStringArray(data['surfaces']);

  return {
    id: doc.id,
    name,
    locationLabel,
    coverUrl,
    logoUrl,
    pricePerHourReais: price,
    description: typeof data['description'] === 'string' ? data['description'] : null,
    city: city || null,
    state: state || null,
    galleryImageUrls: gallery,
    ratingAverage: typeof data['ratingAverage'] === 'number' ? data['ratingAverage'] : 0,
    reviewsCount: typeof data['reviewsCount'] === 'number' ? data['reviewsCount'] : 0,
    lat,
    lng,
    courtTypes,
    surfaces,
    reputationScore: typeof data['reputationScore'] === 'number' ? data['reputationScore'] : 0,
    onlinePaymentEnabled: data['onlinePaymentEnabled'] !== false,
    onsitePaymentEnabled: data['onsitePaymentEnabled'] !== false,
    amenities: amenitiesFromFirestore(data['amenities']),
  };
}

function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  for (const e of raw) {
    if (typeof e === 'string' && e.trim().length > 0) {
      out.push(e.trim());
    }
  }
  return out;
}

export function arenaListItemImageUrl(item: ArenaListItem): string {
  return item.coverUrl ?? DEFAULT_IMAGE_URL;
}

function readLatLng(data: DocumentData): { lat: number | null; lng: number | null } {
  for (const lk of ['lat', 'latitude'] as const) {
    for (const gk of ['lng', 'longitude', 'lon'] as const) {
      const lat = data[lk];
      const lng = data[gk];
      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
    }
  }
  const geo = data['geo'] ?? data['coordinates'];
  if (geo && typeof geo === 'object') {
    const g = geo as Record<string, unknown>;
    if (typeof g['lat'] === 'number' && typeof g['lng'] === 'number') {
      return { lat: g['lat'], lng: g['lng'] };
    }
  }
  return { lat: null, lng: null };
}
