import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_share_phrases.dart';

void main() {
  group('pickTournamentRegistrationSharePhrase', () {
    test('returns a phrase from the list', () {
      final phrase = pickTournamentRegistrationSharePhrase(42);
      expect(tournamentRegistrationSharePhrases, contains(phrase));
    });

    test('same seed yields same phrase', () {
      expect(
        pickTournamentRegistrationSharePhrase(99),
        pickTournamentRegistrationSharePhrase(99),
      );
    });

    test('different seeds can yield different phrases', () {
      final phrases = <TournamentRegistrationSharePhrase>{
        for (var i = 0; i < 50; i++) pickTournamentRegistrationSharePhrase(i),
      };
      expect(phrases.length, greaterThan(1));
    });
  });
}
