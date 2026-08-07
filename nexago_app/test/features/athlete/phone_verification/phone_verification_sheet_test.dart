import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/phone_verification/data/phone_verification_service.dart';
import 'package:nexago_app/features/athlete/phone_verification/presentation/phone_verification_sheet.dart';

/// Dublê do fluxo de SMS. `implements` (e não `extends`) para não passar pelo
/// construtor real, que resolveria `FirebaseAuth.instance` sem Firebase.
class _FakeService implements PhoneVerificationService {
  _FakeService({this.sendError, this.confirmError, this.autoVerify = false});

  final Object? sendError;
  final Object? confirmError;
  final bool autoVerify;

  int sendCalls = 0;
  int? lastResendToken;
  String? lastPhoneRaw;
  String? lastCode;

  static const verifiedNumber = '+5562999999999';

  @override
  Future<void> sendCode({
    required String phoneNumberRaw,
    required void Function(PhoneVerificationSession session) onCodeSent,
    required void Function(Object error) onFailed,
    void Function(String phoneNumber)? onAutoVerified,
    int? resendToken,
  }) async {
    sendCalls++;
    lastPhoneRaw = phoneNumberRaw;
    lastResendToken = resendToken;

    if (sendError != null) {
      onFailed(sendError!);
      return;
    }
    if (autoVerify) {
      onAutoVerified?.call(verifiedNumber);
      return;
    }
    onCodeSent(
      PhoneVerificationSession(
        verificationId: 'verification-id',
        resendToken: 42,
      ),
    );
  }

  @override
  Future<String> confirmCode({
    required PhoneVerificationSession session,
    required String smsCode,
  }) async {
    lastCode = smsCode;
    if (confirmError != null) throw confirmError!;
    return verifiedNumber;
  }

  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  /// Monta um app mínimo com um botão que abre o sheet e guarda o resultado.
  Future<List<String?>> pumpSheet(
    WidgetTester tester,
    PhoneVerificationService service,
  ) async {
    final results = <String?>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          phoneVerificationServiceProvider.overrideWithValue(service),
        ],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () async {
                  results.add(
                    await showPhoneVerificationSheet(context: context),
                  );
                },
                child: const Text('abrir'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    return results;
  }

  testWidgets('verifies a number through the two steps', (tester) async {
    final service = _FakeService();
    final results = await pumpSheet(tester, service);

    expect(find.text('Verificar Número'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '(62) 99999-9999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();

    expect(service.sendCalls, 1);
    // Primeiro envio não é reenvio: vai sem token.
    expect(service.lastResendToken, isNull);
    expect(find.text('Digite o código'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
    await tester.pumpAndSettle();

    expect(service.lastCode, '123456');
    expect(results, [_FakeService.verifiedNumber]);
    expect(find.text('Digite o código'), findsNothing);
  });

  testWidgets('android auto retrieval closes the sheet without typing', (
    tester,
  ) async {
    final results = await pumpSheet(tester, _FakeService(autoVerify: true));

    await tester.enterText(find.byType(TextField), '(62) 99999-9999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();

    expect(results, [_FakeService.verifiedNumber]);
  });

  testWidgets('shows a phone-specific message for a wrong code', (
    tester,
  ) async {
    final service = _FakeService(
      confirmError: FirebaseAuthException(code: 'invalid-verification-code'),
    );
    await pumpSheet(tester, service);

    await tester.enterText(find.byType(TextField), '(62) 99999-9999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '000000');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Confirmar'));
    await tester.pumpAndSettle();

    // E não "Credenciais inválidas. Verifique e-mail e senha.", que era o que
    // o mapeador devolvia para este código antes da verificação por SMS.
    expect(
      find.text('Código incorreto. Confira os 6 dígitos e tente de novo.'),
      findsOneWidget,
    );
    // Continua no passo do código: dá para corrigir sem pedir SMS de novo.
    expect(find.text('Digite o código'), findsOneWidget);
  });

  testWidgets('resend stays blocked during the cooldown', (tester) async {
    final service = _FakeService();
    await pumpSheet(tester, service);

    await tester.enterText(find.byType(TextField), '(62) 99999-9999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();

    expect(find.text('Reenviar em 30s'), findsOneWidget);
    await tester.tap(find.text('Reenviar em 30s'));
    await tester.pump();
    expect(service.sendCalls, 1);

    // Passado o cooldown, o reenvio leva o token da sessão — é reenvio de
    // verdade, não uma verificação nova.
    await tester.pump(const Duration(seconds: 30));
    expect(find.text('Reenviar código'), findsOneWidget);
    await tester.tap(find.text('Reenviar código'));
    await tester.pumpAndSettle();

    expect(service.sendCalls, 2);
    expect(service.lastResendToken, 42);
  });

  testWidgets('changing the number clears the resend cooldown', (tester) async {
    final service = _FakeService();
    await pumpSheet(tester, service);

    await tester.enterText(find.byType(TextField), '(62) 99999-9999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();
    expect(find.text('Reenviar em 30s'), findsOneWidget);

    await tester.tap(find.text('Trocar número'));
    await tester.pumpAndSettle();

    // O cooldown vale para o número anterior — outro número é envio novo, e
    // o botão precisa funcionar de imediato.
    await tester.enterText(find.byType(TextField), '(62) 98888-8888');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();

    expect(service.sendCalls, 2);
    expect(service.lastPhoneRaw, '(62) 98888-8888');
    expect(find.text('Digite o código'), findsOneWidget);
  });

  testWidgets('surfaces send failures without leaving the phone step', (
    tester,
  ) async {
    await pumpSheet(
      tester,
      _FakeService(sendError: FirebaseAuthException(code: 'quota-exceeded')),
    );

    await tester.enterText(find.byType(TextField), '(62) 99999-9999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar código'));
    await tester.pumpAndSettle();

    expect(
      find.text('Limite de envios de SMS atingido. Tente novamente mais tarde.'),
      findsOneWidget,
    );
    expect(find.text('Verificar Número'), findsOneWidget);
  });
}
