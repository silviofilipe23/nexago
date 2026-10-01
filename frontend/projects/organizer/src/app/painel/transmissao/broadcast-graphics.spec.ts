import type { TournamentMatch } from '../data/matches-repository';
import type { OrganizerTournament } from '../data/tournament.model';
import { BROADCAST_GRAPHICS, broadcastGroupsFor, tournamentHasKoc } from './broadcast-graphics';
import { BROADCAST_GRAPHIC_IDS } from '../data/broadcast-control';

function torneio(formats: string[]): OrganizerTournament {
  return { categories: formats.map((f, i) => ({ id: `c${i}`, name: `C${i}`, bracketFormat: f })) } as unknown as OrganizerTournament;
}

describe('broadcast-graphics', () => {
  it('todo gráfico do controle tem linha no registro', () => {
    expect(BROADCAST_GRAPHICS.map((g) => g.id).sort()).toEqual([...BROADCAST_GRAPHIC_IDS].sort());
  });

  it('reconhece torneio com categoria KOTC', () => {
    expect(tournamentHasKoc(torneio(['groups_knockout', 'king_of_court']), [])).toBeTrue();
    expect(tournamentHasKoc(torneio(['single_elimination']), [])).toBeFalse();
  });

  it('rodada KOTC nas partidas basta — categoria pode estar gravada com outro formato (Queen & King no dev)', () => {
    const rodada = { matchType: 'koc_round' } as TournamentMatch;
    expect(tournamentHasKoc(torneio(['groups_knockout']), [rodada])).toBeTrue();
    expect(broadcastGroupsFor(torneio(['groups_knockout']), [rodada]).map((g) => g.grupo)).toContain('koc');
  });

  it('sem KOTC, o grupo King of the Court some', () => {
    expect(broadcastGroupsFor(torneio(['single_elimination']), []).map((g) => g.grupo)).toEqual(['partida', 'encerramento', 'patrocinio']);
  });

  it('com KOTC, os quatro grupos na ordem da tela', () => {
    expect(broadcastGroupsFor(torneio(['king_of_court']), []).map((g) => g.label)).toEqual([
      'Partida',
      'King of the Court',
      'Encerramento',
      'Patrocínio',
    ]);
  });
});
