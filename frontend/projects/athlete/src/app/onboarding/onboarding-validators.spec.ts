import {
  MIN_AGE_YEARS,
  MIN_NATIVE_BIRTH_DATE_ISO,
  ageOn,
  birthDateBrToIso,
  birthDateIsoToBr,
  formatBirthDateMask,
  maxNativeBirthDateIso,
  normalizeBrMobile,
  validateBirthDate,
  validatePhone,
} from './onboarding-validators';

describe('validateBirthDate', () => {
  const HOJE = new Date(2026, 6, 23); // 23/07/2026

  it('aceita uma data válida de adulto', () => {
    expect(validateBirthDate('15/03/1990', HOJE)).toBeNull();
  });

  it('exige preenchimento', () => {
    expect(validateBirthDate('', HOJE)).toBe('Obrigatório');
    expect(validateBirthDate('   ', HOJE)).toBe('Obrigatório');
  });

  it('rejeita formato fora de dd/mm/aaaa', () => {
    expect(validateBirthDate('1990-03-15', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
    expect(validateBirthDate('15/3/1990', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
    expect(validateBirthDate('abc', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
  });

  it('rejeita dia que não existe no calendário', () => {
    expect(validateBirthDate('31/02/1990', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
    expect(validateBirthDate('31/04/1990', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
    expect(validateBirthDate('30/02/2000', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
  });

  it('aceita 29/02 em ano bissexto e rejeita fora dele', () => {
    expect(validateBirthDate('29/02/2000', HOJE)).toBeNull();
    expect(validateBirthDate('29/02/2001', HOJE)).toBe('Data inválida (dd/mm/aaaa)');
  });

  it('rejeita data no futuro', () => {
    expect(validateBirthDate('24/07/2026', HOJE)).toBe('A data não pode ser no futuro');
    expect(validateBirthDate('01/01/2099', HOJE)).toBe('A data não pode ser no futuro');
  });

  it('rejeita ano anterior a 1900', () => {
    expect(validateBirthDate('01/01/1899', HOJE)).toBe('Ano deve ser 1900 ou posterior');
  });

  it(`exige idade mínima de ${MIN_AGE_YEARS} anos`, () => {
    // Faz 13 exatamente hoje → passa.
    expect(validateBirthDate('23/07/2013', HOJE)).toBeNull();
    // Faz 13 amanhã → ainda tem 12.
    expect(validateBirthDate('24/07/2013', HOJE)).toBe('É preciso ter pelo menos 13 anos');
    expect(validateBirthDate('01/01/2020', HOJE)).toBe('É preciso ter pelo menos 13 anos');
  });
});

describe('birthDateBrToIso', () => {
  it('converte para o formato gravado no Firestore', () => {
    expect(birthDateBrToIso('15/03/1990')).toBe('1990-03-15');
  });

  it('devolve null para data impossível', () => {
    expect(birthDateBrToIso('31/02/1990')).toBeNull();
  });
});

describe('ageOn', () => {
  it('não conta o ano quando o aniversário ainda não chegou', () => {
    expect(ageOn(new Date(2000, 11, 31), new Date(2026, 6, 23))).toBe(25);
    expect(ageOn(new Date(2000, 0, 1), new Date(2026, 6, 23))).toBe(26);
  });
});

describe('validatePhone', () => {
  it('aceita celular com máscara, sem máscara e com +55', () => {
    expect(validatePhone('(11) 98765-4321')).toBeNull();
    expect(validatePhone('11987654321')).toBeNull();
    expect(validatePhone('+55 (11) 98765-4321')).toBeNull();
  });

  it('exige preenchimento', () => {
    expect(validatePhone('')).toBe('Obrigatório');
  });

  it('rejeita telefone fixo com mensagem específica', () => {
    expect(validatePhone('(11) 3456-7890')).toBe(
      'Informe um celular (com o 9), não um telefone fixo',
    );
    expect(validatePhone('+55 11 3456-7890')).toBe(
      'Informe um celular (com o 9), não um telefone fixo',
    );
  });

  it('rejeita quantidade de dígitos incompatível', () => {
    expect(validatePhone('1198765')).toBe('Informe DDD + celular com 9 dígitos');
    expect(validatePhone('119876543210')).toBe('Informe DDD + celular com 9 dígitos');
  });

  it('rejeita DDD que não existe', () => {
    expect(validatePhone('(10) 98765-4321')).toBe('DDD inválido');
    expect(validatePhone('(23) 98765-4321')).toBe('DDD inválido');
    expect(validatePhone('(00) 98765-4321')).toBe('DDD inválido');
  });

  it('rejeita celular que não começa com 9 após o DDD', () => {
    expect(validatePhone('(11) 88765-4321')).toBe('Celular deve começar com 9 depois do DDD');
  });

  it('rejeita sequência de dígitos repetidos', () => {
    expect(validatePhone('(11) 99999-9999')).toBe('Número inválido');
  });
});

describe('normalizeBrMobile', () => {
  it('remove máscara e código do país', () => {
    expect(normalizeBrMobile('+55 (11) 98765-4321')).toBe('11987654321');
    expect(normalizeBrMobile('(11) 98765-4321')).toBe('11987654321');
  });

  it('devolve null quando não chega a 11 dígitos', () => {
    expect(normalizeBrMobile('1134567890')).toBeNull();
  });
});

describe('formatBirthDateMask', () => {
  it('insere as barras nas posições 2 e 4 conforme os dígitos chegam', () => {
    expect(formatBirthDateMask('1')).toBe('1');
    expect(formatBirthDateMask('15')).toBe('15');
    expect(formatBirthDateMask('150')).toBe('15/0');
    expect(formatBirthDateMask('1503')).toBe('15/03');
    expect(formatBirthDateMask('15031990')).toBe('15/03/1990');
  });

  it('ignora tudo que não é dígito', () => {
    expect(formatBirthDateMask('15/03/1990')).toBe('15/03/1990');
    expect(formatBirthDateMask('ab15cd03ef1990')).toBe('15/03/1990');
  });

  it('limita a 8 dígitos (dd/mm/aaaa)', () => {
    expect(formatBirthDateMask('150319909999')).toBe('15/03/1990');
  });

  it('devolve string vazia para entrada vazia', () => {
    expect(formatBirthDateMask('')).toBe('');
  });
});

describe('birthDateIsoToBr', () => {
  it('converte o valor do <input type="date"> nativo pro formato do campo mascarado', () => {
    expect(birthDateIsoToBr('1990-03-15')).toBe('15/03/1990');
  });
});

describe('maxNativeBirthDateIso', () => {
  const HOJE = new Date(2026, 6, 23); // 23/07/2026

  it(`retorna hoje menos ${MIN_AGE_YEARS} anos, em ISO`, () => {
    expect(maxNativeBirthDateIso(HOJE)).toBe('2013-07-23');
  });
});

describe('MIN_NATIVE_BIRTH_DATE_ISO', () => {
  it('é 1º de janeiro do ano mínimo aceito', () => {
    expect(MIN_NATIVE_BIRTH_DATE_ISO).toBe('1900-01-01');
  });
});
