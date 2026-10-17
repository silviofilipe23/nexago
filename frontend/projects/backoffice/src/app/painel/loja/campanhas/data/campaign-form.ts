import { PRODUCT_CATEGORY_LABELS, PRODUCT_COLLECTIONS } from '../../produtos/data/products.repository';
import { CTA_LABEL_MAX, KICKER_MAX, SUBTITLE_MAX, TITLE_MAX, type CampaignBanner } from './campaign';

export type SecondaryKind = 'none' | 'category' | 'url';

export interface CampaignForm {
  kicker: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  primaryLabel: string;
  collectionId: string;
  secondaryKind: SecondaryKind;
  secondaryLabel: string;
  categoryId: string;
  url: string;
  /** `YYYY-MM-DD` ou vazio (= sem limite). */
  startDate: string;
  endDate: string;
  active: boolean;
}

export type CampaignFormErrors = Partial<Record<keyof CampaignForm, string>>;

export type CampaignFormResult =
  | { ok: true; banner: CampaignBanner }
  | { ok: false; errors: CampaignFormErrors };

export function emptyCampaignForm(): CampaignForm {
  return {
    kicker: '',
    title: '',
    subtitle: '',
    imageUrl: null,
    primaryLabel: 'Ver coleção',
    collectionId: PRODUCT_COLLECTIONS[0]?.id ?? '',
    secondaryKind: 'none',
    secondaryLabel: '',
    categoryId: '',
    url: '',
    startDate: '',
    endDate: '',
    active: true,
  };
}

export function formFromBanner(b: CampaignBanner): CampaignForm {
  const sec = b.secondary;
  return {
    kicker: b.kicker,
    title: b.title,
    subtitle: b.subtitle,
    imageUrl: b.imageUrl,
    primaryLabel: b.primary.label,
    collectionId: b.primary.collectionId,
    secondaryKind: !sec ? 'none' : sec.categoryId ? 'category' : 'url',
    secondaryLabel: sec?.label ?? '',
    categoryId: sec?.categoryId ?? '',
    url: sec?.url ?? '',
    startDate: b.startDate ?? '',
    endDate: b.endDate ?? '',
    active: b.active,
  };
}

/** Caminho do portal (`/torneios`) ou endereço https — a mesma regra de `isBannerLink` no servidor. */
export function isBannerLink(v: string): boolean {
  if (v.length > 1000 || /\s/.test(v)) {
    return false;
  }
  if (v.startsWith('/')) {
    return !v.startsWith('//');
  }
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

/** Form → banner como a callable espera. `id` é o do banner (fixo depois de criado). */
export function validateCampaignForm(f: CampaignForm, id: string): CampaignFormResult {
  const errors: CampaignFormErrors = {};
  const title = f.title.trim();
  const kicker = f.kicker.trim();
  const subtitle = f.subtitle.trim();
  const primaryLabel = f.primaryLabel.trim();
  const secondaryLabel = f.secondaryLabel.trim();
  const url = f.url.trim();

  if (kicker.length > KICKER_MAX) {
    errors.kicker = `Até ${KICKER_MAX} caracteres.`;
  }
  if (!title) {
    errors.title = 'Dê um título à campanha.';
  } else if (title.length > TITLE_MAX) {
    errors.title = `Até ${TITLE_MAX} caracteres.`;
  }
  if (subtitle.length > SUBTITLE_MAX) {
    errors.subtitle = `Até ${SUBTITLE_MAX} caracteres.`;
  }
  if (!primaryLabel || primaryLabel.length > CTA_LABEL_MAX) {
    errors.primaryLabel = primaryLabel ? `Até ${CTA_LABEL_MAX} caracteres.` : 'Texto do botão obrigatório.';
  }
  if (!PRODUCT_COLLECTIONS.some((c) => c.id === f.collectionId)) {
    errors.collectionId = 'Escolha a coleção.';
  }
  if (f.secondaryKind !== 'none') {
    if (!secondaryLabel || secondaryLabel.length > CTA_LABEL_MAX) {
      errors.secondaryLabel = secondaryLabel ? `Até ${CTA_LABEL_MAX} caracteres.` : 'Texto do botão obrigatório.';
    }
    if (f.secondaryKind === 'category' && !(f.categoryId in PRODUCT_CATEGORY_LABELS)) {
      errors.categoryId = 'Escolha a categoria.';
    }
    if (f.secondaryKind === 'url' && !isBannerLink(url)) {
      errors.url = 'Use um caminho do portal (/torneios) ou um endereço https://.';
    }
  }
  if (f.startDate && !isDate(f.startDate)) {
    errors.startDate = 'Data inválida.';
  }
  if (f.endDate && !isDate(f.endDate)) {
    errors.endDate = 'Data inválida.';
  } else if (f.endDate && f.startDate && f.endDate < f.startDate) {
    errors.endDate = 'O fim vem depois do início.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    banner: {
      id,
      kicker,
      title,
      subtitle,
      imageUrl: f.imageUrl,
      primary: { label: primaryLabel, collectionId: f.collectionId },
      secondary:
        f.secondaryKind === 'none'
          ? null
          : {
              label: secondaryLabel,
              categoryId: f.secondaryKind === 'category' ? f.categoryId : null,
              url: f.secondaryKind === 'url' ? url : null,
            },
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      active: f.active,
    },
  };
}

/** O banner que a prévia desenha enquanto a pessoa digita: campos vazios ganham o texto de exemplo. */
export function previewBanner(f: CampaignForm): CampaignBanner {
  const label = f.secondaryLabel.trim();
  return {
    id: 'previa',
    kicker: f.kicker.trim(),
    title: f.title.trim() || 'Título da campanha',
    subtitle: f.subtitle.trim(),
    imageUrl: f.imageUrl,
    primary: { label: f.primaryLabel.trim() || 'Ver coleção', collectionId: f.collectionId },
    secondary: f.secondaryKind === 'none' || !label ? null : { label, categoryId: f.categoryId || null, url: f.url || null },
    startDate: null,
    endDate: null,
    active: true,
  };
}
