import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/cashback/application/cashback_providers.dart';
import 'package:nexago_app/features/cashback/domain/cashback_models.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_copy.dart';
import 'package:nexago_app/features/cashback/presentation/cashback_page.dart';

const ligado = CashbackConfig(
  enabled: true,
  ratePercent: 2,
  maxShareOfFee: 0.5,
  minCashCents: 500,
  expiryMonths: 6,
  expiryWarningDays: 15,
);

Future<void> abrirPagina(
  WidgetTester tester, {
  CashbackConfig config = ligado,
  CashbackWallet wallet = CashbackWallet.empty,
  List<CashbackLedgerEntry> ledger = const [],
}) async {
  // Tela alta: a ListView monta preguiçosamente e o extrato fica abaixo da
  // dobra num 800x600.
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        cashbackConfigProvider.overrideWith((ref) => Stream.value(config)),
        cashbackWalletProvider.overrideWith((ref) => Stream.value(wallet)),
        cashbackLedgerProvider.overrideWith((ref) => Stream.value(ledger)),
      ],
      child: MaterialApp(theme: AppTheme.dark, home: const CashbackPage()),
    ),
  );
  // Sem pumpAndSettle: carregando, o extrato mostra um indicador infinito.
  await tester.pump(Duration.zero);
  await tester.pump();
}

void main() {
  testWidgets('herói: disponível em destaque, pendente, vencimento e reservado',
      (tester) async {
    await abrirPagina(
      tester,
      wallet: CashbackWallet(
        availableCents: 1240,
        pendingCents: 480,
        heldCents: 300,
        nextExpiryAt: DateTime(2027, 3, 12),
        nextExpiryCents: 320,
      ),
    );

    expect(find.text(CashbackCopy.availableLabel), findsOneWidget);
    expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
    expect(find.text(CashbackCopy.pendingLine(480)), findsOneWidget);
    expect(
      find.text(CashbackCopy.expiringLine(320, DateTime(2027, 3, 12))),
      findsOneWidget,
    );
    expect(find.text(CashbackCopy.heldLine(300)), findsOneWidget);
  });

  testWidgets('sem reserva nem vencimento: as duas linhas somem',
      (tester) async {
    await abrirPagina(
      tester,
      wallet: const CashbackWallet(availableCents: 1240),
    );

    expect(find.text(CashbackCopy.pendingLine(0)), findsOneWidget);
    expect(find.textContaining('Reservado'), findsNothing);
    expect(find.textContaining('vencem em'), findsNothing);
  });

  testWidgets('"Como funciona" mostra as 5 linhas com os valores da config',
      (tester) async {
    const config = CashbackConfig(
      enabled: true,
      ratePercent: 3,
      maxShareOfFee: 0.5,
      minCashCents: 750,
      expiryMonths: 12,
      expiryWarningDays: 15,
    );
    await abrirPagina(tester, config: config);

    expect(find.text(CashbackCopy.howItWorksTitle), findsOneWidget);
    for (final line in CashbackCopy.howItWorks(config)) {
      expect(find.text(line), findsOneWidget);
    }
  });

  testWidgets('extrato agrupado por mês, título por tipo e valor com sinal',
      (tester) async {
    final ledger = [
      CashbackLedgerEntry(
        id: 'e1',
        type: CashbackLedgerType.release,
        amountCents: 240,
        label: 'Reserva · Arena Sol · 12/10',
        createdAt: DateTime(2026, 10, 13, 10),
      ),
      CashbackLedgerEntry(
        id: 'e2',
        type: CashbackLedgerType.redeem,
        amountCents: 1500,
        label: 'Inscrição · Copa Verão',
        createdAt: DateTime(2026, 10, 5, 18),
      ),
      CashbackLedgerEntry(
        id: 'e3',
        type: CashbackLedgerType.earn,
        amountCents: 240,
        label: 'Reserva · Arena Sol · 12/10',
        createdAt: DateTime(2026, 9, 28, 9),
      ),
    ];
    await abrirPagina(tester, ledger: ledger);

    expect(find.text('outubro de 2026'), findsOneWidget);
    expect(find.text('setembro de 2026'), findsOneWidget);
    // O mês mais recente vem antes.
    expect(
      tester.getTopLeft(find.text('outubro de 2026')).dy,
      lessThan(tester.getTopLeft(find.text('setembro de 2026')).dy),
    );
    expect(find.text('Cashback liberado'), findsOneWidget);
    expect(find.text('Usado no pagamento'), findsOneWidget);
    expect(find.text('Cashback ganho'), findsOneWidget);
    expect(find.text('Reserva · Arena Sol · 12/10'), findsNWidgets(2));
    expect(find.text('Inscrição · Copa Verão'), findsOneWidget);
    expect(find.text(CashbackCopy.signedAmount(ledger[0])), findsNWidgets(2));
    expect(find.text(CashbackCopy.signedAmount(ledger[1])), findsOneWidget);
    expect(find.text(CashbackCopy.ledgerMeta(ledger[2])), findsOneWidget);
    expect(find.text(CashbackCopy.ledgerMeta(ledger[0])), findsOneWidget);
  });

  testWidgets('sem lançamentos: estado vazio com a taxa da config',
      (tester) async {
    await abrirPagina(tester);

    expect(find.text(CashbackCopy.emptyLedger(ligado)), findsOneWidget);
  });

  testWidgets('recurso desligado: a página segue mostrando o saldo já ganho',
      (tester) async {
    await abrirPagina(
      tester,
      config: CashbackConfig.fallback,
      wallet: const CashbackWallet(availableCents: 1240),
    );

    expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
    expect(find.text(CashbackCopy.howItWorksTitle), findsOneWidget);
  });

  // Achado da revisão da Tarefa 2: os streams do repositório não têm
  // `.handleError` — um token revogado em sessão pode virar `AsyncError` na
  // carteira ou no extrato. A tela não pode quebrar nem fingir que não há
  // cashback (estado vazio) quando na verdade é um erro de leitura.
  group('erro ao carregar (token revogado em sessão, etc.)', () {
    testWidgets(
        'carteira com erro: mostra estado de erro amigável com retry, '
        'não quebra nem finge saldo vazio', (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            cashbackConfigProvider.overrideWith((ref) => Stream.value(ligado)),
            cashbackWalletProvider.overrideWith(
              (ref) => Stream<CashbackWallet>.error(
                StateError('permission-denied'),
              ),
            ),
            cashbackLedgerProvider.overrideWith((ref) => Stream.value(const [])),
          ],
          child: MaterialApp(theme: AppTheme.dark, home: const CashbackPage()),
        ),
      );
      // Dois pumps com duração explícita: o primeiro sai do loading (que usa
      // FadeSlideIn) e o segundo flusha o FadeSlideIn do AppErrorView que
      // entra no lugar — sem isso o timer da entrada fica pendente.
      await tester.pump(Duration.zero);
      await tester.pump(Duration.zero);

      // Nem o herói (saldo), nem o estado vazio do extrato: isto seria
      // fingir que o atleta não tem cashback.
      expect(find.text(formatBRLFromCents(0)), findsNothing);
      expect(find.text(CashbackCopy.emptyLedger(ligado)), findsNothing);
      // Um retry está disponível — o erro não é um beco sem saída.
      expect(find.byIcon(Icons.refresh_rounded), findsOneWidget);
    });

    testWidgets(
        'extrato com erro: mostra aviso de erro, mantém o resto da página '
        'e não finge "sem lançamentos"', (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            cashbackConfigProvider.overrideWith((ref) => Stream.value(ligado)),
            cashbackWalletProvider.overrideWith(
              (ref) => Stream.value(
                const CashbackWallet(availableCents: 1240),
              ),
            ),
            cashbackLedgerProvider.overrideWith(
              (ref) => Stream<List<CashbackLedgerEntry>>.error(
                StateError('permission-denied'),
              ),
            ),
          ],
          child: MaterialApp(theme: AppTheme.dark, home: const CashbackPage()),
        ),
      );
      await tester.pump(Duration.zero);
      await tester.pump();

      // O saldo (que é de outro provider) segue de pé.
      expect(find.text(formatBRLFromCents(1240)), findsOneWidget);
      expect(find.text(CashbackCopy.ledgerError), findsOneWidget);
      expect(find.text(CashbackCopy.emptyLedger(ligado)), findsNothing);
    });
  });
}
