/**
 * Teto de vagas da categoria: como ler, e como abrir uma vaga a mais.
 *
 * Módulo puro (sem Firestore) porque as duas coisas que ele decide são delicadas e precisam de
 * teste direto: QUAL campo do documento é o teto de verdade, e QUAIS campos precisam subir
 * juntos para o painel, o app e o site não discordarem sobre quantas vagas a categoria tem.
 *
 * A vaga extra existe para o organizador inscrever atleta CONVIDADO numa categoria que já
 * lotou: em vez de furar o teto (e deixar toda contagem mentindo), o teto sobe — a categoria
 * passa a ter, de fato, uma vaga a mais.
 */

/**
 * Campos que podem carregar o teto, em ordem de preferência.
 *
 * `spotsLeft` entra por último e só como fallback de doc legado: ele nasce igual à capacidade e
 * nenhum writer o decrementa, então serve como "quanto cabe", nunca como "quanto sobra".
 */
export const CATEGORY_CAPACITY_FIELDS = [
  "maxTeams",
  "spotsTotal",
  "spots",
  "spotsLeft",
] as const;

/**
 * Campos que sobem juntos quando o teto aumenta. `spotsLeft` fica de fora porque é contador
 * morto: subir ele passaria a mentir "sobram 17 vagas" numa categoria cheia.
 */
const CAPACITY_FIELDS_TO_BUMP = ["maxTeams", "spotsTotal", "spots"] as const;

function numberOf(raw: unknown): number | null {
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Teto da categoria em EQUIPES (duplas/trios/…), ou `null` quando ela não declara teto — e aí
 * não há o que lotar.
 *
 * O primeiro valor POSITIVO vence — assim `maxTeams: 0` (sem teto declarado) cai para o próximo
 * campo em vez de ser lido como categoria lotada.
 */
export function resolveCategoryCapacity(
  category: Record<string, unknown> | null | undefined,
): number | null {
  if (!category) return null;
  for (const field of CATEGORY_CAPACITY_FIELDS) {
    const n = numberOf(category[field]);
    if (n != null && n > 0) return Math.trunc(n);
  }
  return null;
}

/**
 * Posição da categoria dentro de `categories`, ou `-1`.
 *
 * Única regra de casamento de categoria do projeto: inscrições legadas gravam ora o `id`, ora o
 * nome, então as quatro chaves valem. `findCategory` (guards) é esta função devolvendo o objeto.
 */
export function findCategoryIndex(
  categories: readonly unknown[] | null | undefined,
  categoryKey: string,
): number {
  if (!Array.isArray(categories)) return -1;
  const key = categoryKey.trim();
  if (!key) return -1;

  return categories.findIndex((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const c = entry as Record<string, unknown>;
    const name = String(c.categoryName ?? c.name ?? "").trim();
    const cid = String(c.id ?? c.categoryId ?? "").trim();
    return name === key || cid === key;
  });
}

export interface CategoryCapacityExpansion {
  /** Posição da categoria em `categories`. */
  index: number;
  /** O array `categories` INTEIRO com o teto novo — pronto para gravar no torneio. */
  categories: Array<Record<string, unknown>>;
  from: number;
  to: number;
}

/**
 * Plano para abrir UMA vaga na categoria, ou `null` quando não há vaga a abrir.
 *
 * `null` em três casos, todos legítimos: a categoria não declara teto (nunca lota), ainda cabe
 * alguém (a vaga extra seria inventada) ou a categoria sumiu do torneio.
 *
 * O teto novo é `max(teto, ocupação) + 1` — numa categoria que já estourou o teto por algum
 * caminho antigo, subir só 1 não caberia ninguém e o organizador ficaria clicando à toa.
 */
export function planCategoryCapacityExpansion(params: {
  categories: readonly unknown[] | null | undefined;
  categoryKey: string;
  /** Inscrições que já ocupam vaga (fila de espera não conta). */
  occupied: number;
}): CategoryCapacityExpansion | null {
  const {categories, categoryKey, occupied} = params;

  const index = findCategoryIndex(categories, categoryKey);
  if (index < 0) return null;

  const list = (categories as readonly unknown[]).map(
    (entry) => ({...(entry as Record<string, unknown>)}),
  );
  const category = list[index];

  const capacity = resolveCategoryCapacity(category);
  if (capacity == null) return null;
  if (occupied < capacity) return null;

  const to = Math.max(capacity, Math.trunc(occupied)) + 1;

  const declared = CAPACITY_FIELDS_TO_BUMP.filter((field) => {
    const n = numberOf(category[field]);
    return n != null && n > 0;
  });
  // Doc legado que só tem `spotsLeft`: sobe ele mesmo, senão o teto não mudaria.
  const targets = declared.length > 0 ? declared : [resolvedCapacityField(category)];

  for (const field of targets) {
    if (field) category[field] = to;
  }

  return {index, categories: list, from: capacity, to};
}

/** Qual campo respondeu pelo teto — usado só no fallback do doc legado. */
function resolvedCapacityField(
  category: Record<string, unknown>,
): string | null {
  for (const field of CATEGORY_CAPACITY_FIELDS) {
    const n = numberOf(category[field]);
    if (n != null && n > 0) return field;
  }
  return null;
}
