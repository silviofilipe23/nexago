import { fetchAddressByCep, mapViaCepResponse } from './via-cep';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('mapViaCepResponse', () => {
  it('mapeia a resposta do ViaCEP para os campos do cadastro', () => {
    const address = mapViaCepResponse({
      cep: '88010-000',
      logradouro: 'Rua Felipe Schmidt',
      complemento: 'até 999',
      bairro: 'Centro',
      localidade: 'Florianópolis',
      uf: 'SC',
    });
    expect(address).toEqual({
      cep: '88010000',
      logradouro: 'Rua Felipe Schmidt',
      bairro: 'Centro',
      city: 'Florianópolis',
      state: 'SC',
    });
  });

  it('devolve null quando o CEP não existe', () => {
    expect(mapViaCepResponse({ erro: true })).toBeNull();
    expect(mapViaCepResponse({ erro: 'true' })).toBeNull();
  });

  it('devolve null para payload que não é objeto', () => {
    expect(mapViaCepResponse(null)).toBeNull();
    expect(mapViaCepResponse('88010000')).toBeNull();
  });

  it('aceita CEP de cidade sem logradouro — o gestor digita a rua', () => {
    const address = mapViaCepResponse({
      cep: '88000-000',
      logradouro: '',
      bairro: '',
      localidade: 'Florianópolis',
      uf: 'SC',
    });
    expect(address?.logradouro).toBe('');
    expect(address?.city).toBe('Florianópolis');
  });
});

describe('fetchAddressByCep', () => {
  it('consulta o ViaCEP e devolve o endereço', async () => {
    const calls: string[] = [];
    const address = await fetchAddressByCep('88010-000', async (url) => {
      calls.push(String(url));
      return jsonResponse({ cep: '88010-000', logradouro: 'Rua Felipe Schmidt', bairro: 'Centro', localidade: 'Florianópolis', uf: 'SC' });
    });
    expect(calls).toEqual(['https://viacep.com.br/ws/88010000/json/']);
    expect(address?.city).toBe('Florianópolis');
  });

  it('nem vai à rede quando o CEP está incompleto', async () => {
    let called = false;
    const address = await fetchAddressByCep('8801', async () => {
      called = true;
      return jsonResponse({});
    });
    expect(called).toBe(false);
    expect(address).toBeNull();
  });

  it('devolve null quando o ViaCEP responde erro de HTTP', async () => {
    const address = await fetchAddressByCep('88010000', async () => jsonResponse({}, false));
    expect(address).toBeNull();
  });

  it('devolve null quando a rede cai, em vez de estourar na tela', async () => {
    const address = await fetchAddressByCep('88010000', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(address).toBeNull();
  });
});
