import { formatCpfCnpjDisplay, isValidCpfCnpj } from '@nexago/br-documents';
import {
  composeArenaAddress,
  formatCep,
  isValidCep,
  maskCpfCnpj,
  validateArenaAddress,
  validateArenaCompany,
} from './arena-registration.model';

describe('isValidCpfCnpj (lib compartilhada)', () => {
  it('aceita CNPJ válido com e sem máscara', () => {
    expect(isValidCpfCnpj('11222333000181')).toBe(true);
    expect(isValidCpfCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('recusa CNPJ com dígito verificador errado', () => {
    expect(isValidCpfCnpj('11222333000182')).toBe(false);
  });

  it('aceita CPF válido — arena de autônomo não tem CNPJ', () => {
    expect(isValidCpfCnpj('529.982.247-25')).toBe(true);
  });

  it('recusa CPF com dígito verificador errado', () => {
    expect(isValidCpfCnpj('52998224726')).toBe(false);
  });

  it('recusa sequência de dígitos repetidos, que passa na conta mas não existe', () => {
    expect(isValidCpfCnpj('00000000000')).toBe(false);
    expect(isValidCpfCnpj('11111111111111')).toBe(false);
  });

  it('aceita o CNPJ alfanumérico, que vale desde 2026', () => {
    expect(isValidCpfCnpj('12ABC34501DE35')).toBe(true);
    expect(isValidCpfCnpj('12.ABC.345/01DE-35')).toBe(true);
  });

  it('recusa CNPJ alfanumérico com DV errado', () => {
    expect(isValidCpfCnpj('12ABC34501DE36')).toBe(false);
  });

  it('recusa tamanho que não é de CPF nem de CNPJ', () => {
    expect(isValidCpfCnpj('')).toBe(false);
    expect(isValidCpfCnpj('1122233300018')).toBe(false);
  });
});

describe('formatCpfCnpjDisplay (lib compartilhada)', () => {
  it('formata CNPJ', () => {
    expect(formatCpfCnpjDisplay('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('formata CPF', () => {
    expect(formatCpfCnpjDisplay('52998224725')).toBe('529.982.247-25');
  });

  it('formata CNPJ alfanumérico', () => {
    expect(formatCpfCnpjDisplay('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
  });

  it('mascara parcialmente enquanto o gestor digita', () => {
    expect(formatCpfCnpjDisplay('112223')).toBe('112.223');
  });
});

describe('maskCpfCnpj', () => {
  it('esconde o miolo do CNPJ no card do perfil', () => {
    expect(maskCpfCnpj('11222333000181')).toBe('11.•••.•••/0001-81');
  });

  it('esconde o miolo do CPF', () => {
    expect(maskCpfCnpj('52998224725')).toBe('•••.982.247-••');
  });

  it('esconde o miolo do CNPJ alfanumérico sem picotar as letras', () => {
    expect(maskCpfCnpj('12ABC34501DE35')).toBe('12.•••.•••/01DE-35');
  });

  it('não inventa máscara para valor vazio', () => {
    expect(maskCpfCnpj('')).toBe('');
  });
});

describe('isValidCep', () => {
  it('aceita 8 dígitos com ou sem hífen', () => {
    expect(isValidCep('88010000')).toBe(true);
    expect(isValidCep('88010-000')).toBe(true);
  });

  it('recusa quantidade diferente de 8 dígitos', () => {
    expect(isValidCep('8801000')).toBe(false);
    expect(isValidCep('')).toBe(false);
  });
});

describe('formatCep', () => {
  it('formata 8 dígitos', () => {
    expect(formatCep('88010000')).toBe('88010-000');
  });

  it('deixa passar o que ainda está incompleto', () => {
    expect(formatCep('8801')).toBe('8801');
  });
});

describe('composeArenaAddress', () => {
  it('monta a linha única que o app e o site já leem', () => {
    const line = composeArenaAddress(
      { cep: '88010000', logradouro: 'Rua das Gaivotas', numero: '120', complemento: '', bairro: 'Ingleses' },
      'Florianópolis',
      'SC',
    );
    expect(line).toBe('Rua das Gaivotas, 120 - Ingleses, Florianópolis - SC');
  });

  it('inclui o complemento quando existe', () => {
    const line = composeArenaAddress(
      { cep: '88010000', logradouro: 'Av. Beira Mar', numero: '45', complemento: 'Fundos', bairro: 'Centro' },
      'Florianópolis',
      'SC',
    );
    expect(line).toBe('Av. Beira Mar, 45, Fundos - Centro, Florianópolis - SC');
  });

  it('pula os pedaços que faltam em vez de deixar vírgula solta', () => {
    const line = composeArenaAddress(
      { cep: '', logradouro: 'Rua A', numero: '', complemento: '', bairro: '' },
      'Florianópolis',
      'SC',
    );
    expect(line).toBe('Rua A, Florianópolis - SC');
  });
});

describe('validateArenaCompany', () => {
  const valid = {
    cpfCnpj: '11222333000181',
    razaoSocial: 'Arena Ingleses Ltda',
    nomeFantasia: '',
    inscricaoMunicipal: '',
  };

  it('aceita CNPJ e razão social preenchidos', () => {
    expect(validateArenaCompany(valid)).toBeNull();
  });

  it('cobra o CNPJ', () => {
    expect(validateArenaCompany({ ...valid, cpfCnpj: '' })).toBe('Informe o CNPJ ou CPF da arena.');
  });

  it('cobra CNPJ válido', () => {
    expect(validateArenaCompany({ ...valid, cpfCnpj: '11222333000182' })).toBe('CNPJ ou CPF inválido.');
  });

  it('cobra a razão social', () => {
    expect(validateArenaCompany({ ...valid, razaoSocial: '  ' })).toBe('Informe a razão social.');
  });
});

describe('validateArenaAddress', () => {
  const parts = { cep: '88010000', logradouro: 'Rua das Gaivotas', numero: '120', complemento: '', bairro: 'Ingleses' };

  it('aceita endereço completo', () => {
    expect(validateArenaAddress(parts, 'Florianópolis', 'SC')).toBeNull();
  });

  it('cobra CEP válido', () => {
    expect(validateArenaAddress({ ...parts, cep: '8801' }, 'Florianópolis', 'SC')).toBe('CEP inválido.');
  });

  it('cobra o logradouro', () => {
    expect(validateArenaAddress({ ...parts, logradouro: '' }, 'Florianópolis', 'SC')).toBe('Informe a rua.');
  });

  it('cobra o número', () => {
    expect(validateArenaAddress({ ...parts, numero: '' }, 'Florianópolis', 'SC')).toBe('Informe o número.');
  });

  it('cobra o bairro', () => {
    expect(validateArenaAddress({ ...parts, bairro: '' }, 'Florianópolis', 'SC')).toBe('Informe o bairro.');
  });

  it('cobra cidade e UF, que saem do CEP mas podem vir em branco', () => {
    expect(validateArenaAddress(parts, '', 'SC')).toBe('Informe a cidade.');
    expect(validateArenaAddress(parts, 'Florianópolis', '')).toBe('Informe a UF.');
  });
});
