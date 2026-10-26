import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_logic.dart';
import 'package:nexago_app/features/organizer/domain/category_ops/category_ops_models.dart';
import 'package:nexago_app/features/organizer/domain/organizer_wallet_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_app_payout.dart';
import 'package:nexago_app/features/organizer/domain/tournament_ops/tournament_ops_providers.dart';
import 'package:nexago_app/features/organizer/domain/tournament_staff/my_tournament_staff_providers.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/tabs/organizer_category_payments_tab.dart';
import 'package:nexago_app/features/organizer/presentation/category_ops/tabs/organizer_tournament_financial_tab.dart';

/// O repasse líquido e o selo da taxa das telas de operação do torneio saem
/// do extrato do caixa — com a taxa da cascata do torneio e o "Quem paga" de
/// cada pagamento —, não de um percentual fixo. Duas inscrições de R$ 100 com
/// a taxa padrão de 8%, nos três modos.
const _tid = 't1';
const _cid = 'masc-a';
const _key = OrganizerCategoryKey(tournamentId: _tid, categoryId: _cid);

List<TournamentLedgerCredit> _credits({
  required int organizerFeeCents,
  required int athleteFeeCents,
  List<String> registrationIds = const ['r1', 'r2'],
}) {
  return [
    for (final id in registrationIds)
      TournamentLedgerCredit(
        registrationId: id,
        grossCents: 10000,
        netCents: 10000 - organizerFeeCents,
        organizerFeeCents: organizerFeeCents,
        athleteFeeCents: athleteFeeCents,
      ),
  ];
}

final _organizerPays = _credits(organizerFeeCents: 800, athleteFeeCents: 0);
final _athletePays = _credits(organizerFeeCents: 0, athleteFeeCents: 800);
final _split = _credits(organizerFeeCents: 400, athleteFeeCents: 400);

OrganizerTournamentSummary _summary({int viaAppCents = 20000}) {
  return OrganizerTournamentSummary(
    tournamentId: _tid,
    name: 'Etapa Aurora',
    enrolledCount: 2,
    paymentsBreakdown: OrganizerPaymentsBreakdown(viaAppCents: viaAppCents),
  );
}

Future<void> abrirFinanceiro(
  WidgetTester tester, {
  required AsyncValue<List<TournamentLedgerCredit>> ledger,
  int viaAppCents = 20000,
  double aLiberar = 0,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(
        body: OrganizerTournamentFinancialTab(
          summary: _summary(viaAppCents: viaAppCents),
          categories: const [],
          ledgerCredits: ledger,
          awaitingSettlementReais: aLiberar,
        ),
      ),
    ),
  );
  await tester.pump();
}

OrganizerCategoryTeamRow _team(String registrationId) {
  return OrganizerCategoryTeamRow(
    registrationId: registrationId,
    teamId: 'team-$registrationId',
    player1: OrganizerCategoryPlayerInfo(uid: 'a-$registrationId', name: 'Ana'),
    player2: OrganizerCategoryPlayerInfo(uid: 'b-$registrationId', name: 'Bia'),
    status: OrganizerTeamRegistrationStatus.confirmed,
    paidAmountCents: 10000,
    expectedAmountCents: 10000,
    paymentMethod: 'pix',
  );
}

Future<void> abrirPagamentos(
  WidgetTester tester, {
  required Stream<List<TournamentLedgerCredit>> Function() ledger,
}) async {
  final teams = [_team('r1'), _team('r2')];
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        organizerSeesTournamentMoneyProvider(_tid).overrideWithValue(true),
        organizerTournamentLedgerCreditsProvider(
          _tid,
        ).overrideWith((ref) => ledger()),
        organizerCategoryPaymentsProvider(_key).overrideWithValue(
          buildPaymentsBreakdown(teams: teams, expectedPerTeamCents: 10000),
        ),
        organizerCategoryVisibleTeamsProvider(
          _key,
        ).overrideWithValue(AsyncValue.data(teams)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const Scaffold(
          body: OrganizerCategoryPaymentsTab(
            tournamentId: _tid,
            categoryId: _cid,
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('Financeiro do torneio', () {
    testWidgets('organizador paga: 8% do extrato, não o 6% fixo', (
      tester,
    ) async {
      await abrirFinanceiro(tester, ledger: AsyncValue.data(_organizerPays));

      expect(find.text('8% TAXA'), findsOneWidget);
      expect(find.text('6% TAXA'), findsNothing);
      expect(find.text(r'Repasse líquido R$ 184'), findsOneWidget);
      // "Taxa nexaGO" do cartão de cima: a parte do organizador.
      expect(find.text(r'R$ 16'), findsOneWidget);
    });

    testWidgets('atleta paga: repasse é o preço inteiro', (tester) async {
      await abrirFinanceiro(tester, ledger: AsyncValue.data(_athletePays));

      expect(find.text('TAXA PAGA PELO ATLETA'), findsOneWidget);
      expect(find.text(r'Repasse líquido R$ 200'), findsOneWidget);
      expect(
        find.text('A taxa nexaGO foi paga pelo atleta, por cima da inscrição'),
        findsOneWidget,
      );
      // Do organizador não saiu nada.
      expect(find.text(r'R$ 0'), findsOneWidget);
    });

    testWidgets('dividido: o organizador paga a metade dele', (tester) async {
      await abrirFinanceiro(tester, ledger: AsyncValue.data(_split));

      expect(find.text('TAXA DIVIDIDA'), findsOneWidget);
      expect(find.text(r'Repasse líquido R$ 192'), findsOneWidget);
      expect(
        find.text(r'Taxa nexaGO dividida: R$ 8 sua, R$ 8 do atleta'),
        findsOneWidget,
      );
    });

    testWidgets('a liberar soma no repasse; o resto aparece pelo pago', (
      tester,
    ) async {
      await abrirFinanceiro(
        tester,
        ledger: AsyncValue.data(_organizerPays),
        viaAppCents: 33000,
        aLiberar: 115.23,
      );

      expect(find.text(r'Repasse líquido R$ 299.23'), findsOneWidget);
      expect(
        find.text(r'R$ 184 no caixa · R$ 115.23 a liberar'),
        findsOneWidget,
      );
      expect(
        find.text(
          r'R$ 130 pagos pelo app ainda não caíram no caixa, '
          'cartões a liberar incluídos',
        ),
        findsOneWidget,
      );
    });

    testWidgets('extrato ainda não lido: nenhum número chutado', (
      tester,
    ) async {
      await abrirFinanceiro(
        tester,
        ledger: const AsyncValue<List<TournamentLedgerCredit>>.loading(),
      );

      expect(
        find.text('Repasse líquido: lendo o extrato do caixa…'),
        findsOneWidget,
      );
      expect(find.text('TAXA NEXAGO'), findsOneWidget);
      expect(find.text('—'), findsOneWidget);
    });

    testWidgets('extrato com erro diz que não leu', (tester) async {
      await abrirFinanceiro(
        tester,
        ledger: AsyncValue<List<TournamentLedgerCredit>>.error(
          Exception('permission-denied'),
          StackTrace.empty,
        ),
      );

      expect(
        find.text(
          'Repasse líquido indisponível: não deu para ler o extrato do caixa',
        ),
        findsOneWidget,
      );
      expect(find.text('—'), findsOneWidget);
    });
  });

  group('Pagamentos da categoria', () {
    testWidgets('organizador paga', (tester) async {
      await abrirPagamentos(tester, ledger: () => Stream.value(_organizerPays));

      expect(find.text(r'Repasse líquido · R$ 184'), findsOneWidget);
      expect(find.text('Já no caixa · 8% de taxa nexaGO'), findsOneWidget);
      expect(find.textContaining('6%'), findsNothing);
    });

    testWidgets('atleta paga', (tester) async {
      await abrirPagamentos(tester, ledger: () => Stream.value(_athletePays));

      expect(find.text(r'Repasse líquido · R$ 200'), findsOneWidget);
      expect(
        find.text('Já no caixa · taxa nexaGO paga pelo atleta'),
        findsOneWidget,
      );
    });

    testWidgets('dividido', (tester) async {
      await abrirPagamentos(tester, ledger: () => Stream.value(_split));

      expect(find.text(r'Repasse líquido · R$ 192'), findsOneWidget);
      expect(
        find.text('Já no caixa · taxa nexaGO dividida com o atleta'),
        findsOneWidget,
      );
    });

    testWidgets('só os créditos da categoria e o que falta cair no caixa', (
      tester,
    ) async {
      // r2 ainda não foi creditada; o crédito de outra categoria não conta.
      await abrirPagamentos(
        tester,
        ledger: () => Stream.value(
          _credits(
            organizerFeeCents: 800,
            athleteFeeCents: 0,
            registrationIds: const ['r1', 'outra-categoria'],
          ),
        ),
      );

      expect(find.text(r'Repasse líquido · R$ 92'), findsOneWidget);
      expect(
        find.textContaining(r'R$ 100 pagos pelo app ainda não caíram no caixa'),
        findsOneWidget,
      );
    });

    testWidgets('extrato com erro não vira repasse zero', (tester) async {
      await abrirPagamentos(
        tester,
        ledger: () => Stream.error(Exception('permission-denied')),
      );

      expect(find.text('Repasse líquido indisponível'), findsOneWidget);
      expect(
        find.text('Não deu para ler o extrato do caixa agora.'),
        findsOneWidget,
      );
      expect(find.textContaining(r'Repasse líquido · R$'), findsNothing);
    });
  });
}
