/** Vitrine das aulas no app do atleta (Hub › Aulas e treinos): capa, descrição e aula
 *  experimental. Campo `showcase` do doc do centro — mesmo formato de `class-showcase.ts` e da
 *  validação nas rules (`ctShowcaseValid`). */
export interface CenterTrial {
  enabled: boolean;
  /** 0 = grátis. */
  priceReais: number;
  note: string;
}

export interface CenterShowcase {
  coverUrl: string | null;
  description: string;
  trial: CenterTrial;
}

export const SHOWCASE_DESCRIPTION_MAX = 400;
export const SHOWCASE_TRIAL_NOTE_MAX = 120;
export const SHOWCASE_TRIAL_PRICE_MAX = 2000;
export const SHOWCASE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const EMPTY_SHOWCASE: CenterShowcase = {
  coverUrl: null,
  description: '',
  trial: { enabled: false, priceReais: 0, note: '' },
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function readShowcase(raw: Record<string, unknown> | null | undefined): CenterShowcase {
  const d = raw ?? {};
  const t = (d['trial'] && typeof d['trial'] === 'object' ? d['trial'] : {}) as Record<string, unknown>;
  const cover = str(d['coverUrl']);
  const price = t['priceReais'];
  return {
    coverUrl: cover.startsWith('https://') ? cover : null,
    description: str(d['description']),
    trial: {
      enabled: t['enabled'] === true,
      priceReais: typeof price === 'number' && price >= 0 ? price : 0,
      note: str(t['note']),
    },
  };
}

/** Erro de formulário, ou `null` quando dá para salvar. */
export function showcaseError(s: CenterShowcase): string | null {
  if (s.description.trim().length > SHOWCASE_DESCRIPTION_MAX) {
    return `A descrição passa de ${SHOWCASE_DESCRIPTION_MAX} caracteres.`;
  }
  const p = s.trial.priceReais;
  if (!Number.isFinite(p) || p < 0 || p > SHOWCASE_TRIAL_PRICE_MAX) {
    return `Valor da aula experimental entre R$ 0 e R$ ${SHOWCASE_TRIAL_PRICE_MAX}.`;
  }
  if (s.trial.note.trim().length > SHOWCASE_TRIAL_NOTE_MAX) {
    return `A observação da experimental passa de ${SHOWCASE_TRIAL_NOTE_MAX} caracteres.`;
  }
  return null;
}

/** Erro do arquivo da capa, ou `null`. */
export function showcaseImageError(file: { type: string; size: number }): string | null {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return 'Selecione uma imagem JPG, PNG ou WebP.';
  if (file.size > SHOWCASE_IMAGE_MAX_BYTES) return 'Imagem muito grande — o limite é 5 MB.';
  return null;
}

/** Formato gravado: textos aparados, preço com 2 casas. */
export function showcaseToFirestore(s: CenterShowcase): CenterShowcase {
  return {
    coverUrl: s.coverUrl,
    description: s.description.trim(),
    trial: {
      enabled: s.trial.enabled,
      priceReais: Math.round(s.trial.priceReais * 100) / 100,
      note: s.trial.note.trim(),
    },
  };
}

/** "Experimental grátis" / "Experimental R$ 50" — o mesmo texto do app. */
export function trialLabel(t: CenterTrial): string {
  if (!t.enabled) return 'Sem aula experimental';
  return t.priceReais > 0
    ? `Experimental R$ ${t.priceReais.toFixed(2).replace('.', ',').replace(',00', '')}`
    : 'Experimental grátis';
}

/** "49,90" → 49.9; vazio → 0; inválido → NaN (o formulário mostra o erro). */
export function parseReais(raw: string): number {
  const t = raw.trim().replace(/\s|R\$/g, '');
  if (t === '') return 0;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}
