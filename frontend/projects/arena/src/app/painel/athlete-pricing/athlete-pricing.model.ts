import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';

/** Preço da hora por perfil do atleta (espelho de `functions/src/arena-athlete-pricing.ts`). */
export const ATHLETE_PRICING_TIERS = ['student', 'professor'] as const;
export type AthletePricingTier = (typeof ATHLETE_PRICING_TIERS)[number];
export type AthletePricingMode = 'fixed' | 'percent';

export const ATHLETE_PRICING_DEFAULT_LABEL: Record<AthletePricingTier, string> = {
  student: 'Aluno',
  professor: 'Professor',
};

export const ATHLETE_PRICING_TIER_HINT: Record<AthletePricingTier, string> = {
  student: 'Alunos validados pela arena.',
  professor: 'Ex.: professor que dá aula de outro esporte na sua quadra.',
};

export const MAX_ATHLETE_PRICING_PERCENT = 90;
export const MAX_ATHLETE_PRICING_PRICE = 10000;

/** Formulário de um perfil — valor como texto (o que o campo mostra). */
export interface AthletePricingTierForm {
  enabled: boolean;
  label: string;
  mode: AthletePricingMode;
  value: string;
}

export type AthletePricingForm = Record<AthletePricingTier, AthletePricingTierForm>;

export interface AthletePricingMember {
  id: string;
  athleteId: string;
  tier: AthletePricingTier;
  athleteName: string;
  athletePhotoUrl: string | null;
  note: string | null;
}

export function isAthletePricingTier(raw: unknown): raw is AthletePricingTier {
  return typeof raw === 'string' && (ATHLETE_PRICING_TIERS as readonly string[]).includes(raw);
}

function positive(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatValue(n: number | null): string {
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

function tierFormFrom(raw: unknown, tier: AthletePricingTier): AthletePricingTierForm {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode: AthletePricingMode = data['mode'] === 'percent' ? 'percent' : 'fixed';
  const label = typeof data['label'] === 'string' && data['label'].trim() ? data['label'].trim() : ATHLETE_PRICING_DEFAULT_LABEL[tier];
  return {
    enabled: data['enabled'] === true,
    label,
    mode,
    value: formatValue(mode === 'fixed' ? positive(data['pricePerHourReais']) : positive(data['discountPercent'])),
  };
}

/** Formulário a partir do doc da arena (`athletePricing` ausente = os dois perfis desligados). */
export function athletePricingFormFromArena(arena: Record<string, unknown> | null): AthletePricingForm {
  const raw = arena?.['athletePricing'];
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    student: tierFormFrom(data['student'], 'student'),
    professor: tierFormFrom(data['professor'], 'professor'),
  };
}

/** "100", "100,50", "R$ 100" → 100.5; inválido = null. */
export function parseMoneyOrPercent(text: string): number | null {
  const cleaned = text.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Erro do formulário (só os perfis ligados precisam de valor), ou `null`. */
export function athletePricingFormError(form: AthletePricingForm): string | null {
  for (const tier of ATHLETE_PRICING_TIERS) {
    const t = form[tier];
    if (!t.enabled) continue;
    const name = t.label.trim() || ATHLETE_PRICING_DEFAULT_LABEL[tier];
    const n = parseMoneyOrPercent(t.value);
    if (t.mode === 'fixed' && (n == null || n > MAX_ATHLETE_PRICING_PRICE)) {
      return `Defina o preço da hora de “${name}”.`;
    }
    if (t.mode === 'percent' && (n == null || !Number.isInteger(n) || n < 1 || n > MAX_ATHLETE_PRICING_PERCENT)) {
      return `O desconto de “${name}” vai de 1% a ${MAX_ATHLETE_PRICING_PERCENT}% (número inteiro).`;
    }
  }
  return null;
}

/** Payload de `setArenaAthletePricing`. */
export function athletePricingPayload(arenaId: string, form: AthletePricingForm): Record<string, unknown> {
  const tier = (t: AthletePricingTierForm) => {
    const n = parseMoneyOrPercent(t.value);
    return {
      enabled: t.enabled,
      label: t.label.trim().slice(0, 40),
      mode: t.mode,
      pricePerHourReais: t.mode === 'fixed' ? n : null,
      discountPercent: t.mode === 'percent' ? n : null,
    };
  };
  return { arenaId, student: tier(form.student), professor: tier(form.professor) };
}

/** "R$ 100/h" ou "20% de desconto" — `null` sem valor válido. */
export function athletePricingValueLabel(t: AthletePricingTierForm): string | null {
  const n = parseMoneyOrPercent(t.value);
  if (n == null) return null;
  if (t.mode === 'percent') return `${n}% de desconto`;
  return `R$ ${n.toFixed(2).replace('.', ',')}/h`;
}

export function athletePricingMemberFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): AthletePricingMember | null {
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (!isAthletePricingTier(data['tier'])) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    id: snap.id,
    athleteId: str(data['athleteId']) ?? '',
    tier: data['tier'],
    athleteName: str(data['athleteName']) ?? 'Atleta',
    athletePhotoUrl: str(data['athletePhotoUrl']),
    note: str(data['note']),
  };
}

export function sortMembersByName(members: AthletePricingMember[]): AthletePricingMember[] {
  return [...members].sort((a, b) => a.athleteName.localeCompare(b.athleteName, 'pt-BR'));
}
