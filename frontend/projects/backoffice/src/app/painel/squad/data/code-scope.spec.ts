import { CODE_SCOPE_OPTIONS, codeScopeLabel, codeScopeOf, codeScopePayload, intersectScopes } from './code-scope';

const scope = (registration: boolean, booking: boolean, club: boolean, store: boolean) => ({ registration, booking, club, store });

describe('escopo do código do embaixador (codeScope)', () => {
  it('lista as quatro áreas na ordem da tela', () => {
    expect(CODE_SCOPE_OPTIONS.map((o) => o.kind)).toEqual(['registration', 'booking', 'club', 'store']);
  });

  it('lê o campo do contrato: ausente = null; tipo ausente ou inválido conta como ligado (Loja inclusive)', () => {
    expect(codeScopeOf(undefined)).toBeNull();
    expect(codeScopeOf('x')).toBeNull();
    expect(codeScopeOf({ registration: true, booking: false })).toEqual(scope(true, false, true, true));
    expect(codeScopeOf({ store: false })).toEqual(scope(true, true, true, false));
  });

  it('payload do convite: tudo ligado não manda o campo; nada ligado é inválido', () => {
    expect(codeScopePayload(scope(true, true, true, true))).toBeNull();
    expect(codeScopePayload(scope(true, false, false, false))).toEqual(scope(true, false, false, false));
    expect(codeScopePayload(scope(false, false, false, false))).toBe('invalid');
  });

  it('rótulo só quando restringe; a Loja mantém a maiúscula no meio da lista', () => {
    expect(codeScopeLabel(null)).toBeNull();
    expect(codeScopeLabel(scope(true, true, true, true))).toBeNull();
    expect(codeScopeLabel(scope(true, false, false, false))).toBe('Inscrições em torneios');
    expect(codeScopeLabel(scope(true, false, true, false))).toBe('Inscrições em torneios e clubinho');
    expect(codeScopeLabel(scope(true, false, false, true))).toBe('Inscrições em torneios e Loja');
    expect(codeScopeLabel(scope(false, false, false, false))).toBe('Nenhuma compra');
  });

  it('contrato e nível se somam: vale só onde todos deixam', () => {
    expect(intersectScopes(scope(true, true, false, true), scope(true, false, true, false))).toEqual(scope(true, false, false, false));
    expect(intersectScopes()).toEqual(scope(true, true, true, true));
  });
});
