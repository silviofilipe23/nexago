import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

void main() {
  _copyTests();
  group('registrationSuccessNavigationAction', () {
    test('ignores when not paid', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: false,
          wasPaid: false,
          hasPreviousSnapshot: false,
          seenUnpaid: true,
          alreadyHandled: false,
        ),
        RegistrationSuccessNavigationAction.ignore,
      );
    });

    test('ignores when already handled', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: true,
          seenUnpaid: true,
          alreadyHandled: true,
        ),
        RegistrationSuccessNavigationAction.ignore,
      );
    });

    test('ignores when was already paid', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: true,
          hasPreviousSnapshot: true,
          seenUnpaid: true,
          alreadyHandled: false,
        ),
        RegistrationSuccessNavigationAction.ignore,
      );
    });

    test('marks handled only on cold start with first paid snapshot', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: false,
          seenUnpaid: false,
          alreadyHandled: false,
        ),
        RegistrationSuccessNavigationAction.markHandledOnly,
      );
    });

    test('marks handled only when prior async state had no snapshot data', () {
      // AsyncLoading → AsyncData(paid): hasPreviousSnapshot is false.
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: false,
          seenUnpaid: false,
          alreadyHandled: false,
        ),
        RegistrationSuccessNavigationAction.markHandledOnly,
      );
    });

    test('navigates on unpaid to paid transition', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: true,
          seenUnpaid: false,
          alreadyHandled: false,
        ),
        RegistrationSuccessNavigationAction.navigate,
      );
    });

    test('navigates when unpaid was seen before re-subscribe', () {
      expect(
        registrationSuccessNavigationAction(
          isPaid: true,
          wasPaid: false,
          hasPreviousSnapshot: false,
          seenUnpaid: true,
          alreadyHandled: false,
        ),
        RegistrationSuccessNavigationAction.navigate,
      );
    });
  });
}

void _copyTests() {
  group('partnerAcceptedFeedbackCopy', () {
    test('dupla aceita fecha a inscrição e leva ao pagamento', () {
      final copy = partnerAcceptedFeedbackCopy(
        firstName: 'Bruno',
        isTeamInvite: false,
        rosterComplete: true,
      );
      expect(copy.title, 'Bruno aceitou!');
      expect(copy.description, 'Conclua o pagamento da inscrição.');
      expect(copy.primaryLabel, 'Pagar');
      expect(copy.goesToPayment, isTrue);
    });

    test('equipe com elenco aberto NÃO pede pagamento', () {
      final copy = partnerAcceptedFeedbackCopy(
        firstName: 'Bruno',
        isTeamInvite: true,
        rosterComplete: false,
        rosterCount: 2,
        teamSize: 4,
      );
      expect(copy.title, 'Bruno entrou na equipe');
      expect(copy.description, 'Elenco 2/4. Convide os atletas que faltam.');
      expect(copy.primaryLabel, 'Convidar');
      expect(
        copy.goesToPayment,
        isFalse,
        reason: 'com 2/4 não existe conta a pagar — o passo é convidar',
      );
    });

    test('equipe que fecha o elenco volta a pedir pagamento', () {
      final copy = partnerAcceptedFeedbackCopy(
        firstName: 'Carla',
        isTeamInvite: true,
        rosterComplete: true,
        rosterCount: 4,
        teamSize: 4,
      );
      expect(copy.title, 'Carla aceitou!');
      expect(copy.goesToPayment, isTrue);
    });

    test('elenco sem contagem conhecida omite o progresso', () {
      final copy = partnerAcceptedFeedbackCopy(
        firstName: 'Diego',
        isTeamInvite: true,
        rosterComplete: false,
      );
      expect(copy.description, 'Elenco. Convide os atletas que faltam.');
    });
  });
}
