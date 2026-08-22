import type { LucideIcon } from 'lucide-react';

export type DocAudienceId = 'atletas' | 'organizadores' | 'arenas';

export type ChipTone = 'brand' | 'pending' | 'live' | 'win' | 'neutral';

export type MockChip = { label: string; tone?: ChipTone };

/**
 * Blocos declarativos das ilustrações de tela (ScreenFigure). Cada bloco vira
 * um elemento esquemático no mock — a ilustração retrata o produto, não o site.
 */
export type MockBlock =
  | { kind: 'banner'; title: string; sub?: string; cta?: string }
  | { kind: 'stats'; items: { label: string; value: string }[] }
  | { kind: 'row'; title: string; sub?: string; chip?: MockChip }
  | { kind: 'score'; teamA: string; teamB: string; sets: [string, string][]; live?: boolean }
  | { kind: 'button'; label: string }
  | { kind: 'field'; label: string; value?: string }
  | { kind: 'bracket' }
  | { kind: 'calendar'; label?: string }
  | { kind: 'search'; placeholder: string }
  | { kind: 'tabs'; items: string[]; active?: number }
  | { kind: 'pix'; label?: string }
  | { kind: 'heading'; label: string };

export type MockScreen = {
  eyebrow?: string;
  title: string;
  chips?: MockChip[];
  blocks: MockBlock[];
  /** Aba ativa da bottom nav do app; omitir esconde a barra (telas web). */
  bottomNav?: 'Início' | 'Agenda' | 'Reservar' | 'Competir' | 'Comunidade';
};

export type DocScreen =
  | { kind: 'image'; frame: 'phone'; src: string; alt: string }
  | { kind: 'mock'; frame: 'phone' | 'browser'; alt: string; screen: MockScreen };

export type DocFlowStep = {
  title: string;
  detail: string;
  /** Estado visível ao usuário nesse passo (ex.: "Pagamento pendente"). */
  state?: MockChip;
};

export type DocFlow = {
  title: string;
  intro?: string;
  steps: DocFlowStep[];
  outcome?: string;
};

export type DocFeature = {
  /** Slug usado como âncora (#id) e nos links da busca. */
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  body: string[];
  flows?: DocFlow[];
  rules?: string[];
  faq?: { q: string; a: string }[];
  /** Termos extras para a busca (sinônimos, jargão dos atletas). */
  keywords?: string[];
  screen?: DocScreen;
};

export type DocGroup = {
  title: string;
  features: DocFeature[];
};

export type DocAudience = {
  id: DocAudienceId;
  label: string;
  /** "Onde acontece": app, painel web etc. */
  surface: string;
  tagline: string;
  description: string;
  hero?: { src: string; alt: string };
  groups: DocGroup[];
};

/** Entrada serializável do índice de busca (sem ícones/JSX). */
export type SearchDoc = {
  audience: DocAudienceId;
  audienceLabel: string;
  id: string;
  title: string;
  summary: string;
  /** Texto completo normalizado (sem acentos, minúsculas) para filtrar. */
  haystack: string;
};
