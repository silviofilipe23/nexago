import { GeoPoint } from 'firebase/firestore';
import {
  arenaAddressFromDoc,
  arenaCompanyFromDoc,
  buildArenaAddressUpdate,
  buildArenaCompanyUpdate,
} from './arena-registration-repository';

describe('arenaCompanyFromDoc', () => {
  it('devolve campos vazios quando a arena ainda não tem cadastro', () => {
    expect(arenaCompanyFromDoc(undefined)).toEqual({
      cpfCnpj: '',
      razaoSocial: '',
      nomeFantasia: '',
      inscricaoMunicipal: '',
    });
  });

  it('mapeia o doc de cadastro', () => {
    expect(arenaCompanyFromDoc({
      cpfCnpj: '11222333000181',
      razaoSocial: 'Arena Ingleses Ltda',
      nomeFantasia: 'Arena Ingleses',
      inscricaoMunicipal: '987654',
    })).toEqual({
      cpfCnpj: '11222333000181',
      razaoSocial: 'Arena Ingleses Ltda',
      nomeFantasia: 'Arena Ingleses',
      inscricaoMunicipal: '987654',
    });
  });

  it('ignora valor de tipo errado em vez de vazar para a tela', () => {
    expect(arenaCompanyFromDoc({ cpfCnpj: 11222333000181, razaoSocial: null }).cpfCnpj).toBe('');
  });
});

describe('arenaAddressFromDoc', () => {
  it('lê o endereço estruturado e a coordenada', () => {
    const read = arenaAddressFromDoc({
      addressParts: { cep: '88010000', logradouro: 'Rua Felipe Schmidt', numero: '120', complemento: '', bairro: 'Centro' },
      city: 'Florianópolis',
      state: 'SC',
      latitude: -27.5954,
      longitude: -48.548,
    });
    expect(read.parts.logradouro).toBe('Rua Felipe Schmidt');
    expect(read.city).toBe('Florianópolis');
    expect(read.coords).toEqual({ latitude: -27.5954, longitude: -48.548 });
  });

  it('arena antiga só tem a linha única: devolve partes vazias e guarda a linha como referência', () => {
    const read = arenaAddressFromDoc({
      address: 'Rua das Gaivotas, 120 - Ingleses',
      city: 'Florianópolis',
      state: 'SC',
    });
    expect(read.parts.logradouro).toBe('');
    expect(read.legacyAddress).toBe('Rua das Gaivotas, 120 - Ingleses');
    expect(read.city).toBe('Florianópolis');
    expect(read.coords).toBeNull();
  });

  it('não devolve coordenada pela metade', () => {
    expect(arenaAddressFromDoc({ latitude: -27.5954 }).coords).toBeNull();
  });

  it('partes que não batem com a linha gravada são ignoradas — o app editou depois', () => {
    // `ArenaProfileEditService` (Flutter) grava `address` em texto livre e não conhece
    // `addressParts`. Confiar nas partes aqui mostraria o endereço velho e, ao salvar,
    // desfaria a edição feita no app.
    const read = arenaAddressFromDoc({
      address: 'Av. das Rendeiras, 800 - Lagoa, Florianópolis - SC',
      addressParts: { cep: '88010000', logradouro: 'Rua Felipe Schmidt', numero: '120', complemento: '', bairro: 'Centro' },
      city: 'Florianópolis',
      state: 'SC',
    });
    expect(read.parts.logradouro).toBe('');
    expect(read.legacyAddress).toBe('Av. das Rendeiras, 800 - Lagoa, Florianópolis - SC');
  });

  it('não repete a linha única como referência quando já existem as partes', () => {
    const read = arenaAddressFromDoc({
      address: 'Rua Felipe Schmidt, 120 - Centro, Florianópolis - SC',
      addressParts: { cep: '88010000', logradouro: 'Rua Felipe Schmidt', numero: '120', complemento: '', bairro: 'Centro' },
      city: 'Florianópolis',
      state: 'SC',
    });
    expect(read.legacyAddress).toBe('');
    expect(read.parts.logradouro).toBe('Rua Felipe Schmidt');
  });
});

describe('buildArenaAddressUpdate', () => {
  const parts = { cep: '88010-000', logradouro: 'Rua Felipe Schmidt', numero: '120', complemento: '', bairro: 'Centro' };

  it('deriva a linha única que app e site já leem', () => {
    const update = buildArenaAddressUpdate(parts, 'Florianópolis', 'sc', { latitude: -27.5954, longitude: -48.548 });
    expect(update['address']).toBe('Rua Felipe Schmidt, 120 - Centro, Florianópolis - SC');
  });

  it('normaliza CEP para dígitos e UF para maiúscula', () => {
    const update = buildArenaAddressUpdate(parts, 'Florianópolis', 'sc', null);
    expect((update['addressParts'] as { cep: string }).cep).toBe('88010000');
    expect(update['state']).toBe('SC');
  });

  it('grava latitude, longitude e o GeoPoint que a busca por distância usa', () => {
    const update = buildArenaAddressUpdate(parts, 'Florianópolis', 'SC', { latitude: -27.5954, longitude: -48.548 });
    expect(update['latitude']).toBe(-27.5954);
    expect(update['longitude']).toBe(-48.548);
    expect(update['location'] instanceof GeoPoint).toBe(true);
    expect((update['location'] as GeoPoint).latitude).toBe(-27.5954);
  });

  it('sem coordenada, limpa a antiga em vez de deixar a arena no lugar errado', () => {
    const update = buildArenaAddressUpdate(parts, 'Florianópolis', 'SC', null);
    expect('latitude' in update).toBe(true);
    expect('longitude' in update).toBe(true);
    expect('location' in update).toBe(true);
    expect(typeof update['latitude']).not.toBe('number');
  });
});

describe('buildArenaCompanyUpdate', () => {
  it('guarda o documento só com dígitos e apara o resto', () => {
    const update = buildArenaCompanyUpdate({
      cpfCnpj: '11.222.333/0001-81',
      razaoSocial: '  Arena Ingleses Ltda ',
      nomeFantasia: '',
      inscricaoMunicipal: ' 987654 ',
    });
    expect(update['cpfCnpj']).toBe('11222333000181');
    expect(update['razaoSocial']).toBe('Arena Ingleses Ltda');
    expect(update['inscricaoMunicipal']).toBe('987654');
  });

  it('preserva as letras do CNPJ alfanumérico em vez de só dígitos', () => {
    const update = buildArenaCompanyUpdate({
      cpfCnpj: '12.ABC.345/01DE-35',
      razaoSocial: 'Arena Ingleses Ltda',
      nomeFantasia: '',
      inscricaoMunicipal: '',
    });
    expect(update['cpfCnpj']).toBe('12ABC34501DE35');
  });

  it('não grava nome fantasia vazio', () => {
    const update = buildArenaCompanyUpdate({
      cpfCnpj: '11222333000181',
      razaoSocial: 'Arena Ingleses Ltda',
      nomeFantasia: '   ',
      inscricaoMunicipal: '',
    });
    expect(update['nomeFantasia']).toBe('');
  });
});
