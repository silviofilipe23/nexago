/** Marcas fictícias para demonstração — substituir por logos reais (SVG/PNG) quando houver. */
export interface LandingSupporterLogo {
  id: string;
  name: string;
  monogram: string;
  /** Cor da marca no hover (hex). */
  brandColor: string;
}

export interface LandingSupporterTier {
  id: 'patrocinadores' | 'parceiros' | 'apoiadores';
  label: string;
  logos: LandingSupporterLogo[];
}

export const LANDING_SUPPORTER_TIERS: LandingSupporterTier[] = [
  {
    id: 'patrocinadores',
    label: 'Patrocinadores',
    logos: [
      { id: 'sp-1', name: 'Brisa Sports', monogram: 'BS', brandColor: '#2dd4bf' },
      { id: 'sp-2', name: 'Volt Arena', monogram: 'VA', brandColor: '#6366f1' },
      { id: 'sp-3', name: 'Areia Pro', monogram: 'AP', brandColor: '#f472b6' },
      { id: 'sp-4', name: 'Nexo Energy', monogram: 'NE', brandColor: '#fbbf24' },
    ],
  },
  {
    id: 'parceiros',
    label: 'Parceiros',
    logos: [
      { id: 'pa-1', name: 'Rede Vôlei Praia', monogram: 'RV', brandColor: '#38bdf8' },
      { id: 'pa-2', name: 'Clube das Quadras', monogram: 'CQ', brandColor: '#a78bfa' },
      { id: 'pa-3', name: 'Beach Lab', monogram: 'BL', brandColor: '#34d399' },
      { id: 'pa-4', name: 'Move Sports', monogram: 'MS', brandColor: '#fb923c' },
      { id: 'pa-5', name: 'Sunset Eventos', monogram: 'SE', brandColor: '#f43f5e' },
    ],
  },
  {
    id: 'apoiadores',
    label: 'Apoiadores',
    logos: [
      { id: 'ap-1', name: 'Fed. Regional', monogram: 'FR', brandColor: '#94a3b8' },
      { id: 'ap-2', name: 'Instituto Joga Junto', monogram: 'IJ', brandColor: '#22d3ee' },
      { id: 'ap-3', name: 'Universidade do Esporte', monogram: 'UE', brandColor: '#c084fc' },
      { id: 'ap-4', name: 'Médicos da Areia', monogram: 'MA', brandColor: '#4ade80' },
      { id: 'ap-5', name: 'Podcast Na Rede', monogram: 'PR', brandColor: '#facc15' },
      { id: 'ap-6', name: 'Comunidade +Vôlei', monogram: '+V', brandColor: '#e879f9' },
    ],
  },
];
