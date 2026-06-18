import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/auth/domain/post_login_bootstrap.dart';

void main() {
  group('runPostLoginBootstrap timing', () {
    test('minimum duration is a brief brand flash, not a wait', () {
      // O piso existe só pra evitar flicker quando os dados voltam quase
      // instantâneos — não deve voltar a ser uma espera artificial longa.
      expect(
        kPostLoginBootstrapMinDuration.inMilliseconds,
        lessThanOrEqualTo(1000),
      );
    });

    test('bootstrap timeout stays well above the minimum floor', () {
      expect(
        kPostLoginBootstrapTimeout,
        greaterThan(kPostLoginBootstrapMinDuration),
      );
    });
  });

  group('SessionBootstrapState', () {
    test('pending and complete are distinct', () {
      expect(SessionBootstrapState.pending, isNot(SessionBootstrapState.complete));
    });
  });

  group('shouldBootstrapForAuthTransition', () {
    test('cold start (first auth resolution) never triggers the full screen', () {
      // Sessão restaurada no cold start.
      expect(
        shouldBootstrapForAuthTransition(
          sawFirstAuthState: false,
          hadUser: false,
          hasUser: true,
        ),
        isFalse,
      );
      // Sem sessão no cold start.
      expect(
        shouldBootstrapForAuthTransition(
          sawFirstAuthState: false,
          hadUser: false,
          hasUser: false,
        ),
        isFalse,
      );
    });

    test('login while the app is running triggers the bootstrap screen', () {
      expect(
        shouldBootstrapForAuthTransition(
          sawFirstAuthState: true,
          hadUser: false,
          hasUser: true,
        ),
        isTrue,
      );
    });

    test('logout triggers pending so the next login shows the screen', () {
      expect(
        shouldBootstrapForAuthTransition(
          sawFirstAuthState: true,
          hadUser: true,
          hasUser: false,
        ),
        isTrue,
      );
    });

    test('a user→user re-emission does not re-trigger the screen', () {
      expect(
        shouldBootstrapForAuthTransition(
          sawFirstAuthState: true,
          hadUser: true,
          hasUser: true,
        ),
        isFalse,
      );
    });
  });
}
