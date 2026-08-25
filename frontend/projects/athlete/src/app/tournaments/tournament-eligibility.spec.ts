import { normalizeAthleteGender, partnerMatchesRequiredGender } from './tournament-eligibility';

describe('normalizeAthleteGender', () => {
  it('normaliza os valores declarados', () => {
    expect(normalizeAthleteGender('Masculino')).toBe('M');
    expect(normalizeAthleteGender('feminino')).toBe('F');
    expect(normalizeAthleteGender('F')).toBe('F');
  });

  it('vazio e "Outro" não viram M/F', () => {
    expect(normalizeAthleteGender(null)).toBeNull();
    expect(normalizeAthleteGender('  ')).toBeNull();
    expect(normalizeAthleteGender('Outro')).toBeNull();
  });
});

describe('partnerMatchesRequiredGender', () => {
  it('categoria sem gênero fixo aceita todo mundo', () => {
    expect(partnerMatchesRequiredGender('Feminino', null)).toBeTrue();
    expect(partnerMatchesRequiredGender(null, null)).toBeTrue();
  });

  it('declarado incompatível sai (inclui "Outro")', () => {
    expect(partnerMatchesRequiredGender('Feminino', 'M')).toBeFalse();
    expect(partnerMatchesRequiredGender('Outro', 'M')).toBeFalse();
  });

  it('declarado compatível fica', () => {
    expect(partnerMatchesRequiredGender('Masculino', 'M')).toBeTrue();
    expect(partnerMatchesRequiredGender('feminino', 'F')).toBeTrue();
  });

  // Sem gênero no perfil fica na lista DE PROPÓSITO: sumir em silêncio deixava
  // o convidante achando que o parceiro não existe. A linha avisa a pendência
  // e o aceite valida no servidor.
  it('sem gênero (vazio) fica na lista', () => {
    expect(partnerMatchesRequiredGender(null, 'M')).toBeTrue();
    expect(partnerMatchesRequiredGender('', 'F')).toBeTrue();
    expect(partnerMatchesRequiredGender('   ', 'M')).toBeTrue();
  });
});
