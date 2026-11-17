import { CODE_SCOPE_OPTIONS, codeScopeLabel, codeScopeOf, codeScopePayload } from './code-scope';

describe('escopo do código do embaixador (codeScope)', () => {
  it('lista os três tipos na ordem da tela', () => {
    expect(CODE_SCOPE_OPTIONS.map((o) => o.kind)).toEqual(['registration', 'booking', 'club']);
  });

  it('lê o campo do contrato: ausente = null; tipo inválido conta como ligado', () => {
    expect(codeScopeOf(undefined)).toBeNull();
    expect(codeScopeOf('x')).toBeNull();
    expect(codeScopeOf({ registration: true, booking: false })).toEqual({ registration: true, booking: false, club: true });
  });

  it('payload do convite: tudo ligado não manda o campo; nada ligado é inválido', () => {
    expect(codeScopePayload({ registration: true, booking: true, club: true })).toBeNull();
    expect(codeScopePayload({ registration: true, booking: false, club: false })).toEqual({
      registration: true,
      booking: false,
      club: false,
    });
    expect(codeScopePayload({ registration: false, booking: false, club: false })).toBe('invalid');
  });

  it('rótulo só quando restringe', () => {
    expect(codeScopeLabel(null)).toBeNull();
    expect(codeScopeLabel({ registration: true, booking: true, club: true })).toBeNull();
    expect(codeScopeLabel({ registration: true, booking: false, club: false })).toBe('Inscrições em torneios');
    expect(codeScopeLabel({ registration: true, booking: false, club: true })).toBe('Inscrições em torneios e clubinho');
    expect(codeScopeLabel({ registration: false, booking: false, club: false })).toBe('Nenhuma compra');
  });
});
