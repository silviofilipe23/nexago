export interface ArenaPreview {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  pricePerHourReais: number;
  rating: number;
  distanceKm: number;
  available: boolean;
  imageUrl: string;
  /** Fotos extras para galeria no detalhe (hero costuma repetir o primeiro item). */
  galleryImageUrls?: string[];
  badge?: 'popular' | 'rating';
  /** Ficha de detalhe (marketing); fallback no componente se vazio. */
  description?: string;
  /** Se `false`, checkout só oferece Mercado Pago (padrão: aceita pagar na arena). */
  allowPayAtArena?: boolean;
}

export const MOCK_ARENAS: ArenaPreview[] = [
  {
    id: '1',
    name: 'Arena Vôlei Sul',
    city: 'Curitiba',
    state: 'PR',
    lat: -25.429596,
    lng: -49.271272,
    pricePerHourReais: 120,
    rating: 4.8,
    distanceKm: 2.3,
    available: true,
    imageUrl: 'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&q=85&auto=format&fit=crop',
    ],
    badge: 'popular',
    description:
      'Quadra oficial com areia nivelada, iluminação LED e espaço amplo para cal aquecimento. Atendimento NexaGO com check-in digital e suporte no local.',
  },
  {
    id: '2',
    name: 'Beach Point Praia',
    city: 'Florianópolis',
    state: 'SC',
    lat: -27.59487,
    lng: -48.54822,
    pricePerHourReais: 95,
    rating: 4.6,
    distanceKm: 4.1,
    available: false,
    imageUrl: 'https://images.unsplash.com/photo-1592652579629-a2e91534317b?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1592652579629-a2e91534317b?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=1200&q=85&auto=format&fit=crop',
    ],
    badge: 'rating',
    description:
      'Areia de praia com drenagem e vista aberta. Ideal para jogos em duplas e treinos à tarde; estrutura para eventos sob consulta.',
  },
  {
    id: '3',
    name: 'Quadra Central',
    city: 'São Paulo',
    state: 'SP',
    lat: -23.55052,
    lng: -46.633308,
    pricePerHourReais: 140,
    rating: 4.9,
    distanceKm: 5.7,
    available: true,
    imageUrl: 'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&q=85&auto=format&fit=crop',
    ],
    description:
      'Quadra central em local de fácil acesso: piso tratado, marcações oficiais e iluminação para jogos até a noite. Perfil alto padrão NexaGO.',
    allowPayAtArena: false,
  },
  {
    id: '4',
    name: 'Arena Horizonte',
    city: 'Belo Horizonte',
    state: 'MG',
    lat: -19.924501,
    lng: -43.935238,
    pricePerHourReais: 110,
    rating: 4.5,
    distanceKm: 3.8,
    available: true,
    imageUrl: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1592652579629-a2e91534317b?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=1200&q=85&auto=format&fit=crop',
    ],
    description:
      'Espaço versátil com cobertura parcial, ótimo para dias de chuva leve. Área de convivência e reserva integrada pelo app.',
  },
  {
    id: '5',
    name: 'Nexus Sand Court',
    city: 'Rio de Janeiro',
    state: 'RJ',
    lat: -22.906847,
    lng: -43.172897,
    pricePerHourReais: 150,
    rating: 4.9,
    distanceKm: 1.9,
    available: true,
    imageUrl: 'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&q=85&auto=format&fit=crop',
    ],
    badge: 'popular',
    description:
      'Sand court premium no Rio, com rede profissional e ventilação natural. Um dos spots mais reservados da região — recomendamos reservar com antecedência.',
  },
  {
    id: '6',
    name: 'Vôlei Porto',
    city: 'Porto Alegre',
    state: 'RS',
    lat: -30.034647,
    lng: -51.217659,
    pricePerHourReais: 105,
    rating: 4.7,
    distanceKm: 6.2,
    available: false,
    imageUrl: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1592652579629-a2e91534317b?w=1200&q=85&auto=format&fit=crop',
    ],
    badge: 'rating',
    description:
      'Complexo com múltiplas quadras, perfeito para grupos e escolinhas. Iluminação e som ambiente para jogos noturnos.',
  },
  {
    id: '7',
    name: 'Arena Goiás Norte',
    city: 'Goiânia',
    state: 'GO',
    lat: -16.686882,
    lng: -49.26479,
    pricePerHourReais: 88,
    rating: 4.8,
    distanceKm: 1.4,
    available: true,
    imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1595435934249-45600a3ce4d6?w=1200&q=85&auto=format&fit=crop',
    ],
    badge: 'popular',
    description:
      'Arena referência no Norte de Goiás: areia macia, estacionamento amplo e atendimento rápido. Experiência NexaGO de ponta a ponta.',
  },
  {
    id: '8',
    name: 'Point Aparecida Beach',
    city: 'Aparecida de Goiânia',
    state: 'GO',
    lat: -16.82356,
    lng: -49.24389,
    pricePerHourReais: 102,
    rating: 4.4,
    distanceKm: 7.6,
    available: false,
    imageUrl: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80&auto=format&fit=crop',
    galleryImageUrls: [
      'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1612872087720-bb876e2ef67a?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1526306760382-68306565b53c?w=1200&q=85&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&q=85&auto=format&fit=crop',
    ],
    description:
      'Point de areia com clima de praia: ótimo para finais de semana e torneios amistosos. Confirme disponibilidade pelo calendário abaixo.',
  },
];

/** Chips rápidos (cidades + inteligentes). */
export interface SearchSmartChip {
  id: string;
  label: string;
  /** Texto aplicado ao campo de busca (vazio se não for filtro por texto). */
  query: string;
  kind: 'city' | 'area' | 'trend' | 'tournament_nav';
}

export const SMART_SEARCH_CHIPS: SearchSmartChip[] = [
  { id: 'goiania', label: 'Goiânia', query: 'Goiânia', kind: 'city' },
  { id: 'aparecida', label: 'Aparecida de Goiânia', query: 'Aparecida', kind: 'area' },
  { id: 'popular', label: 'Arenas populares', query: '', kind: 'trend' },
  { id: 'tournaments', label: 'Torneios próximos', query: '', kind: 'tournament_nav' },
];
