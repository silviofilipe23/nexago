/**
 * Resgates confirmados pelo parceiro (`benefitRedemptions/{partnerId}_{externalId}`, spec v2). A
 * equipe cola o CSV do parceiro, confere a prévia e envia pela callable `importBenefitRedemptions`,
 * que liga o código ao atleta. Só `matched` vira economia no app: número inflado vale menos que
 * número nenhum. Funções puras; o repositório lê e chama a callable.
 */

export const REDEMPTION_STATUSES = ['matched', 'ambiguous', 'unmatched'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export const REDEMPTION_STATUS_LABELS: Record<RedemptionStatus, string> = {
  matched: 'Confirmado',
  ambiguous: 'Ambíguo',
  unmatched: 'Sem dono',
};

/** Linhas por chamada (a callable aceita até 500 e recusa o lote inteiro se uma linha tiver defeito). */
export const IMPORT_BATCH_SIZE = 200;
/** Teto de linhas por arquivo: acima disso, divida o CSV. */
export const IMPORT_MAX_ROWS = 5000;
/** Mesmo padrão da callable (`functions/src/benefits-club-admin.ts`). */
const CODE_PATTERN = /^[A-Z0-9-]{1,40}$/;
const EXTERNAL_ID_MAX = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Pedido antes disto é erro de digitação (o clube nasceu em 2026). */
const MIN_DATE = new Date(2025, 0, 1).getTime();

export interface BenefitRedemption {
  id: string;
  partnerId: string;
  externalId: string;
  code: string;
  uid: string | null;
  status: RedemptionStatus;
  discountCents: number;
  orderCents: number | null;
  redeemedAt: Date | null;
  importedAt: Date | null;
  importedByName: string;
}

/** Uma linha do CSV pronta para a callable. `line` é a linha no arquivo (1 = primeira). */
export interface RedemptionRow {
  line: number;
  code: string;
  externalId: string;
  /** Data do pedido em ms (meia-noite local quando o CSV traz só o dia). */
  redeemedAt: number;
  discountCents: number;
  orderCents: number | null;
}

export interface RowError {
  line: number;
  message: string;
}

export interface ParsedRedemptions {
  rows: RedemptionRow[];
  errors: RowError[];
  /** O arquivo tinha linha de cabeçalho (pulada). */
  hadHeader: boolean;
}

export interface ImportResult {
  matched: number;
  ambiguous: number;
  unmatched: number;
  duplicates: number;
}

export const EMPTY_IMPORT_RESULT: ImportResult = { matched: 0, ambiguous: 0, unmatched: 0, duplicates: 0 };

// ── leitura do Firestore ───────────────────────────────────────────────────

function dateOf(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  return value instanceof Date ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export function redemptionFromDoc(id: string, data: Record<string, unknown>): BenefitRedemption {
  const status = data['status'];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id,
    partnerId: str(data['partnerId']),
    externalId: str(data['externalId']),
    code: str(data['code']),
    uid: typeof data['uid'] === 'string' && data['uid'] !== '' ? data['uid'] : null,
    status: (REDEMPTION_STATUSES as readonly unknown[]).includes(status) ? (status as RedemptionStatus) : 'unmatched',
    discountCents: int(data['discountCents']) ?? 0,
    orderCents: int(data['orderCents']),
    redeemedAt: dateOf(data['redeemedAt']),
    importedAt: dateOf(data['importedAt']),
    importedByName: str(data['importedByName']),
  };
}

/** Mais recente primeiro (pela data do pedido). */
export function sortRedemptions(list: readonly BenefitRedemption[]): BenefitRedemption[] {
  return [...list].sort((a, b) => (b.redeemedAt?.getTime() ?? 0) - (a.redeemedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

// ── CSV ────────────────────────────────────────────────────────────────────

/** Separa uma linha respeitando aspas ("a;b" fica numa célula; "" dentro de aspas é uma aspa). */
export function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

/** `;` (Excel pt-BR), tab ou `,`: o que mais aparece fora de aspas na primeira linha. */
export function detectSeparator(firstLine: string): string {
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const counts = [';', '\t', ','].map((sep) => ({ sep, n: outside.split(sep).length - 1 }));
  const best = counts.sort((a, b) => b.n - a.n)[0]!;
  return best.n > 0 ? best.sep : ';';
}

/**
 * "R$ 1.234,56", "12,5", "12.50", "12" → centavos. Com vírgula, ela é o decimal e o ponto é
 * milhar; só com ponto, "1.234" é milhar e "12.50" é decimal. Vazio ou texto = `null`.
 */
export function parseMoneyCents(raw: string): number | null {
  let t = raw.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/**
 * "16/11/2026", "16/11/2026 14:30", "16/11/26", "2026-11-16", "2026-11-16T14:30:00" → ms no fuso
 * local (só o dia = meia-noite). Data impossível ("31/02") ou texto = `null`.
 */
export function parseRedeemedAt(raw: string): number | null {
  const t = raw.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  let parts: number[] | null = null;
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    parts = [year, Number(m[2]), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
    if (m) parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  }
  if (!parts) return null;
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi, s);
  const valid = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d && h < 24 && mi < 60 && s < 60;
  return valid ? date.getTime() : null;
}

function looksLikeHeader(cells: readonly string[]): boolean {
  return parseMoneyCents(cells[3] ?? '') === null && parseRedeemedAt(cells[2] ?? '') === null;
}

function rowError(cells: readonly string[], now: Date): string | { row: Omit<RedemptionRow, 'line'> } {
  const [rawCode = '', rawId = '', rawDate = '', rawDiscount = '', rawOrder = ''] = cells;
  const code = rawCode.trim().toUpperCase();
  if (code === '') return 'Falta o código.';
  if (!CODE_PATTERN.test(code)) return `Código "${rawCode}" inválido: só letras, números e -.`;
  const externalId = rawId.trim();
  if (externalId === '') return 'Falta o id do pedido.';
  if (externalId.length > EXTERNAL_ID_MAX || externalId.includes('/') || externalId.startsWith('__') || /^\.\.?$/.test(externalId)) {
    return `Id do pedido inválido: até ${EXTERNAL_ID_MAX} caracteres, sem "/" e sem começar com "__".`;
  }
  const redeemedAt = parseRedeemedAt(rawDate);
  if (redeemedAt === null) return `Data "${rawDate}" inválida: use 16/11/2026 ou 2026-11-16.`;
  if (redeemedAt > now.getTime() + DAY_MS) return 'Data no futuro.';
  if (redeemedAt < MIN_DATE) return 'Data antes de 2025: confira o ano.';
  const discountCents = parseMoneyCents(rawDiscount);
  if (discountCents === null || discountCents <= 0) return `Desconto "${rawDiscount}" inválido: use 12,50.`;
  const orderCents = rawOrder.trim() === '' ? null : parseMoneyCents(rawOrder);
  if (rawOrder.trim() !== '' && orderCents === null) return `Valor do pedido "${rawOrder}" inválido: use 82,90 ou deixe vazio.`;
  if (orderCents !== null && orderCents < discountCents) return 'O desconto é maior que o valor do pedido.';
  return { row: { code, externalId, redeemedAt, discountCents, orderCents } };
}

/**
 * CSV do parceiro → linhas válidas e erros por linha. Colunas, nesta ordem: código, id do pedido,
 * data, desconto em R$ e valor do pedido (opcional). Cabeçalho é detectado e pulado; linha vazia é
 * ignorada; pedido repetido no arquivo vale só a primeira vez.
 */
export function parseRedemptionCsv(text: string, now: Date): ParsedRedemptions {
  const lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const first = lines.find((l) => l.trim() !== '') ?? '';
  const separator = detectSeparator(first);
  const rows: RedemptionRow[] = [];
  const errors: RowError[] = [];
  const seen = new Map<string, number>();
  let hadHeader = false;
  let sawData = false;

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === '') return;
    const cells = splitCsvLine(raw, separator);
    if (!sawData && !hadHeader && looksLikeHeader(cells)) {
      hadHeader = true;
      return;
    }
    sawData = true;
    const result = rowError(cells, now);
    if (typeof result === 'string') {
      errors.push({ line, message: result });
      return;
    }
    const firstAt = seen.get(result.row.externalId);
    if (firstAt !== undefined) {
      errors.push({ line, message: `Pedido ${result.row.externalId} repetido (já está na linha ${firstAt}).` });
      return;
    }
    seen.set(result.row.externalId, line);
    rows.push({ line, ...result.row });
  });

  if (rows.length > IMPORT_MAX_ROWS) {
    errors.push({ line: rows[IMPORT_MAX_ROWS]!.line, message: `Mais de ${IMPORT_MAX_ROWS} linhas: divida o arquivo.` });
    return { rows: rows.slice(0, IMPORT_MAX_ROWS), errors, hadHeader };
  }
  return { rows, errors, hadHeader };
}

/**
 * O que a callable recebe por linha (`orderCents` só quando veio). A data vai em ISO com fuso (UTC):
 * a callable aceita AAAA-MM-DD[THH:mm[:ss[.sss]]][Z|±hh:mm], e sem fuso ela leria no horário do
 * servidor (UTC), três horas fora do pedido de Brasília.
 */
export function callableRow(row: RedemptionRow): {
  code: string;
  externalId: string;
  redeemedAt: string;
  discountCents: number;
  orderCents?: number;
} {
  const base = {
    code: row.code,
    externalId: row.externalId,
    redeemedAt: new Date(row.redeemedAt).toISOString(),
    discountCents: row.discountCents,
  };
  return row.orderCents === null ? base : { ...base, orderCents: row.orderCents };
}

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function addResults(a: ImportResult, b: ImportResult): ImportResult {
  return {
    matched: a.matched + b.matched,
    ambiguous: a.ambiguous + b.ambiguous,
    unmatched: a.unmatched + b.unmatched,
    duplicates: a.duplicates + b.duplicates,
  };
}

/** Resposta da callable com campo faltando ou estranho vira 0 (nunca NaN na tela). */
export function importResultOf(data: unknown): ImportResult {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const n = (k: string) => (typeof d[k] === 'number' && Number.isFinite(d[k]) ? (d[k] as number) : 0);
  return { matched: n('matched'), ambiguous: n('ambiguous'), unmatched: n('unmatched'), duplicates: n('duplicates') };
}

/** 1234 → "R$ 12,34". */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Total das linhas da prévia (só para conferência com o parceiro; não é economia de ninguém ainda). */
export function previewTotals(rows: readonly RedemptionRow[]): { count: number; discountCents: number } {
  return { count: rows.length, discountCents: rows.reduce((sum, r) => sum + r.discountCents, 0) };
}
