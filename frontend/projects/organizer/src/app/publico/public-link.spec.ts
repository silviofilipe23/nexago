import { publicTournamentUrl } from './public-link';

describe('publicTournamentUrl', () => {
  it('monta o link de acompanhamento a partir da origem', () => {
    expect(publicTournamentUrl('https://organizador.nexago.app', 'abc123')).toBe(
      'https://organizador.nexago.app/t/abc123',
    );
  });

  it('não duplica a barra quando a origem já termina em /', () => {
    expect(publicTournamentUrl('https://organizador.nexago.app/', 'abc123')).toBe(
      'https://organizador.nexago.app/t/abc123',
    );
  });
});
