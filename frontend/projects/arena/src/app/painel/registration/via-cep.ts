import { onlyDigits } from './arena-registration.model';

/** ViaCEP: consulta pública de CEP, sem chave e com CORS aberto — por isso roda no browser,
 *  diferente do geocoding, que precisa do token do Mapbox e vive numa Cloud Function. */

export interface ViaCepAddress {
  cep: string;
  logradouro: string;
  bairro: string;
  city: string;
  state: string;
}

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** CEP sem logradouro é normal (cidade pequena, CEP geral): devolve o que veio e deixa o
 *  gestor completar a rua — melhor que tratar como CEP inexistente. */
export function mapViaCepResponse(raw: unknown): ViaCepAddress | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const data = raw as Record<string, unknown>;
  // CEP inexistente responde 200 com `{erro: true}` — e a API já devolveu a string "true".
  if (data['erro'] === true || data['erro'] === 'true') {
    return null;
  }
  const city = readString(data, 'localidade');
  const state = readString(data, 'uf');
  if (!city || !state) {
    return null;
  }
  return {
    cep: onlyDigits(readString(data, 'cep')),
    logradouro: readString(data, 'logradouro'),
    bairro: readString(data, 'bairro'),
    city,
    state: state.toUpperCase(),
  };
}

/** `fetchFn` injetável para os testes rodarem sem rede. Nunca lança: CEP errado ou ViaCEP fora
 *  do ar viram `null`, e a tela segue com o gestor digitando o endereço na mão. */
export async function fetchAddressByCep(cep: string, fetchFn: typeof fetch = fetch): Promise<ViaCepAddress | null> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) {
    return null;
  }
  try {
    const response = await fetchFn(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) {
      return null;
    }
    return mapViaCepResponse(await response.json());
  } catch {
    return null;
  }
}
