import { inviteLink } from './coach-staff.service';

describe('inviteLink', () => {
  it('monta o caminho do convite a partir da origem', () => {
    expect(inviteLink('https://treinador.nexago.app', 'abc123')).toBe('https://treinador.nexago.app/convite-equipe/abc123');
  });

  it('não duplica a barra quando a origem termina em /', () => {
    expect(inviteLink('https://treinador.nexago.app/', 'abc123')).toBe('https://treinador.nexago.app/convite-equipe/abc123');
  });
});
