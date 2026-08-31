import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_substitution_logic.dart';

void main() {
  group('substitutionReplaceableUids', () {
    test('dupla: membro pode trocar qualquer vaga', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['a', 'b'],
          uid: 'a',
          teamSize: null,
          captainUid: null,
          partnerPending: false,
          bracketPublished: false,
        ),
        ['a', 'b'],
      );
    });

    test('chave publicada ou elenco incompleto: nada trocável', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['a', 'b'],
          uid: 'a',
          teamSize: null,
          captainUid: null,
          partnerPending: false,
          bracketPublished: true,
        ),
        isEmpty,
      );
      expect(
        substitutionReplaceableUids(
          participantUids: ['a'],
          uid: 'a',
          teamSize: null,
          captainUid: null,
          partnerPending: true,
          bracketPublished: false,
        ),
        isEmpty,
      );
    });

    test('quem não é da inscrição não troca ninguém', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['a', 'b'],
          uid: 'x',
          teamSize: null,
          captainUid: null,
          partnerPending: false,
          bracketPublished: false,
        ),
        isEmpty,
      );
    });

    test('equipe: só o capitão, e nunca a própria vaga', () {
      expect(
        substitutionReplaceableUids(
          participantUids: ['cap', 'm1', 'm2'],
          uid: 'm1',
          teamSize: 3,
          captainUid: 'cap',
          partnerPending: false,
          bracketPublished: false,
        ),
        isEmpty,
      );
      expect(
        substitutionReplaceableUids(
          participantUids: ['cap', 'm1', 'm2'],
          uid: 'cap',
          teamSize: 3,
          captainUid: 'cap',
          partnerPending: false,
          bracketPublished: false,
        ),
        ['m1', 'm2'],
      );
    });
  });
}
