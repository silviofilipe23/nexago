import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/compete_hub/compete_hub_menu_card.dart';

void main() {
  Widget wrap(Widget child) =>
      MaterialApp(theme: AppTheme.dark, home: Scaffold(body: child));

  testWidgets('renderiza título, descrição, ícone e chevron', (tester) async {
    await tester.pumpWidget(wrap(CompeteHubMenuCard(
      icon: Icons.emoji_events_rounded,
      title: 'Torneios',
      description: 'Encontre e participe de torneios',
      onTap: () {},
    )));

    expect(find.text('Torneios'), findsOneWidget);
    expect(find.text('Encontre e participe de torneios'), findsOneWidget);
    expect(find.byIcon(Icons.emoji_events_rounded), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);
  });

  testWidgets('tap no card dispara onTap uma única vez', (tester) async {
    var taps = 0;
    await tester.pumpWidget(wrap(CompeteHubMenuCard(
      icon: Icons.emoji_events_rounded,
      title: 'Torneios',
      description: 'Encontre e participe de torneios',
      onTap: () => taps++,
    )));

    await tester.tap(find.byType(CompeteHubMenuCard));
    await tester.pump();

    expect(taps, 1);
  });

  testWidgets('descrição longa não estoura em largura estreita',
      (tester) async {
    await tester.pumpWidget(wrap(Center(
      child: SizedBox(
        width: 320,
        child: CompeteHubMenuCard(
          icon: Icons.emoji_events_rounded,
          title: 'Palpites da galera',
          description: 'Uma descrição bem longa para forçar a quebra de '
              'linha e garantir que o texto seja truncado com reticências '
              'sem causar overflow no layout do card.',
          onTap: () {},
        ),
      ),
    )));

    expect(tester.takeException(), isNull);
    expect(find.text('Palpites da galera'), findsOneWidget);
  });
}
