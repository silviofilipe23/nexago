import type { ReceivingAccount, ReceivingStatus } from '../../domain/models';

export interface ReceivingDocRow {
  title: string;
  label: string;
  url: string;
}

export interface ReceivingView {
  kind: 'loading' | 'form' | 'readonly' | 'account';
  /** Formulário depois de uma tentativa que não criou a conta. */
  failed: boolean;
  title: string;
  text: string;
  pendingDocs: ReceivingDocRow[];
}

const DOC_STATUS: Record<string, string> = {
  NOT_SENT: 'Não enviado',
  PENDING: 'Em análise',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado · envie de novo',
};

/**
 * O que a tela mostra. `account` é o espelho `receivingAccount/current` (undefined = carregando);
 * centro conectado pelo script antigo não tem espelho e aparece como conta do time NexaGO.
 */
export function receivingView(
  account: ReceivingAccount | null | undefined,
  centerStatus: ReceivingStatus,
  connected: boolean,
  isOwner: boolean,
): ReceivingView {
  const base = { pendingDocs: [] as ReceivingDocRow[], failed: false, title: '', text: '' };
  if (account === undefined) {
    return { ...base, kind: 'loading' as const };
  }
  const status = account?.status ?? (connected ? 'approved' : centerStatus);
  if (!account && !connected) {
    return isOwner ? { ...base, kind: 'form', failed: centerStatus === 'failed' } : { ...base, kind: 'readonly' };
  }
  if (status === 'failed' || status === 'none') {
    return isOwner ? { ...base, kind: 'form', failed: status === 'failed' } : { ...base, kind: 'readonly' };
  }
  const pendingDocs = (account?.documents ?? [])
    .filter((d) => d.status !== 'APPROVED')
    .map((d) => ({ title: d.title, label: DOC_STATUS[d.status] ?? d.status, url: d.url }));
  const copy: Record<string, [string, string]> = {
    creating: ['Criando a conta no Asaas…', 'Isso leva alguns segundos.'],
    pending: [
      'Em análise no Asaas',
      pendingDocs.length
        ? 'Envie os documentos abaixo. Assim que o Asaas aprovar, as cobranças online liberam sozinhas.'
        : 'O Asaas está analisando o cadastro (1 a 3 dias úteis). Assim que aprovar, as cobranças online liberam sozinhas.',
    ],
    approved: [
      'Conta ativa',
      'As cobranças saem com link de Pix ou cartão e o dinheiro cai na conta do centro. Saldo e saques ficam no Asaas.',
    ],
    rejected: [
      'Conta recusada pelo Asaas',
      'O Asaas não aprovou o cadastro. Fale com o time NexaGO para entender o motivo e conectar outra conta.',
    ],
  };
  const [title, text] = copy[status] ?? copy['pending']!;
  return { ...base, kind: 'account', title, text, pendingDocs };
}

/** "R$ 25.000,50" / "25000" / "25.000" → reais (null se não der para ler). */
export function parseReais(raw: string): number | null {
  const clean = raw.replace(/[R$\s]/g, '');
  if (!clean) {
    return null;
  }
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replace(/\./g, '') : clean;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Checagem rápida antes de mandar para o servidor (que valida de novo, inclusive os dígitos). */
export function receivingFormError(f: {
  personType: 'company' | 'person';
  companyType: string;
  name: string;
  cpfCnpj: string;
  birthDate: string;
  email: string;
  mobilePhone: string;
  incomeValue: number | null;
  postalCode: string;
  address: string;
  addressNumber: string;
  province: string;
}): string | null {
  const doc = f.cpfCnpj.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (f.personType === 'company') {
    if (f.name.trim().length < 3) return 'Informe a razão social.';
    if (doc.length !== 14) return 'CNPJ inválido.';
    if (!f.companyType) return 'Informe o tipo de empresa.';
  } else {
    if (f.name.trim().split(/\s+/).length < 2) return 'Informe o nome completo.';
    if (!/^\d{11}$/.test(doc)) return 'CPF inválido.';
    if (!f.birthDate) return 'Informe a data de nascimento.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'E-mail inválido.';
  if (!/^\d{2}9\d{8}$/.test(f.mobilePhone.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))) return 'Celular inválido (DDD + 9 dígitos).';
  if (!f.incomeValue) return f.personType === 'company' ? 'Informe o faturamento mensal.' : 'Informe a renda mensal.';
  if (f.postalCode.replace(/\D/g, '').length !== 8) return 'CEP inválido.';
  if (!f.address.trim() || !f.addressNumber.trim() || !f.province.trim()) return 'Informe endereço, número e bairro.';
  return null;
}
