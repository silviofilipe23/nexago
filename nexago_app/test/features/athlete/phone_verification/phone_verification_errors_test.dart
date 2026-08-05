import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/phone_verification/domain/phone_verification_errors.dart';

void main() {
  group('phoneVerificationErrorMessage', () {
    test('translates the codes the SMS flow actually hits', () {
      expect(
        phoneVerificationErrorMessage(
          FirebaseAuthException(code: 'invalid-verification-code'),
        ),
        'Código incorreto. Confira os 6 dígitos e tente de novo.',
      );
      expect(
        phoneVerificationErrorMessage(
          FirebaseAuthException(code: 'quota-exceeded'),
        ),
        'Limite de envios de SMS atingido. Tente novamente mais tarde.',
      );
    });

    test('app verification failures share one message', () {
      // iOS sem APNs (ou no Simulador, que nunca recebe push) e Android sem
      // SHA do Play Integrity caem aqui.
      const expected = 'Não foi possível validar o app para envio de SMS. '
          'Tente novamente ou fale com o suporte.';
      for (final code in [
        'missing-client-identifier',
        'app-not-verified',
        'app-not-authorized',
      ]) {
        expect(
          phoneVerificationErrorMessage(FirebaseAuthException(code: code)),
          expected,
          reason: code,
        );
      }
    });

    test('never leaks the raw SDK text for unmapped codes', () {
      // Era exatamente este vazamento: o usuário via em tela
      // "The reCAPTCHA SDK is not linked to your app. See https://..."
      final message = phoneVerificationErrorMessage(
        FirebaseAuthException(
          code: 'internal-error',
          message: 'The reCAPTCHA SDK is not linked to your app. '
              'See https://cloud.google.com/recaptcha-enterprise/docs',
        ),
      );

      expect(message, 'Não foi possível concluir a verificação. Tente novamente.');
      expect(message, isNot(contains('reCAPTCHA')));
      expect(message, isNot(contains('http')));
    });

    test('keeps the Cloud Function message, which is already in Portuguese', () {
      expect(
        phoneVerificationErrorMessage(
          FirebaseFunctionsException(
            code: 'failed-precondition',
            message: 'Nenhum telefone verificado encontrado para esta conta.',
          ),
        ),
        'Nenhum telefone verificado encontrado para esta conta.',
      );
    });

    test('replaces infrastructure text from internal function errors', () {
      final message = phoneVerificationErrorMessage(
        FirebaseFunctionsException(code: 'internal', message: 'INTERNAL'),
      );

      expect(message, 'Não foi possível confirmar o telefone. Tente novamente.');
      expect(message, isNot(contains('INTERNAL')));
    });

    test('falls back for anything that is not a Firebase error', () {
      expect(
        phoneVerificationErrorMessage(StateError('boom')),
        'Não foi possível concluir a verificação. Tente novamente.',
      );
    });
  });
}
