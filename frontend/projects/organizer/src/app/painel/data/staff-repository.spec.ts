import { roleFromRaw } from './staff-repository';

describe('roleFromRaw', () => {
  it('administrador do evento faz round-trip', () => {
    // O defeito que esta guarda consertou: sem a linha do `eventAdmin`, um
    // "Administrador" voltava como "Gestor" a cada recarga da aba Equipe — e a tela
    // "funcionava" até alguém dar refresh.
    expect(roleFromRaw('eventAdmin')).toBe('eventAdmin');
  });

  it('papel desconhecido cai em gestor', () => {
    expect(roleFromRaw('viewer')).toBe('manager');
  });
});
