import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_providers.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_logic.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_models.dart';
import 'package:nexago_app/features/friendly_match/presentation/widgets/friendly_match_card.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  final scheduledAt = DateTime.now().add(const Duration(days: 2));

  FriendlyMatch buildMatch({
    FriendlyMatchStatus status = FriendlyMatchStatus.sent,
    FriendlyMatchLocation location =
        const FriendlyMatchLocation(arenaName: 'Arena Beira-Mar'),
    int? scoreAtSend,
    String sport = 'VOLEI_PRAIA',
  }) {
    return FriendlyMatch(
      id: 'fm1',
      fromUid: 'uid_ana',
      fromName: 'Ana Lima',
      toUid: 'uid_bia',
      toName: 'Bia Souza',
      sport: sport,
      objective: FriendlyMatchObjective.friendly,
      status: status,
      scheduledAt: scheduledAt,
      location: location,
      scoreAtSend: scoreAtSend,
    );
  }

  Widget wrap(Widget child) {
    return ProviderScope(
      overrides: [
        // Flag do sistema de elos desligada nos testes do card.
        sandRankEnabledProvider.overrideWith((ref) => Stream.value(false)),
      ],
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: child),
      ),
    );
  }

  testWidgets('remetente vê o nome do destinatário', (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () {},
    )));

    expect(find.text('Bia Souza'), findsOneWidget);
    expect(find.text('Ana Lima'), findsNothing);
    expect(find.text('BS'), findsOneWidget);
  });

  testWidgets('destinatário vê o nome do remetente', (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_bia',
      onTap: () {},
    )));

    expect(find.text('Ana Lima'), findsOneWidget);
    expect(find.text('Bia Souza'), findsNothing);
    expect(find.text('AL'), findsOneWidget);
  });

  testWidgets('mostra resumo com objetivo, esporte, horário e local',
      (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () {},
    )));

    expect(find.textContaining('Amistoso'), findsOneWidget);
    expect(find.textContaining('Vôlei de praia'), findsOneWidget);
    expect(find.text('Arena Beira-Mar'), findsOneWidget);
  });

  testWidgets('sem arena nem texto livre cai em "Local a combinar"',
      (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(location: const FriendlyMatchLocation()),
      currentUid: 'uid_ana',
      onTap: () {},
    )));

    expect(find.text('Local a combinar'), findsOneWidget);
  });

  testWidgets('badge de compatibilidade aparece quando há scoreAtSend',
      (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(scoreAtSend: 87),
      currentUid: 'uid_ana',
      onTap: () {},
    )));

    expect(find.text('87 %'), findsOneWidget);
    expect(find.byIcon(Icons.bolt_rounded), findsOneWidget);
  });

  testWidgets('ações aparecem só para quem deve responder na aba recebidos',
      (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_bia',
      onTap: () {},
      onAccept: () {},
      onDecline: () {},
    )));
    expect(find.text('Aceitar convite'), findsOneWidget);
    expect(find.text('Recusar'), findsOneWidget);

    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () {},
      onAccept: () {},
      onDecline: () {},
    )));
    expect(find.text('Aceitar convite'), findsNothing);
    expect(find.text('Recusar'), findsNothing);
  });

  testWidgets('toque no card dispara onTap', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () => tapped = true,
    )));

    await tester.tap(find.text('Bia Souza'));
    expect(tapped, isTrue);
  });

  test('friendlyMatchSummaryLine inclui objetivo, esporte e horário', () {
    final line = friendlyMatchSummaryLine(buildMatch());
    expect(line, contains('Amistoso'));
    expect(line, contains('Vôlei de praia'));
    expect(line, contains('·'));
  });
}
