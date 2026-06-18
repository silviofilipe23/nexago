import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/firebase_auth_error_mapper.dart';

void main() {
  group('classifyFirebaseAuthError', () {
    test('email-related codes target the email field', () {
      for (final code in ['invalid-email', 'user-not-found']) {
        final r = classifyFirebaseAuthError(FirebaseAuthException(code: code));
        expect(r.field, AuthErrorField.email, reason: code);
        expect(r.message, isNotEmpty);
      }
    });

    test('credential codes target the password field', () {
      for (final code in ['wrong-password', 'invalid-credential']) {
        final r = classifyFirebaseAuthError(FirebaseAuthException(code: code));
        expect(r.field, AuthErrorField.password, reason: code);
      }
    });

    test('systemic codes fall back to form-level', () {
      for (final code in [
        'too-many-requests',
        'network-request-failed',
        'user-disabled',
        'operation-not-allowed',
      ]) {
        final r = classifyFirebaseAuthError(FirebaseAuthException(code: code));
        expect(r.field, AuthErrorField.form, reason: code);
      }
    });

    test('carries the PT-BR mapped message', () {
      final r = classifyFirebaseAuthError(
        FirebaseAuthException(code: 'wrong-password'),
      );
      expect(r.message, 'Senha incorreta.');
    });
  });
}
