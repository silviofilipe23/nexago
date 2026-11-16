/**
 * Leads do formulário "Quero contratar" (`partnerLeads/{partnerId}_{uid}`), gravados só pela callable
 * `submitPartnerLead` com o consentimento do atleta. O backoffice só lê e exporta.
 */
import { toCsv } from './csv';
import { sourceLabel } from './benefit-metrics';

export interface PartnerLead {
  id: string;
  partnerId: string;
  partnerName: string;
  uid: string;
  name: string;
  /** Dígitos com DDI: "5562982406456". */
  whatsapp: string;
  neighborhood: string;
  /** 8 dígitos. */
  cep: string;
  city: string | null;
  state: string | null;
  source: string;
  surface: string;
  consentText: string;
  consentAt: Date | null;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  submitCount: number;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOf(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

export function leadFromDoc(id: string, data: Record<string, unknown>): PartnerLead {
  const count = data['submitCount'];
  return {
    id,
    partnerId: text(data['partnerId']),
    partnerName: text(data['partnerName']) || text(data['partnerId']),
    uid: text(data['uid']),
    name: text(data['name']),
    whatsapp: text(data['whatsapp']).replace(/\D+/g, ''),
    neighborhood: text(data['neighborhood']),
    cep: text(data['cep']).replace(/\D+/g, ''),
    city: text(data['city']) || null,
    state: text(data['state']).toUpperCase() || null,
    source: text(data['source']) || 'unknown',
    surface: text(data['surface']),
    consentText: text(data['consentText']),
    consentAt: dateOf(data['consentAt']),
    status: text(data['status']) || 'new',
    createdAt: dateOf(data['createdAt']),
    updatedAt: dateOf(data['updatedAt']),
    submitCount: typeof count === 'number' && count > 0 ? count : 1,
  };
}

/** "5562982406456" → "(62) 98240-6456"; fixo de 10 dígitos → "(62) 3240-6456". */
export function formatWhatsapp(digits: string): string {
  const local = (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

/** Link do WhatsApp com DDI; `null` se o número não tiver cara de telefone. */
export function whatsappLink(digits: string): string | null {
  if (!/^\d{10,13}$/.test(digits)) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}`;
}

/** "74230010" → "74230-010". */
export function formatCep(digits: string): string {
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** "Goiânia/GO", "Goiânia", "—". */
export function cityState(lead: Pick<PartnerLead, 'city' | 'state'>): string {
  if (lead.city && lead.state) return `${lead.city}/${lead.state}`;
  return lead.city ?? lead.state ?? '—';
}

/** "16/11/2026 14:05" no fuso do navegador (a equipe está no Brasil). */
export function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** Mais recente primeiro (pela primeira vez que o atleta mandou). */
export function sortLeads(leads: readonly PartnerLead[]): PartnerLead[] {
  return [...leads].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export function filterLeads(leads: readonly PartnerLead[], partnerId: string | null): PartnerLead[] {
  return partnerId ? leads.filter((l) => l.partnerId === partnerId) : [...leads];
}

/** Parceiros que têm lead, para o filtro: id e nome, em ordem alfabética. */
export function leadPartners(leads: readonly PartnerLead[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const l of leads) {
    if (l.partnerId && !map.has(l.partnerId)) map.set(l.partnerId, l.partnerName || l.partnerId);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * CSV para entregar ao parceiro: os dados que o atleta autorizou compartilhar, a origem e a prova
 * do consentimento (texto aceito e data). O uid fica de fora: é interno da NexaGO.
 */
export function leadsCsv(leads: readonly PartnerLead[]): string {
  const head = [
    'Quando',
    'Parceiro',
    'Nome',
    'WhatsApp',
    'Bairro',
    'CEP',
    'Cidade',
    'UF',
    'Origem',
    'Envios',
    'Último envio',
    'Consentimento em',
    'Texto do consentimento',
  ];
  const rows = leads.map((l) => [
    formatDateTime(l.createdAt),
    l.partnerName,
    l.name,
    formatWhatsapp(l.whatsapp),
    l.neighborhood,
    formatCep(l.cep),
    l.city ?? '',
    l.state ?? '',
    sourceLabel(l.source),
    l.submitCount,
    formatDateTime(l.updatedAt),
    formatDateTime(l.consentAt),
    l.consentText,
  ]);
  return toCsv([head, ...rows]);
}
