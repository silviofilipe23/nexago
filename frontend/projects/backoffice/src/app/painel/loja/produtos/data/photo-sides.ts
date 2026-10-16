export type PhotoView = 'frente' | 'costas';

export interface PhotoSides {
  frente: string | null;
  costas: string | null;
}

type Raw = Record<string, any>;

/**
 * Qual foto mostrar em cada lado da prévia de personalização.
 * Frente: a marcada como frente; sem marcação, a capa (a menos que a capa seja a das costas).
 * Costas: só a marcada — mostrar a frente no lugar das costas engana mais que o mockup.
 */
export function photoSides(photos: unknown): PhotoSides {
  const list = (Array.isArray(photos) ? photos : []).filter(
    (p): p is Raw => typeof p?.url === 'string' && p.url !== '',
  );
  const tagged = (view: PhotoView) => list.find((p) => p['view'] === view)?.['url'] ?? null;
  const cover = list[0];
  return {
    frente: tagged('frente') ?? (cover && cover['view'] !== 'costas' ? cover['url'] : null),
    costas: tagged('costas'),
  };
}
