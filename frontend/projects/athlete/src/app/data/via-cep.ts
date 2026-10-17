/**
 * ViaCEP: consulta pública de CEP, sem chave e com CORS aberto — roda no browser (mesmo esquema
 * do portal da arena, `painel/registration/via-cep.ts`).
 */

export interface ViaCepAddress {
  cep: string;
  street: string;
  district: string;
  city: string;
  uf: string;
}

function read(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** CEP geral (cidade pequena) vem sem rua: devolve o que veio e o atleta completa. */
export function mapViaCepResponse(raw: unknown): ViaCepAddress | null {
  if (raw == null || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  // CEP inexistente responde 200 com `{erro: true}` (ou a string "true").
  if (data['erro'] === true || data['erro'] === 'true') return null;
  const city = read(data, 'localidade');
  const uf = read(data, 'uf');
  if (!city || !uf) return null;
  return {
    cep: read(data, 'cep').replace(/\D/g, ''),
    street: read(data, 'logradouro'),
    district: read(data, 'bairro'),
    city,
    uf: uf.toUpperCase(),
  };
}

/** Nunca lança: CEP errado ou ViaCEP fora do ar viram `null` e o atleta digita na mão. */
export async function fetchAddressByCep(cep: string, fetchFn: typeof fetch = fetch): Promise<ViaCepAddress | null> {
  const digits = (cep ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return null;
  try {
    const response = await fetchFn(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) return null;
    return mapViaCepResponse(await response.json());
  } catch {
    return null;
  }
}
