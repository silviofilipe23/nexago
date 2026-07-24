import { formatBrPhoneMask, isValidPhoneNumber, phoneLinkMethod, toE164BR } from './phone-verification.util';

describe('isValidPhoneNumber', () => {
  it('aceita 11 dígitos (celular com 9)', () => {
    expect(isValidPhoneNumber('(62) 99999-9999')).toBe(true);
  });

  it('aceita com prefixo internacional +55', () => {
    expect(isValidPhoneNumber('+55 62 99999-9999')).toBe(true);
  });

  it('rejeita número curto demais', () => {
    expect(isValidPhoneNumber('123')).toBe(false);
  });
});

describe('toE164BR', () => {
  it('converte número nacional de 11 dígitos para E.164', () => {
    expect(toE164BR('(62) 99999-9999')).toBe('+5562999999999');
  });

  it('converte número já com DDI 55 para E.164', () => {
    expect(toE164BR('+55 62 99999-9999')).toBe('+5562999999999');
  });

  it('converte número nacional de 10 dígitos (fixo) para E.164', () => {
    expect(toE164BR('(62) 3299-9999')).toBe('+556232999999');
  });

  it('retorna null para número inválido', () => {
    expect(toE164BR('123')).toBeNull();
  });
});

describe('phoneLinkMethod', () => {
  it('usa link quando a conta ainda não tem credencial de telefone', () => {
    expect(phoneLinkMethod([])).toBe('link');
    expect(phoneLinkMethod(['password', 'google.com'])).toBe('link');
  });

  it('usa update quando a conta já tem credencial de telefone vinculada', () => {
    expect(phoneLinkMethod(['password', 'phone'])).toBe('update');
  });
});

describe('formatBrPhoneMask', () => {
  it('monta a máscara de celular (00) 00000-0000 progressivamente, enquanto digita', () => {
    expect(formatBrPhoneMask('1')).toBe('(1');
    expect(formatBrPhoneMask('11')).toBe('(11) ');
    expect(formatBrPhoneMask('119')).toBe('(11) 9');
    expect(formatBrPhoneMask('1198765')).toBe('(11) 98765');
    expect(formatBrPhoneMask('11987654')).toBe('(11) 98765-4');
    expect(formatBrPhoneMask('11987654321')).toBe('(11) 98765-4321');
  });

  it('monta a máscara de fixo (00) 0000-0000 quando não começa com 9 depois do DDD', () => {
    expect(formatBrPhoneMask('1134567890')).toBe('(11) 3456-7890');
  });

  it('ignora tudo que não é dígito e limita a 11 dígitos', () => {
    expect(formatBrPhoneMask('(11) 98765-4321')).toBe('(11) 98765-4321');
    expect(formatBrPhoneMask('11987654321999')).toBe('(11) 98765-4321');
  });

  it('devolve string vazia para entrada vazia', () => {
    expect(formatBrPhoneMask('')).toBe('');
  });
});
