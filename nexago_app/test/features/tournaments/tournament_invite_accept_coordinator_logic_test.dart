import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_logic.dart';

void main() {
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
