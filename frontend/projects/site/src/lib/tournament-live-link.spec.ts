import { liveUrlFor } from './tournament-live-link';
import type { TournamentListingStatus } from './firestore/types';

describe('liveUrlFor', () => {
  it('aponta pra página ao vivo quando as inscrições fecharam', () => {
    expect(liveUrlFor('closed', 'abc123')).toBe('https://organizador.nexago.com.br/t/abc123');
  });

  it('aponta pra página ao vivo quando o torneio está acontecendo', () => {
    expect(liveUrlFor('live', 'abc123')).toBe('https://organizador.nexago.com.br/t/abc123');
  });

  it('não linka nos demais status', () => {
    const rest: TournamentListingStatus[] = ['open', 'almost_full', 'ended', 'cancelled'];
    for (const status of rest) {
      expect(liveUrlFor(status, 'abc123')).toBeNull();
    }
  });
});
