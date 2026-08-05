import type { InscriptionUniformSlot, TournamentInscription } from './inscriptions-repository';
import { EMPTY_INSCRIPTION_UNIFORM } from './inscriptions-repository';
import type { OrganizerTournament, OrganizerTournamentCategory } from './tournament.model';

/** Pedidos de uniforme do torneio — porta fiel de `tournament_uniforms_logic.dart` (Flutter),
 *  mesma fonte de dados: a config vive na categoria do `tournaments/{id}` e a escolha de cada
 *  atleta nos campos `sizeTopPlayer1`/`jerseyNumberPlayer2`/… da inscrição. NADA aqui escreve:
 *  o uniforme é do atleta (callable `setRegistrationUniform`), o organizador só consolida.
 *
 *  Dois desvios deliberados do app, ambos por correção:
 *  - herança das flags da raiz igual ao portal do atleta (`categoryOfferFromRaw`): categoria sem
 *    exigência própria em torneio com `uniformRequired` conta como `top_only`. Sem isso, torneio
 *    antigo (só flags na raiz) apareceria "com uniforme" e com a lista vazia.
 *  - shorts entram na regra de completude quando a categoria é `full` — é o que o app COBRA do
 *    atleta em `validateUniformSelection`; o organizador do Flutter olhava só a regata. */

/** Tamanhos padrão quando a categoria não define os próprios (`kDefaultUniformSizeOptionsTop`). */
export const DEFAULT_UNIFORM_SIZES_TOP = ['PP', 'P', 'M', 'G', 'GG', 'XGG'] as const;
export const DEFAULT_UNIFORM_SIZES_SHORTS = ['PP', 'P', 'M', 'G', 'GG', 'XGG'] as const;

export type UniformStatus = 'confirmado' | 'pendente';

export interface UniformCategoryConfig {
  categoryId: string;
  name: string;
  requiresUniform: boolean;
  /** `full` = regata + shorts. */
  requiresShorts: boolean;
  numberOnShirt: boolean;
  nameOnShirt: boolean;
  sizeOptionsTop: string[];
  sizeOptionsShorts: string[];
  /** O que o fornecedor produz pra essa categoria. */
  modelLabel: string;
}

function typeRequiresUniform(uniformType: string | null): boolean {
  const t = uniformType?.trim() ?? 'none';
  return t === 'top_only' || t === 'top' || t === 'full';
}

function configFromCategory(category: OrganizerTournamentCategory, root: Pick<OrganizerTournament, 'uniformRequired' | 'uniformNumberOnShirt' | 'uniformNameOnShirt'>): UniformCategoryConfig {
  const ownRequirement = typeRequiresUniform(category.uniformType);
  // Herança da raiz — idêntica ao `TournamentDocumentMapper._parseCategoryOffers` (app) e ao
  // `categoryOfferFromRaw` (portal do atleta): sem exigência própria, o torneio manda.
  const inherits = !ownRequirement && root.uniformRequired;
  const uniformType = inherits ? 'top_only' : (category.uniformType?.trim() ?? 'none');
  const requiresUniform = ownRequirement || inherits;
  return {
    categoryId: category.id,
    name: category.name,
    requiresUniform,
    requiresShorts: uniformType === 'full',
    numberOnShirt: inherits ? root.uniformNumberOnShirt : category.uniformNumberOnShirt,
    nameOnShirt: inherits ? root.uniformNameOnShirt : category.uniformNameOnShirt,
    sizeOptionsTop: category.uniformSizeOptionsTop.length > 0 ? category.uniformSizeOptionsTop : [...DEFAULT_UNIFORM_SIZES_TOP],
    sizeOptionsShorts: category.uniformSizeOptionsShorts.length > 0 ? category.uniformSizeOptionsShorts : [...DEFAULT_UNIFORM_SIZES_SHORTS],
    modelLabel: uniformType === 'full' ? 'Regata + shorts' : 'Regata',
  };
}

export function uniformCategoryConfigs(tournament: OrganizerTournament | null): UniformCategoryConfig[] {
  if (!tournament) return [];
  return tournament.categories.map((c) => configFromCategory(c, tournament));
}

/** Torneio "com uniforme incluso" — o que decide se a tela existe pra ele. */
export function tournamentUsesUniform(tournament: OrganizerTournament | null): boolean {
  if (!tournament) return false;
  if (tournament.uniformRequired) return true;
  return tournament.categories.some((c) => typeRequiresUniform(c.uniformType));
}

/** Ordem dos tamanhos no gráfico: com categoria escolhida, só as opções dela (masculino e
 *  feminino podem ter grades diferentes); sem filtro, mescla as categorias com uniforme. */
export function uniformSizeOrder(configs: readonly UniformCategoryConfig[], categoryId?: string | null): string[] {
  const id = categoryId?.trim();
  if (id) {
    const config = configs.find((c) => c.categoryId === id);
    if (config?.requiresUniform) return [...config.sizeOptionsTop];
  }
  const merged = new Set<string>();
  for (const config of configs) {
    if (!config.requiresUniform) continue;
    for (const size of config.sizeOptionsTop) merged.add(size);
  }
  if (merged.size === 0) return [...DEFAULT_UNIFORM_SIZES_TOP];
  // Grade canônica primeiro (PP→XGG), tamanhos customizados no fim.
  const ordered = DEFAULT_UNIFORM_SIZES_TOP.filter((size) => merged.has(size)) as string[];
  for (const size of merged) {
    if (!ordered.includes(size)) ordered.push(size);
  }
  return ordered;
}

export function uniformStatusOf(config: UniformCategoryConfig, uniform: InscriptionUniformSlot): UniformStatus {
  const top = uniform.sizeTop?.trim() ?? '';
  if (!top || !config.sizeOptionsTop.includes(top)) return 'pendente';
  if (config.requiresShorts) {
    const shorts = uniform.sizeShorts?.trim() ?? '';
    if (!shorts || !config.sizeOptionsShorts.includes(shorts)) return 'pendente';
  }
  if (config.numberOnShirt) {
    const n = uniform.jerseyNumber;
    if (n == null || n < 1 || n > 99) return 'pendente';
  }
  if (config.nameOnShirt && !(uniform.jerseyName?.trim() ?? '')) return 'pendente';
  return 'confirmado';
}

/** "Rafael Souza" → "Rafael S." — parceiro na linha secundária sem estourar a coluna. */
export function shortDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  const last = parts[parts.length - 1]!;
  return `${parts[0]} ${last[0]!.toUpperCase()}.`;
}

export interface UniformRow {
  /** `<inscriptionId>:<slot>` — a inscrição sozinha não identifica a linha (são 2 atletas). */
  key: string;
  registrationId: string;
  athleteUid: string;
  athleteName: string;
  photoUrl: string | null;
  categoryId: string;
  categoryLabel: string;
  /** "c/ Rafael S." ou "aguardando parceiro" numa inscrição solo. */
  partnerLabel: string;
  sizeTop: string | null;
  sizeShorts: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
  requiresShorts: boolean;
  numberOnShirt: boolean;
  nameOnShirt: boolean;
  modelLabel: string;
  status: UniformStatus;
}

/** Uma linha POR ATLETA (a inscrição é da dupla, o uniforme é de cada um). Fora da lista:
 *  lista de espera (não tem pedido a fazer) e categoria sem uniforme. Inscrição solo aguardando
 *  parceiro ENTRA — o atleta já escolheu o uniforme dele e o pedido conta pro fornecedor (o app
 *  descartava essas por exigir o doc da dupla). */
export function uniformRowsFromInscriptions(params: {
  inscriptions: readonly TournamentInscription[];
  configs: readonly UniformCategoryConfig[];
}): UniformRow[] {
  const configById = new Map(params.configs.map((c) => [c.categoryId, c]));
  const rows: UniformRow[] = [];

  for (const inscription of params.inscriptions) {
    if (inscription.paymentStatus === 'waitlist') continue;
    const config = inscription.categoryId ? configById.get(inscription.categoryId) : undefined;
    if (!config?.requiresUniform) continue;

    const slots = [inscription.uniformPlayer1, inscription.uniformPlayer2];
    inscription.participants.slice(0, 2).forEach((participant, index) => {
      const partner = inscription.participants[index === 0 ? 1 : 0];
      const uniform = slots[index] ?? EMPTY_INSCRIPTION_UNIFORM;
      rows.push({
        key: `${inscription.id}:${index + 1}`,
        registrationId: inscription.id,
        athleteUid: participant.uid,
        athleteName: participant.name,
        photoUrl: participant.photoUrl,
        categoryId: config.categoryId,
        categoryLabel: config.name,
        partnerLabel: partner ? `c/ ${shortDisplayName(partner.name)}` : 'aguardando parceiro',
        sizeTop: uniform.sizeTop,
        sizeShorts: uniform.sizeShorts,
        jerseyNumber: uniform.jerseyNumber,
        jerseyName: uniform.jerseyName,
        requiresShorts: config.requiresShorts,
        numberOnShirt: config.numberOnShirt,
        nameOnShirt: config.nameOnShirt,
        modelLabel: config.modelLabel,
        status: uniformStatusOf(config, uniform),
      });
    });
  }

  rows.sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel, 'pt-BR') || a.athleteName.localeCompare(b.athleteName, 'pt-BR'));
  return rows;
}

export interface UniformSummary {
  total: number;
  confirmed: number;
  pending: number;
  confirmedPercent: number;
  /** Só linhas confirmadas entram na grade — tamanho de cadastro incompleto não vira pedido. */
  countBySize: Record<string, number>;
  sizeOrder: string[];
}

export function uniformSummary(rows: readonly UniformRow[], sizeOrder: readonly string[]): UniformSummary {
  const order = sizeOrder.length > 0 ? [...sizeOrder] : [...DEFAULT_UNIFORM_SIZES_TOP];
  const countBySize: Record<string, number> = {};
  for (const size of order) countBySize[size] = 0;

  let confirmed = 0;
  for (const row of rows) {
    if (row.status !== 'confirmado') continue;
    confirmed++;
    const size = row.sizeTop?.trim();
    if (size) countBySize[size] = (countBySize[size] ?? 0) + 1;
  }

  const total = rows.length;
  return {
    total,
    confirmed,
    pending: total - confirmed,
    confirmedPercent: total > 0 ? Math.round((confirmed * 100) / total) : 0,
    countBySize,
    sizeOrder: order,
  };
}

export interface UniformCategoryChip {
  categoryId: string;
  label: string;
  count: number;
}

export function uniformCategoryChips(rows: readonly UniformRow[]): UniformCategoryChip[] {
  const byId = new Map<string, UniformCategoryChip>();
  for (const row of rows) {
    const chip = byId.get(row.categoryId);
    if (chip) chip.count++;
    else byId.set(row.categoryId, { categoryId: row.categoryId, label: row.categoryLabel, count: 1 });
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export interface UniformFilter {
  categoryId?: string | null;
  sizeTop?: string | null;
  status?: UniformStatus | null;
  /** Busca por nome do atleta, nome da camisa ou número. */
  term?: string;
}

export function filterUniformRows(rows: readonly UniformRow[], filter: UniformFilter): UniformRow[] {
  const categoryId = filter.categoryId?.trim();
  const sizeTop = filter.sizeTop?.trim();
  const term = filter.term?.trim().toLowerCase();
  return rows.filter((row) => {
    if (categoryId && row.categoryId !== categoryId) return false;
    if (filter.status && row.status !== filter.status) return false;
    // Filtro de tamanho vale só pra quem cadastrou — pendente não tem tamanho a filtrar.
    if (sizeTop && (row.status !== 'confirmado' || row.sizeTop?.trim() !== sizeTop)) return false;
    if (term) {
      const haystack = [row.athleteName, row.jerseyName ?? '', row.jerseyNumber?.toString() ?? '', row.categoryLabel]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

function csvCell(value: string | number | null): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** CSV pro fornecedor: cabeçalho com o resumo, a grade por tamanho e uma linha por atleta.
 *  Mesmo conteúdo do `buildUniformsExportCsv` (app), com `;` e BOM porque o destino aqui é o
 *  Excel pt-BR (idem exportação do histórico no portal do atleta). */
export function buildUniformsCsv(params: {
  tournamentName: string;
  summary: UniformSummary;
  rows: readonly UniformRow[];
  anyRequiresShorts: boolean;
}): string {
  const { tournamentName, summary, rows, anyRequiresShorts } = params;
  const lines: string[][] = [
    ['Torneio', tournamentName],
    ['Total de atletas', String(summary.total)],
    ['Cadastros confirmados', String(summary.confirmed)],
    ['Pendentes de cadastro', String(summary.pending)],
    [],
    ['Grade de tamanhos (regata)'],
    ['Tamanho', 'Quantidade'],
  ];
  for (const size of summary.sizeOrder) {
    const count = summary.countBySize[size] ?? 0;
    if (count > 0) lines.push([size, String(count)]);
  }
  if (summary.pending > 0) lines.push(['Pendente sem escolha', String(summary.pending)]);

  lines.push([], ['Atletas']);
  const header = ['Atleta', 'Categoria', 'Parceiro', 'Tamanho'];
  if (anyRequiresShorts) header.push('Shorts');
  header.push('Numero', 'Nome na camisa', 'Modelo', 'Status');
  lines.push(header);

  for (const row of rows) {
    const line = [row.athleteName, row.categoryLabel, row.partnerLabel, row.sizeTop ?? ''];
    if (anyRequiresShorts) line.push(row.sizeShorts ?? '');
    line.push(
      row.jerseyNumber?.toString() ?? '',
      row.jerseyName ?? '',
      row.modelLabel,
      row.status === 'confirmado' ? 'Confirmado' : 'Pendente',
    );
    lines.push(line);
  }

  return lines.map((line) => line.map(csvCell).join(';')).join('\r\n');
}
