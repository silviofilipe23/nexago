import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team_roster_logic.dart';

/// Elenco de categoria de EQUIPE (trio/quarteto/quinteto) na tela de inscrição.
void main() {
  group('buildTeamRoster', () {
    test('marca capitão e o próprio atleta, na ordem do elenco', () {
      final roster = buildTeamRoster(
        participantUids: const ['cap', 'eu', 'outro'],
        captainUid: 'cap',
        myUid: 'eu',
        nameByUid: const {'cap': 'Bia Souza', 'outro': 'Léo Dias'},
        photoByUid: const {'cap': 'http://x/bia.jpg'},
      );

      expect(roster.map((m) => m.uid), ['cap', 'eu', 'outro']);
      expect(roster[0].isCaptain, isTrue);
      expect(roster[0].name, 'Bia Souza');
      expect(roster[0].photoUrl, 'http://x/bia.jpg');
      expect(roster[1].isMe, isTrue);
      expect(roster[2].isCaptain, isFalse);
    });

    // Perfil público pode não ter carregado (ou nem existir). Uma linha com
    // "Você"/"Atleta" é melhor que um elenco menor do que a equipe realmente é.
    test('sem perfil, a linha ainda aparece', () {
      final roster = buildTeamRoster(
        participantUids: const ['cap', 'eu'],
        captainUid: 'cap',
        myUid: 'eu',
        nameByUid: const {},
        photoByUid: const {},
      );

      expect(roster.map((m) => m.name), ['Atleta', 'Você']);
    });

    // Sem `captainUid` no doc, o primeiro participante é quem criou a equipe.
    test('sem captainUid, o primeiro participante é o capitão', () {
      final roster = buildTeamRoster(
        participantUids: const ['cap', 'eu'],
        captainUid: null,
        myUid: 'eu',
        nameByUid: const {},
        photoByUid: const {},
      );

      expect(roster[0].isCaptain, isTrue);
      expect(roster[1].isCaptain, isFalse);
    });
  });

  group('remainingTeamInviteSlots', () {
    test('desconta elenco e convites pendentes', () {
      expect(
        remainingTeamInviteSlots(
          teamSize: 4,
          rosterCount: 2,
          pendingInviteCount: 1,
        ),
        1,
      );
    });

    test('nunca fica negativo', () {
      expect(
        remainingTeamInviteSlots(
          teamSize: 3,
          rosterCount: 3,
          pendingInviteCount: 2,
        ),
        0,
      );
    });

    test('categoria que não é de equipe não tem vagas a convidar aqui', () {
      expect(
        remainingTeamInviteSlots(
          teamSize: null,
          rosterCount: 1,
          pendingInviteCount: 0,
        ),
        0,
      );
    });
  });

  group('canLeaveTeamRegistration', () {
    test('integrante sem cota paga pode sair', () {
      expect(
        canLeaveTeamRegistration(
          teamSize: 4,
          captainUid: 'cap',
          myUid: 'eu',
          isPaid: false,
          sharePaidUids: const [],
        ),
        isTrue,
      );
    });

    // O capitão desfaz a equipe por outro caminho (cancelar a inscrição): sair
    // deixaria a equipe sem dono.
    test('capitão não sai pela porta do integrante', () {
      expect(
        canLeaveTeamRegistration(
          teamSize: 4,
          captainUid: 'eu',
          myUid: 'eu',
          isPaid: false,
          sharePaidUids: const [],
        ),
        isFalse,
      );
    });

    test('quem já pagou a própria cota não sai', () {
      expect(
        canLeaveTeamRegistration(
          teamSize: 4,
          captainUid: 'cap',
          myUid: 'eu',
          isPaid: false,
          sharePaidUids: const ['eu'],
        ),
        isFalse,
      );
    });

    test('inscrição quitada não sai', () {
      expect(
        canLeaveTeamRegistration(
          teamSize: 4,
          captainUid: 'cap',
          myUid: 'eu',
          isPaid: true,
          sharePaidUids: const [],
        ),
        isFalse,
      );
    });

    test('dupla não usa esta saída', () {
      expect(
        canLeaveTeamRegistration(
          teamSize: null,
          captainUid: 'cap',
          myUid: 'eu',
          isPaid: false,
          sharePaidUids: const [],
        ),
        isFalse,
      );
    });
  });
}
