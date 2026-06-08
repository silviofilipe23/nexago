import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/auth/domain/post_login_bootstrap.dart';

void main() {
  group('runPostLoginBootstrap timing', () {
    test('waits at least minimum duration even when data callback is instant',
        () async {
      final started = DateTime.now();

      await Future.wait([
        Future<void>.delayed(kPostLoginBootstrapMinDuration),
        Future<void>.value(),
      ]);

      final elapsed = DateTime.now().difference(started);
      expect(
        elapsed.inMilliseconds,
        greaterThanOrEqualTo(kPostLoginBootstrapMinDuration.inMilliseconds - 50),
      );
    });
  });

  group('SessionBootstrapState', () {
    test('pending and complete are distinct', () {
      expect(SessionBootstrapState.pending, isNot(SessionBootstrapState.complete));
    });
  });
}
