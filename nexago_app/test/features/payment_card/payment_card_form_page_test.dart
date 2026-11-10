import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/errors/friendly_error_message.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/payment_card/application/payment_card_providers.dart';
import 'package:nexago_app/features/payment_card/domain/saved_payment_card.dart';
import 'package:nexago_app/features/payment_card/infrastructure/payment_card_repository.dart';
import 'package:nexago_app/features/payment_card/presentation/payment_card_form_page.dart';

class _FakeRepo extends PaymentCardRepository {
  _FakeRepo({required this.failWith});
  final List<Object> failWith;
  final List<PaymentCardInput> saved = [];
  final List<String?> cpfs = [];
  int calls = 0;

  @override
  Future<SavedPaymentCard> save(PaymentCardInput input,
      {String? cpfCnpj}) async {
    final i = calls++;
    if (i < failWith.length) throw failWith[i];
    saved.add(input);
    cpfs.add(cpfCnpj);
    return SavedPaymentCard(
        brand: 'VISA',
        last4: '1111',
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear);
  }
}

Future<SavedPaymentCard?> _open(WidgetTester tester, _FakeRepo repo) async {
  SavedPaymentCard? result;
  final router = GoRouter(routes: [
    GoRoute(
      path: '/',
      builder: (context, _) => Scaffold(
        body: TextButton(
          onPressed: () async =>
              result = await context.push<SavedPaymentCard>('/novo'),
          child: const Text('abrir'),
        ),
      ),
    ),
    GoRoute(
      path: '/novo',
      builder: (_, __) =>
          PaymentCardFormPage(now: () => DateTime(2026, 11, 10)),
    ),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [paymentCardRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
  ));
  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return result;
}

Future<void> _fill(WidgetTester tester) async {
  await tester.enterText(
      find.byKey(const Key('card-number')), '4111111111111111');
  await tester.enterText(find.byKey(const Key('card-holder')), 'Fulano de Tal');
  await tester.enterText(find.byKey(const Key('card-expiry')), '1226');
  await tester.enterText(find.byKey(const Key('card-ccv')), '123');
  await tester.enterText(find.byKey(const Key('card-cep')), '74000000');
  await tester.enterText(find.byKey(const Key('card-address-number')), '10');
}

Future<void> _submit(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('payment-card-save')));
  await tester.tap(find.byKey(const Key('payment-card-save')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('salva com dados válidos e volta com o cartão', (tester) async {
    final repo = _FakeRepo(failWith: const []);
    await _open(tester, repo);
    await _fill(tester);
    await _submit(tester);

    expect(repo.saved, hasLength(1));
    final map = repo.saved.single.toMap();
    expect(map['number'], '4111111111111111');
    expect(map['expiryMonth'], 12);
    expect(map['expiryYear'], 2026);
    expect(repo.cpfs.single, isNull);
    // Voltou para a tela de origem.
    expect(find.text('abrir'), findsOneWidget);
  });

  testWidgets('dado inválido não chama o servidor', (tester) async {
    final repo = _FakeRepo(failWith: const []);
    await _open(tester, repo);
    await _fill(tester);
    await tester.enterText(
        find.byKey(const Key('card-number')), '4111111111111112');
    await _submit(tester);
    expect(repo.calls, 0);
    expect(find.text('Número do cartão inválido.'), findsOneWidget);
  });

  testWidgets('erro do servidor aparece pelo friendlyErrorMessage',
      (tester) async {
    final err = PaymentCardException('Confira os dados do cartão.');
    final repo = _FakeRepo(failWith: [err]);
    await _open(tester, repo);
    await _fill(tester);
    await _submit(tester);
    expect(
      find.text(friendlyErrorMessage(err,
          action: 'Não foi possível salvar o cartão')),
      findsOneWidget,
    );
  });

  testWidgets('servidor pede CPF: mostra o campo e reenvia com cpfCnpj',
      (tester) async {
    final repo = _FakeRepo(
        failWith: [PaymentCardException('Informe seu CPF para pagar online.')]);
    await _open(tester, repo);
    await _fill(tester);
    await _submit(tester);
    expect(find.text('CPF DO TITULAR'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, '52998224725');
    await _submit(tester);
    expect(repo.cpfs.single, '52998224725');
  });

  testWidgets('campos sensíveis sem sugestão nem autocorreção', (tester) async {
    await _open(tester, _FakeRepo(failWith: const []));
    TextField field(String k) => tester.widget<TextField>(find.byKey(Key(k)));
    final number = field('card-number');
    final ccv = field('card-ccv');
    expect(number.enableSuggestions, isFalse);
    expect(number.autocorrect, isFalse);
    expect(number.autofillHints, [AutofillHints.creditCardNumber]);
    expect(ccv.enableSuggestions, isFalse);
    expect(ccv.autocorrect, isFalse);
    expect(ccv.autofillHints, [AutofillHints.creditCardSecurityCode]);
  });
}
