import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/data/tournament_registration_service.dart';

/// O aceite do termo fica gravado na inscrição (`lgpdAcceptedUids`). Sem ler
/// esse campo, o app não sabia distinguir "já aceitei" de "inscrição antiga sem
/// o meu aceite" — e o portal reabre o checkbox justamente nesse segundo caso,
/// para o aceite viajar junto do convite.
void main() {
  group('TournamentRegistrationSnapshot.lgpdConsentMissingFor', () {
    test('lê os uids que aceitaram do doc', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'lgpdAcceptedUids': ['a', 'b'],
      });

      expect(snap.lgpdAcceptedUids, ['a', 'b']);
      expect(snap.lgpdConsentMissingFor('a'), isFalse);
      expect(snap.lgpdConsentMissingFor('b'), isFalse);
      expect(snap.lgpdConsentMissingFor('c'), isTrue);
    });

    test('inscrição antiga sem o campo conta como aceite pendente', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'participantUids': ['a'],
      });

      expect(snap.lgpdAcceptedUids, isEmpty);
      expect(snap.lgpdConsentMissingFor('a'), isTrue);
    });

    // Sem uid não há a quem atribuir pendência: cobrar o aceite de "ninguém"
    // travaria o convite de quem ainda está carregando a sessão.
    test('sem uid não acusa pendência', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'lgpdAcceptedUids': ['a'],
      });

      expect(snap.lgpdConsentMissingFor(null), isFalse);
      expect(snap.lgpdConsentMissingFor('  '), isFalse);
    });

    test('lixo no campo não quebra a leitura', () {
      final snap = TournamentRegistrationSnapshot.fromDoc('reg-1', {
        'lgpdAcceptedUids': ['a', 42, '', '  b  '],
      });

      expect(snap.lgpdAcceptedUids, ['a', 'b']);
    });
  });
}
