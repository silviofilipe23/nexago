import type { PillTone } from '../../../ui/pill.component';
import type { CustomizationConfig } from '../../produtos/personalizacao/data/customization';

export type CustomStatus = 'aprovar' | 'nova_imagem' | 'producao' | 'pronto' | 'reprovado';
export type NewImageReason = 'baixa_resolucao' | 'marca_terceiros' | 'conteudo_improprio' | 'outro';
export type RefundScope = 'personalizacao' | 'item';
export type CheckLevel = 'ok' | 'warn' | 'erro';

export interface CustomImage {
  url: string | null;
  widthPx: number;
  heightPx: number;
  format: string;
  sizeBytes: number;
  backgroundRemoved: boolean;
}

export interface CustomItem {
  id: string;
  version: number;
  orderCode: string;
  productId: string;
  productName: string;
  variantLabel: string;
  customerName: string;
  name: string | null;
  font: string | null;
  nameColor: string | null;
  namePlacement: string | null;
  image: CustomImage | null;
  imageArea: string | null;
  units: string[];
  finalFiles: { name: string; url: string | null }[];
  status: CustomStatus;
  request: { reason: NewImageReason; note: string } | null;
  refund: { scope: RefundScope; status: string } | null;
  batchId: string | null;
  createdAt: Date | null;
  approvedAt: Date | null;
  readyAt: Date | null;
  slaDueAt: Date | null;
  updatedAt: Date | null;
}

export const STATUS_INFO: Record<CustomStatus, { label: string; tone: PillTone; tab: string; empty: string }> = {
  aprovar: { label: 'Aprovar arte', tone: 'orange', tab: 'Aprovar arte', empty: 'Nenhuma arte para aprovar' },
  nova_imagem: { label: 'Nova imagem', tone: 'red', tab: 'Aguardando cliente', empty: 'Ninguém reenviando imagem' },
  producao: { label: 'Em produção', tone: 'yellow', tab: 'Em produção', empty: 'Nada em produção' },
  pronto: { label: 'Pronto', tone: 'green', tab: 'Prontos', empty: 'Nenhum item pronto' },
  reprovado: { label: 'Reprovado', tone: 'dim', tab: 'Reprovados', empty: 'Nenhum item reprovado' },
};

export const STATUS_ORDER: CustomStatus[] = ['aprovar', 'nova_imagem', 'producao', 'pronto', 'reprovado'];

export const REASON_LABELS: Record<NewImageReason, string> = {
  baixa_resolucao: 'Baixa resolução',
  marca_terceiros: 'Marca de terceiros',
  conteudo_improprio: 'Conteúdo impróprio',
  outro: 'Outro',
};

export const PLACEMENT_SHORT: Record<string, string> = {
  costas_superior: 'Costas',
  costas_inferior: 'Costas (inferior)',
  frente: 'Frente',
  manga: 'Manga',
};

type Raw = Record<string, any>;

function dateOf(v: any): Date | null {
  return v?.toDate?.() ?? (v instanceof Date ? v : null);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function customItemFromDoc(id: string, d: Raw): CustomItem {
  const img = d['image'] as Raw | undefined;
  return {
    id,
    version: typeof d['version'] === 'number' ? d['version'] : 0,
    orderCode: str(d['orderCode']),
    productId: str(d['productId']),
    productName: str(d['productName']),
    variantLabel: str(d['variantLabel']),
    customerName: str(d['customer']?.['name']) || 'Cliente',
    name: str(d['name']) || null,
    font: str(d['font']) || null,
    nameColor: str(d['nameColor']) || null,
    namePlacement: str(d['namePlacement']) || null,
    image: img
      ? {
          url: str(img['url']) || null,
          widthPx: Number(img['widthPx']) || 0,
          heightPx: Number(img['heightPx']) || 0,
          format: str(img['format']).toLowerCase(),
          sizeBytes: Number(img['sizeBytes']) || 0,
          backgroundRemoved: img['backgroundRemoved'] === true,
        }
      : null,
    imageArea: str(d['imageArea']) || null,
    units: Array.isArray(d['units']) ? (d['units'] as Raw[]).map((u) => str(u?.['name'])) : [],
    finalFiles: Array.isArray(d['finalFiles']) ? (d['finalFiles'] as Raw[]).map((f) => ({ name: str(f['name']), url: str(f['url']) || null })) : [],
    status: (STATUS_ORDER as string[]).includes(d['status']) ? d['status'] : 'aprovar',
    request: d['request'] ? { reason: d['request']['reason'], note: str(d['request']['note']) } : null,
    refund: d['refund'] ? { scope: d['refund']['scope'], status: str(d['refund']['status']) } : null,
    batchId: str(d['batchId']) || null,
    createdAt: dateOf(d['createdAt']),
    approvedAt: dateOf(d['approvedAt']),
    readyAt: dateOf(d['readyAt']),
    slaDueAt: dateOf(d['slaDueAt']),
    updatedAt: dateOf(d['updatedAt']),
  };
}

/** Coluna "Nome": o texto, "8 nomes" num kit, ou "—". */
export function nameCell(item: CustomItem): string {
  if (item.units.length > 1) {
    return `${item.units.length} nomes`;
  }
  return (item.units[0] ?? item.name ?? '').toUpperCase() || '—';
}

/** Unidades físicas: um kit de 8 camisetas conta 8. */
export function unitCount(item: CustomItem): number {
  return Math.max(1, item.units.length);
}

export function slaOverdue(item: CustomItem, now: Date): boolean {
  return item.status === 'aprovar' && item.slaDueAt !== null && item.slaDueAt.getTime() < now.getTime();
}

/** "Aprovar arte" por SLA: a mais antiga primeiro. As outras abas: a mais recente primeiro. */
export function itemsForTab(items: CustomItem[], status: CustomStatus): CustomItem[] {
  const t = (d: Date | null) => d?.getTime() ?? 0;
  const rows = items.filter((i) => i.status === status);
  return status === 'aprovar'
    ? rows.sort((a, b) => t(a.createdAt) - t(b.createdAt))
    : rows.sort((a, b) => t(b.updatedAt ?? b.createdAt) - t(a.updatedAt ?? a.createdAt));
}

export function tabCounts(items: CustomItem[]): Record<CustomStatus, number> {
  const counts = { aprovar: 0, nova_imagem: 0, producao: 0, pronto: 0, reprovado: 0 };
  for (const i of items) {
    counts[i.status]++;
  }
  return counts;
}

export interface CheckRow {
  id: 'resolucao' | 'formato' | 'nome' | 'conteudo';
  label: string;
  level: CheckLevel;
  detail: string;
}

const IDEAL_DPI = 300;

/** dpi efetivo da imagem esticada na área de impressão (o lado que mais estica manda). */
export function effectiveDpi(widthPx: number, heightPx: number, widthCm: number, heightCm: number): number {
  return Math.floor(Math.min(widthPx / (widthCm / 2.54), heightPx / (heightCm / 2.54)));
}

function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Checklist automático do painel. ✓ ok · ! conferir · ✕ erro. O conteúdo da imagem é sempre
 * "conferir": máquina não sabe se a foto é de outra pessoa.
 */
export function checklist(item: CustomItem, config: CustomizationConfig, blocklist: string[]): CheckRow[] {
  const rows: CheckRow[] = [];
  const img = item.image;
  if (img) {
    const area = config.image.areas.find((a) => a.id === item.imageArea);
    const belowMin = img.widthPx < config.image.minWidthPx || img.heightPx < config.image.minHeightPx;
    const dpi = area ? effectiveDpi(img.widthPx, img.heightPx, area.widthCm, area.heightCm) : null;
    rows.push({
      id: 'resolucao',
      label: 'Resolução',
      level: belowMin ? 'erro' : dpi !== null && dpi < IDEAL_DPI ? 'warn' : 'ok',
      detail: belowMin
        ? `${img.widthPx} × ${img.heightPx} px · abaixo do mínimo de ${config.image.minWidthPx} × ${config.image.minHeightPx}`
        : `${img.widthPx} × ${img.heightPx} px${dpi !== null ? ` · ${dpi} dpi no tamanho de impressão` : ''}`,
    });
    const formatOk = (config.image.formats as string[]).includes(img.format === 'jpeg' ? 'jpg' : img.format);
    const sizeOk = img.sizeBytes <= config.image.maxSizeMb * 1_000_000;
    rows.push({
      id: 'formato',
      label: 'Formato',
      level: formatOk && sizeOk ? 'ok' : 'erro',
      detail: `${img.format.toUpperCase() || '?'}${img.backgroundRemoved ? ' com fundo removido' : ''} · ${mb(img.sizeBytes)}${
        !formatOk ? ' · formato não aceito' : !sizeOk ? ` · acima de ${config.image.maxSizeMb} MB` : ''
      }`,
    });
  }

  const names = item.units.length > 0 ? item.units : item.name ? [item.name] : [];
  if (names.length > 0) {
    const longest = Math.max(...names.map((n) => n.length));
    const terms = config.name.blockOffensive ? blocklist.map(normalize) : [];
    const blocked = names.some((n) => terms.some((t) => t !== '' && normalize(n).includes(t)));
    const tooLong = longest > config.name.maxChars;
    rows.push({
      id: 'nome',
      label: names.length > 1 ? 'Nomes' : 'Nome',
      level: tooLong || blocked ? 'erro' : 'ok',
      detail: `${longest} caracteres${tooLong ? ` · acima do máximo de ${config.name.maxChars}` : ''} · ${
        blocked ? 'tem palavra bloqueada' : 'sem palavras bloqueadas'
      }`,
    });
  }

  if (img) {
    rows.push({
      id: 'conteudo',
      label: 'Conteúdo da imagem',
      level: 'warn',
      detail: 'Confira se não tem marca de terceiros ou foto de outra pessoa',
    });
  }
  return rows;
}

export interface CustomKpis {
  toApprove: number;
  waitingCustomer: number;
  inProductionUnits: number;
  withoutBatch: number;
  /** Média aprovação → pronto nos últimos 30 dias; `null` sem dado. */
  avgDays: number | null;
  /** Diferença para os 30 dias anteriores (positivo = mais lento). */
  avgDeltaDays: number | null;
}

const DAY = 86_400_000;

function avgLead(items: CustomItem[], from: number, to: number): number | null {
  const done = items.filter((i) => i.approvedAt && i.readyAt && i.readyAt.getTime() >= from && i.readyAt.getTime() < to);
  if (done.length === 0) {
    return null;
  }
  return done.reduce((n, i) => n + (i.readyAt!.getTime() - i.approvedAt!.getTime()), 0) / done.length / DAY;
}

export function customKpis(items: CustomItem[], now: Date): CustomKpis {
  const counts = tabCounts(items);
  const production = items.filter((i) => i.status === 'producao');
  const t = now.getTime();
  const avg = avgLead(items, t - 30 * DAY, t + 1);
  const before = avgLead(items, t - 60 * DAY, t - 30 * DAY);
  return {
    toApprove: counts.aprovar,
    waitingCustomer: counts.nova_imagem,
    inProductionUnits: production.reduce((n, i) => n + unitCount(i), 0),
    withoutBatch: production.filter((i) => !i.batchId).length,
    avgDays: avg,
    avgDeltaDays: avg !== null && before !== null ? avg - before : null,
  };
}

/** Uma linha por nome (kit = várias linhas): é como a estamparia confere. */
export function batchCsv(
  rows: { item: CustomItem; areaLabel: string }[],
): string {
  const header = ['pedido', 'produto', 'variacao', 'nome', 'fonte', 'cor', 'local do nome', 'area da imagem', 'imagem', 'arquivos'];
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.join(';')];
  for (const { item, areaLabel } of rows) {
    const names = item.units.length > 0 ? item.units : [item.name ?? ''];
    for (const name of names) {
      lines.push([
        `#${item.orderCode}`,
        item.productName,
        item.variantLabel,
        name.toUpperCase(),
        item.font ?? '',
        item.nameColor ?? '',
        item.namePlacement ? (PLACEMENT_SHORT[item.namePlacement] ?? item.namePlacement) : '',
        areaLabel,
        item.image?.url ?? '',
        item.finalFiles.map((f) => f.url ?? f.name).join(' '),
      ].map(esc).join(';'));
    }
  }
  // BOM: o Excel abre acentuado certo.
  return '﻿' + lines.join('\r\n');
}
