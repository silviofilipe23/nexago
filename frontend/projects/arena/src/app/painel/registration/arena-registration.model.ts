import { isValidCpfCnpj, normalizeCpfCnpj } from '@nexago/br-documents';

/** Dados cadastrais da arena: identidade da empresa (`arenas/{id}/registration/data`, leitura
 *  restrita) e endereço estruturado (`arenas/{id}`, doc público que o app e o site leem).
 *  A separação é deliberada — ver `firestore.rules`: o doc da arena é `allow read: if true`,
 *  então CNPJ/CPF e razão social não podem morar nele. */

export interface ArenaCompanyRegistration {
  /** Só dígitos. Aceita CPF: arena de autônomo não tem CNPJ, e o Asaas cobra dos dois. */
  cpfCnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  inscricaoMunicipal: string;
}

export interface ArenaAddressParts {
  /** Só dígitos. */
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
}

export function onlyDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** Versão para o card do perfil: confirma que está cadastrado sem exibir o documento inteiro. */
export function maskCpfCnpj(raw: string): string {
  const doc = normalizeCpfCnpj(raw ?? '');
  if (doc.length === 14) {
    return `${doc.slice(0, 2)}.•••.•••/${doc.slice(8, 12)}-${doc.slice(12)}`;
  }
  if (doc.length === 11) {
    return `•••.${doc.slice(3, 6)}.${doc.slice(6, 9)}-••`;
  }
  return '';
}

export function isValidCep(raw: string): boolean {
  return onlyDigits(raw).length === 8;
}

export function formatCep(raw: string): string {
  const digits = onlyDigits(raw);
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : raw;
}

/** Monta `arenas/{id}.address` — a linha única que app, site e mini-site já leem. O campo
 *  continua existindo para não quebrar quem consome; quem passa a mandar nele são as partes. */
export function composeArenaAddress(parts: ArenaAddressParts, city: string, state: string): string {
  const street = [parts.logradouro, parts.numero, parts.complemento]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
  const bairro = parts.bairro.trim();
  const withBairro = bairro ? [street, bairro].filter(Boolean).join(' - ') : street;
  const locality = [city.trim(), state.trim().toUpperCase()].filter(Boolean).join(' - ');
  return [withBairro, locality].filter(Boolean).join(', ');
}

export function validateArenaCompany(company: ArenaCompanyRegistration): string | null {
  const doc = normalizeCpfCnpj(company.cpfCnpj);
  if (!doc) {
    return 'Informe o CNPJ ou CPF da arena.';
  }
  if (!isValidCpfCnpj(company.cpfCnpj)) {
    return 'CNPJ ou CPF inválido.';
  }
  if (!company.razaoSocial.trim()) {
    return 'Informe a razão social.';
  }
  return null;
}

export function validateArenaAddress(parts: ArenaAddressParts, city: string, state: string): string | null {
  if (!isValidCep(parts.cep)) {
    return 'CEP inválido.';
  }
  if (!parts.logradouro.trim()) {
    return 'Informe a rua.';
  }
  if (!parts.numero.trim()) {
    return 'Informe o número.';
  }
  if (!parts.bairro.trim()) {
    return 'Informe o bairro.';
  }
  if (!city.trim()) {
    return 'Informe a cidade.';
  }
  if (!state.trim()) {
    return 'Informe a UF.';
  }
  return null;
}
