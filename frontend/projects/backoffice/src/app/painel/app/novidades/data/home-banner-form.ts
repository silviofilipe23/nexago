import {
  CTA_MAX,
  DESCRIPTION_MAX,
  TITLE_MAX,
  type HomeBanner,
  type HomeBannerAudience,
  type HomeBannerDestination,
  type HomeBannerFormat,
} from './home-banner';

export interface HomeBannerForm {
  format: HomeBannerFormat;
  title: string;
  description: string;
  ctaLabel: string;
  imageUrl: string | null;
  destination: HomeBannerDestination;
  url: string;
  audience: HomeBannerAudience;
  /** `YYYY-MM-DD` ou vazio (= sem limite). */
  startDate: string;
  endDate: string;
  hideAfterClick: boolean;
  dismissible: boolean;
}

export type HomeBannerFormErrors = Partial<Record<keyof HomeBannerForm, string>>;

/** Rascunho só respeita os tetos; publicar exige o banner completo. */
export type SaveIntent = 'draft' | 'publish';

/** O banner sem os campos que a tela decide (id, publicado, ativo). */
export type HomeBannerContent = Omit<HomeBanner, 'id' | 'published' | 'active'>;

export type HomeBannerFormResult =
  | { ok: true; content: HomeBannerContent }
  | { ok: false; errors: HomeBannerFormErrors };

export function emptyHomeBannerForm(): HomeBannerForm {
  return {
    format: 'carousel',
    title: '',
    description: '',
    ctaLabel: '',
    imageUrl: null,
    destination: 'reservar',
    url: '',
    audience: 'all',
    startDate: '',
    endDate: '',
    hideAfterClick: true,
    dismissible: true,
  };
}

export function formFromHomeBanner(b: HomeBanner): HomeBannerForm {
  return {
    format: b.format,
    title: b.title,
    description: b.description,
    ctaLabel: b.ctaLabel,
    imageUrl: b.imageUrl,
    destination: b.destination,
    url: b.url ?? '',
    audience: b.audience,
    startDate: b.startDate ?? '',
    endDate: b.endDate ?? '',
    hideAfterClick: b.hideAfterClick,
    dismissible: b.dismissible,
  };
}

/** Endereço https sem espaço — a mesma regra do servidor. */
export function isHttpsUrl(v: string): boolean {
  if (v.length > 1000 || /\s/.test(v)) {
    return false;
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

function required(value: string, max: number, missing: string, publish: boolean): string | undefined {
  if (value.length > max) {
    return `Até ${max} caracteres.`;
  }
  return publish && !value ? missing : undefined;
}

/** Form → conteúdo como a callable espera. Mesmas regras de `homeBannerErrors` no servidor. */
export function validateHomeBannerForm(f: HomeBannerForm, intent: SaveIntent): HomeBannerFormResult {
  const publish = intent === 'publish';
  const title = f.title.trim();
  const description = f.description.trim();
  const ctaLabel = f.ctaLabel.trim();
  const url = f.url.trim();
  const errors: HomeBannerFormErrors = {};

  const titleError = required(title, TITLE_MAX, 'Dê um título à novidade.', publish);
  if (titleError) {
    errors.title = titleError;
  }
  const descriptionError = required(description, DESCRIPTION_MAX, 'Escreva o benefício em uma linha.', publish);
  if (descriptionError) {
    errors.description = descriptionError;
  }
  const ctaError = required(ctaLabel, CTA_MAX, 'Texto do botão obrigatório.', publish && f.format === 'carousel');
  if (ctaError) {
    errors.ctaLabel = ctaError;
  }
  if (f.destination === 'url' && (url ? !isHttpsUrl(url) : publish)) {
    errors.url = 'Use um endereço https://.';
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
    content: {
      format: f.format,
      title,
      description,
      ctaLabel,
      imageUrl: f.imageUrl,
      destination: f.destination,
      url: f.destination === 'url' && url ? url : null,
      audience: f.audience,
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      hideAfterClick: f.hideAfterClick,
      dismissible: f.dismissible,
    },
  };
}

/** O banner que a prévia desenha enquanto a pessoa digita: campos vazios ganham o texto de exemplo. */
export function previewHomeBanner(f: HomeBannerForm): HomeBanner {
  return {
    id: 'previa',
    format: f.format,
    title: f.title.trim() || 'Título da novidade',
    description: f.description.trim() || 'Uma linha com o benefício para o atleta.',
    ctaLabel: f.ctaLabel.trim() || 'Conhecer',
    imageUrl: f.imageUrl,
    destination: f.destination,
    url: null,
    audience: f.audience,
    startDate: null,
    endDate: null,
    hideAfterClick: f.hideAfterClick,
    dismissible: f.dismissible,
    published: true,
    active: true,
  };
}

/** "Agendar" quando o início é depois de hoje; senão "Publicar". */
export function publishLabel(f: Pick<HomeBannerForm, 'startDate'>, today: string): string {
  return f.startDate && f.startDate > today ? 'Agendar' : 'Publicar';
}
