import { isValidPhoneNumber, phoneLinkMethod, toE164BR } from './phone-verification.util';

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
