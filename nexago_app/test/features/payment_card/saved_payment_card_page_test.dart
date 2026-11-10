import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/payment_card/application/payment_card_providers.dart';
import 'package:nexago_app/features/payment_card/domain/saved_payment_card.dart';
import 'package:nexago_app/features/payment_card/infrastructure/payment_card_repository.dart';
import 'package:nexago_app/features/payment_card/presentation/saved_payment_card_page.dart';

class _Repo extends PaymentCardRepository {
  _Repo(this.card);
  SavedPaymentCard? card;
  int removed = 0;

  @override
  Future<SavedPaymentCard?> mine() async => card;

  @override
  Future<int> remove() async {
    removed++;
    card = null;
    return 2;
  }
}

Future<void> _pump(WidgetTester tester, _Repo repo) async {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => const SavedPaymentCardPage()),
    GoRoute(
        path: AppRoutes.athleteBilling, builder: (_, __) => const Text('B')),
  ]);
  await tester.pumpWidget(ProviderScope(
    overrides: [paymentCardRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp.router(theme: AppTheme.dark, routerConfig: router),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('mostra o cartão e remove após confirmar', (tester) async {
    final repo = _Repo(const SavedPaymentCard(
        brand: 'VISA', last4: '4242', expiryMonth: 12, expiryYear: 2026));
    await _pump(tester, repo);
    expect(find.text('Visa final 4242 · validade 12/26'), findsOneWidget);

    await tester.tap(find.byKey(const Key('payment-card-remove')));
    await tester.pumpAndSettle();
    expect(
        find.text(
            'O débito automático de todos os seus planos será desligado.'),
        findsOneWidget);
    expect(repo.removed, 0);

    await tester.tap(find.byKey(const Key('payment-card-remove-confirm')));
    await tester.pumpAndSettle();
    expect(repo.removed, 1);
    expect(find.text('Nenhum cartão salvo.'), findsOneWidget);
  });

  testWidgets('sem cartão: convite para adicionar', (tester) async {
    await _pump(tester, _Repo(null));
    expect(find.text('Nenhum cartão salvo.'), findsOneWidget);
    expect(find.text('Adicionar cartão'), findsOneWidget);
  });
}
