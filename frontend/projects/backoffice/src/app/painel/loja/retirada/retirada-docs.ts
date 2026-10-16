import { relativeStamp } from '../estoque/data/stock';
import type { ConfigFrete, ModalidadeFrete, PontoRetirada, Remessa } from './retirada.model';

type Raw = Record<string, any>;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cityOf(data: Raw): string {
  const city = str(data['city']);
  const state = str(data['state']);
  return city && state ? `${city} · ${state}` : city || state;
}

/**
 * Espelho de `DEFAULT_SHIPPING_CONFIG` (functions/src/store-pickup.ts): vale enquanto
 * `storeConfig/shipping` não existir. Mudar lá exige mudar aqui.
 */
export const DEFAULT_SHIPPING: Raw = {
  freeShippingAboveCents: 39900,
  pickupDeadlineDays: 5,
  originZip: '74215-010',
  handlingHours: 24,
  cancelExpiredPickup: true,
  refundAsWalletCredit: true,
  defaultCommissionPct: 4,
  melhorEnvioConnected: false,
  modes: [
    { id: 'padrao', name: 'Padrão', description: 'Correios PAC / Jadlog · 3–5 dias úteis', priceType: 'calculado', priceCents: null, active: true },
    { id: 'expressa', name: 'Expressa', description: 'Loggi · Goiânia e região em 24 h', priceType: 'fixo', priceCents: 3490, active: true },
    { id: 'motoboy', name: 'Motoboy', description: 'Mesma cidade · até 3 h', priceType: 'fixo', priceCents: 1490, active: false },
  ],
};

/** Config salva por cima do padrão, modalidade a modalidade (doc pode ser de versão anterior). */
export function shippingFromDoc(data: Raw | undefined): {
  config: ConfigFrete;
  modalidades: ModalidadeFrete[];
  melhorEnvioConectado: boolean;
} {
  const saved = data ?? {};
  const merged = { ...DEFAULT_SHIPPING, ...saved };
  const savedModes = Array.isArray(saved['modes']) ? (saved['modes'] as Raw[]) : [];
  const modes = (DEFAULT_SHIPPING['modes'] as Raw[]).map((m) => ({ ...m, ...(savedModes.find((s) => s?.['id'] === m['id']) ?? {}) }));
  return {
    config: {
      freteGratisAcimaCents: merged['freeShippingAboveCents'],
      prazoRetiradaDias: merged['pickupDeadlineDays'],
      cepOrigem: merged['originZip'],
      prazoSeparacaoH: merged['handlingHours'],
      cancelarRetiradaVencida: merged['cancelExpiredPickup'],
      reembolsoEmSaldo: merged['refundAsWalletCredit'],
      comissaoPadraoPct: merged['defaultCommissionPct'],
    },
    modalidades: modes.map((m) => ({
      id: m['id'],
      nome: m['name'],
      descricao: m['description'],
      tipoValor: m['priceType'] === 'calculado' ? 'calculado' : 'fixo',
      valorCents: typeof m['priceCents'] === 'number' ? m['priceCents'] : null,
      ativo: m['active'] === true,
    })),
    melhorEnvioConectado: merged['melhorEnvioConnected'] === true,
  };
}

/**
 * Uma linha por arena reivindicada, com o ponto por cima quando existe. Ponto cuja arena
 * sumiu da lista (voltou a pré-cadastro, foi apagada) continua aparecendo: pode ter pedido.
 */
export function pontosFrom(arenas: { id: string; data: Raw }[], points: { id: string; data: Raw }[]): PontoRetirada[] {
  const byId = new Map(points.map((p) => [p.id, p.data]));
  const rows: PontoRetirada[] = arenas
    .filter((a) => a.data['unclaimed'] !== true || byId.has(a.id))
    .map((a) => pontoFrom(a.id, a.data, byId.get(a.id)));
  const seen = new Set(rows.map((r) => r.id));
  for (const p of points) {
    if (!seen.has(p.id)) {
      rows.push(pontoFrom(p.id, p.data, p.data));
    }
  }
  // Configurados primeiro (é o que a operação usa); dentro de cada grupo, por nome.
  return rows.sort((a, b) => Number(b.configurado) - Number(a.configurado) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function pontoFrom(id: string, arena: Raw, point: Raw | undefined): PontoRetirada {
  return {
    id,
    configurado: point !== undefined,
    localId: point?.['locationId'] ?? null,
    nome: str(arena['name']) || str(point?.['name']) || `Arena ${id}`,
    endereco: str(arena['address']) || str(point?.['address']),
    cidade: cityOf(arena) || cityOf(point ?? {}),
    balcao: str(point?.['counter']),
    horario: str(point?.['hours']),
    responsavel: str(point?.['managerName']),
    prazoAbastecimentoH: point?.['restockHours'] === 48 ? 48 : 24,
    comissaoPct: typeof point?.['commissionPct'] === 'number' ? point['commissionPct'] : null,
    ativo: point?.['active'] === true,
    aguardando: 0,
  };
}

/** Só transferências; o resto do histórico de estoque não é remessa. */
export function remessasFrom(
  movements: { id: string; data: Raw }[],
  locationName: (id: string) => string,
  now: Date,
  max = 5,
): Remessa[] {
  return movements
    .filter((m) => m.data['type'] === 'transferencia')
    .slice(0, max)
    .map(({ id, data }) => {
      const items = (data['items'] ?? []) as Raw[];
      // Item com `locationId` é uma perna (saída do CD, entrada na arena): conta só a entrada.
      const legs = items.some((i) => i['locationId']) ? items.filter((i) => i['locationId'] === data['toLocationId']) : items;
      const units = legs.reduce((n, i) => n + Math.abs(i['delta'] ?? i['qty'] ?? 0), 0);
      const recebida = data['status'] === 'recebida';
      const createdAt: Date | null = data['createdAt']?.toDate?.() ?? (data['createdAt'] instanceof Date ? data['createdAt'] : null);
      const receivedAt: Date | null = data['receivedAt']?.toDate?.() ?? (data['receivedAt'] instanceof Date ? data['receivedAt'] : null);
      const by = str(data['receivedBy']?.['name']);
      const quando = recebida
        ? [relativeStamp(receivedAt ?? createdAt, now), by].filter(Boolean).join(' · ')
        : `Saiu ${relativeStamp(createdAt, now).replace(/^(Hoje|Ontem)/, (w) => w.toLowerCase())}`;
      return {
        id,
        codigo: str(data['reference']) || id.slice(0, 6).toUpperCase(),
        destino: data['toLocationId'] ? locationName(data['toLocationId']) : '—',
        pedidos: Array.isArray(data['orderIds']) ? data['orderIds'].length : 0,
        unidades: units,
        status: recebida ? 'recebida' : 'em_transito',
        quando,
      };
    });
}
