import { buildBookingTeam, viewerIsBookingOwner, type BookingTeamInput } from './booking-team';

function input(overrides: Partial<BookingTeamInput> = {}): BookingTeamInput {
  return {
    ownerUid: 'dono',
    viewerUid: 'dono',
    viewerName: 'Bruno Lima',
    ownerName: null,
    ownerAvatarUrl: null,
    ownerPaid: true,
    participants: [],
    legacyGuests: [],
    canRemove: true,
    ...overrides,
  };
}

const ana = { uid: 'ana', name: 'Ana Souza', avatarUrl: 'https://x/ana.jpg', via: 'link' as const };
const caio = { uid: 'caio', name: 'Caio Reis', avatarUrl: null, via: 'direct' as const };

describe('buildBookingTeam', () => {
  it('dono vê a si como "Você" e pode tirar quem entrou pelo convite', () => {
    const team = buildBookingTeam(input({ participants: [ana] }));
    expect(team.map((m) => m.displayName)).toEqual(['Você', 'Ana Souza', 'Vaga aberta', 'Vaga aberta']);
    expect(team[0]).toEqual(jasmine.objectContaining({ isOrganizer: true, isViewer: true, initials: 'BL' }));
    expect(team[1]).toEqual(jasmine.objectContaining({ removable: true, avatarUrl: 'https://x/ana.jpg' }));
    expect(team[2]!.subtitle).toBe('Convide alguém da sua rede');
  });

  it('convidado vê o dono pelo nome e a si mesmo como "Você", sem tirar ninguém', () => {
    const team = buildBookingTeam(
      input({ viewerUid: 'ana', viewerName: 'Ana Souza', ownerName: 'Bruno Lima', participants: [ana, caio], canRemove: false }),
    );
    expect(team.map((m) => m.displayName)).toEqual(['Bruno Lima', 'Você', 'Caio Reis', 'Vaga aberta']);
    expect(team[0]).toEqual(jasmine.objectContaining({ isOrganizer: true, isViewer: false, initials: 'BL' }));
    expect(team[1]!.isViewer).toBeTrue();
    expect(team.some((m) => m.removable)).toBeFalse();
    expect(team[3]!.subtitle).toBe('Aguardando jogadores');
  });

  it('sem o perfil do dono, o convidado vê "Quem reservou"', () => {
    const team = buildBookingTeam(input({ viewerUid: 'ana', participants: [ana], canRemove: false }));
    expect(team[0]!.displayName).toBe('Quem reservou');
  });

  it('jogo encerrado: o dono não tira mais ninguém', () => {
    const team = buildBookingTeam(input({ participants: [ana], canRemove: false }));
    expect(team[1]!.removable).toBeFalse();
  });

  it('legado entra depois dos participantes, sem repetir e sem botão de tirar', () => {
    const team = buildBookingTeam(
      input({
        participants: [ana],
        legacyGuests: [
          { uid: 'ana', name: 'Ana (convite antigo)' },
          { uid: 'velho', name: 'Convidado 1.0.1' },
          { uid: null, name: 'Só o nome' },
        ],
      }),
    );
    expect(team.map((m) => m.displayName)).toEqual(['Você', 'Ana Souza', 'Convidado 1.0.1', 'Só o nome']);
    expect(team.filter((m) => m.removable).map((m) => m.uid)).toEqual(['ana']);
  });

  it('o próprio dono na lista de participantes não duplica a linha', () => {
    const team = buildBookingTeam(input({ participants: [{ ...ana, uid: 'dono' }] }));
    expect(team.filter((m) => !m.isEmptySlot).length).toBe(1);
  });
});

describe('viewerIsBookingOwner', () => {
  it('sem dono gravado ou sem sessão, a tela segue como dono (comportamento antigo)', () => {
    expect(viewerIsBookingOwner(null, 'ana')).toBeTrue();
    expect(viewerIsBookingOwner('dono', null)).toBeTrue();
    expect(viewerIsBookingOwner('dono', 'dono')).toBeTrue();
    expect(viewerIsBookingOwner('dono', 'ana')).toBeFalse();
  });
});
