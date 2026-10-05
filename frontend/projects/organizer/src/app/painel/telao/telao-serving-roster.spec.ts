import { rawMatchFromDoc } from '../data/matches-repository';
import { buildTeamDisplay } from './telao-data.service';
import { servingPlayerFirstName } from './telao-selectors';

/** Telão com equipe (trio/quarteto/quinteto — multiesporte): a mesa grava a posição 1–5 de quem
 *  saca; o telão precisa do elenco inteiro na ordem dos slots para dar o nome. */
describe('telão · sacador de equipe', () => {
  const profiles = new Map([
    ['u1', { name: 'Ana Souza', photoUrl: null }],
    ['u2', { name: 'Bia Lima', photoUrl: null }],
    ['u3', { name: 'Caio Reis', photoUrl: null }],
  ]);

  it('elenco inteiro em playerNames, na ordem de memberUids', () => {
    const trio = buildTeamDisplay(
      { teamName: 'Os Três', player1Id: 'u1', player2Id: 'u2', memberUids: ['u1', 'u2', 'u3'], isLookingForPartner: false },
      profiles,
    );
    expect(trio?.playerNames).toEqual(['Ana Souza', 'Bia Lima', 'Caio Reis']);
    const dupla = buildTeamDisplay(
      { teamName: null, player1Id: 'u1', player2Id: 'u2', memberUids: [], isLookingForPartner: false },
      profiles,
    );
    expect(dupla?.playerNames).toEqual(['Ana Souza', 'Bia Lima']);
  });

  it('posição 3 do doc chega ao telão e vira o primeiro nome', () => {
    expect(rawMatchFromDoc('m1', { servingPlayerSlot: 3 }).servingPlayerSlot).toBe(3);
    expect(rawMatchFromDoc('m1', { servingPlayerSlot: 6 }).servingPlayerSlot).toBe(0);
    expect(servingPlayerFirstName(['Ana Souza', 'Bia Lima', 'Caio Reis'], 3)).toBe('Caio');
    expect(servingPlayerFirstName(['Ana Souza', 'Bia Lima'], 3)).toBeNull();
    expect(servingPlayerFirstName(['Ana Souza', ''], 2)).toBeNull();
    expect(servingPlayerFirstName(['Ana Souza'], 0)).toBeNull();
  });
});
