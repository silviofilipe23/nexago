import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/friendly_match/domain/friendly_match_models.dart';
import 'package:nexago_app/features/friendly_match/presentation/widgets/friendly_match_card.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  // O card usa DateTime.now(); horário futuro mantém o convite pendente.
  final scheduledAt = DateTime.now().add(const Duration(days: 2));

  FriendlyMatch buildMatch({
    FriendlyMatchStatus status = FriendlyMatchStatus.sent,
    FriendlyMatchLocation location =
        const FriendlyMatchLocation(arenaName: 'Arena Beira-Mar'),
  }) {
    return FriendlyMatch(
      id: 'fm1',
      fromUid: 'uid_ana',
      fromName: 'Ana Lima',
      toUid: 'uid_bia',
      toName: 'Bia Souza',
      sport: 'beach_tennis',
      objective: FriendlyMatchObjective.friendly,
      status: status,
      scheduledAt: scheduledAt,
      location: location,
    );
  }

  Widget wrap(Widget child) {
    return MaterialApp(
      theme: AppTheme.dark,
      home: Scaffold(body: child),
    );
  }

  // A bolinha de ação: Container circular na cor da marca.
  final actionDot = find.byWidgetPredicate((widget) {
    if (widget is! Container) return false;
    final decoration = widget.decoration;
    return decoration is BoxDecoration &&
        decoration.shape == BoxShape.circle &&
        decoration.color == AppColors.brand;
  });

  testWidgets('remetente vê o nome do destinatário', (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () {},
    )));

    expect(find.text('Bia Souza'), findsOneWidget);
    expect(find.text('Ana Lima'), findsNothing);
    // Sem foto, o avatar mostra a inicial do outro atleta.
    expect(find.text('B'), findsOneWidget);
  });

  testWidgets('destinatário vê o nome do remetente', (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_bia',
      onTap: () {},
    )));

    expect(find.text('Ana Lima'), findsOneWidget);
    expect(find.text('Bia Souza'), findsNothing);
    expect(find.text('A'), findsOneWidget);
  });

  testWidgets('mostra objetivo + horário formatado em pt_BR e o local',
      (tester) async {
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () {},
    )));

    final when = DateFormat("EEE, d 'de' MMM • HH:mm", 'pt_BR')
        .format(scheduledAt.toLocal());
    expect(find.text('Amistoso • $when'), findsOneWidget);
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

  testWidgets('bolinha de ação aparece só para quem deve responder',
      (tester) async {
    // Convite sent: quem responde é o destinatário.
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_bia',
      onTap: () {},
    )));
    expect(actionDot, findsOneWidget);

    // O remetente está aguardando: sem bolinha.
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () {},
    )));
    expect(actionDot, findsNothing);
  });

  testWidgets('contraproposta inverte a bolinha; confirmado não mostra',
      (tester) async {
    // countered: agora é o remetente original quem responde.
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(status: FriendlyMatchStatus.countered),
      currentUid: 'uid_ana',
      onTap: () {},
    )));
    expect(actionDot, findsOneWidget);

    // confirmado: próxima ação é check-in, não resposta — sem bolinha.
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(status: FriendlyMatchStatus.confirmed),
      currentUid: 'uid_ana',
      onTap: () {},
    )));
    expect(actionDot, findsNothing);
  });

  testWidgets('toque no card dispara onTap', (tester) async {
    var tapped = false;
    await tester.pumpWidget(wrap(FriendlyMatchCard(
      match: buildMatch(),
      currentUid: 'uid_ana',
      onTap: () => tapped = true,
    )));

    await tester.tap(find.byType(FriendlyMatchCard));
    expect(tapped, isTrue);
  });
}
