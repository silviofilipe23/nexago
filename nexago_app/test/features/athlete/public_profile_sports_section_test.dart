import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/domain/athlete_public_profile_models.dart';
import 'package:nexago_app/features/athlete/presentation/public_profile/widgets/public_profile_sports_section.dart';

void main() {
  AthletePublicSportEntry e(
    String label, {
    bool primary = false,
    int segments = 1,
    int? rank,
  }) => AthletePublicSportEntry(
    label: label,
    levelLabel: 'Iniciante 1',
    levelSegments: segments,
    isPrimary: primary,
    rankingPosition: rank,
  );

  Widget wrap(
    List<AthletePublicSportEntry> sports, {
    VoidCallback? onCompete,
  }) => MaterialApp(
    theme: AppTheme.dark,
    home: Scaffold(
      body: SingleChildScrollView(
        child: PublicProfileSportsSection(sports: sports, onCompete: onCompete),
      ),
    ),
  );

  testWidgets('some quando não há esporte', (tester) async {
    await tester.pumpWidget(wrap(const []));
    expect(tester.getSize(find.byType(PublicProfileSportsSection)), Size.zero);
  });

  testWidgets('mostra o primeiro esporte e troca ao tocar na aba', (
    tester,
  ) async {
    await tester.pumpWidget(
      wrap([e('Vôlei de praia', primary: true), e('Futebol')]),
    );

    // O selo PRINCIPAL é do card, não da aba: prova qual está selecionado.
    expect(find.text('PRINCIPAL'), findsOneWidget);

    await tester.tap(find.text('Futebol'));
    await tester.pumpAndSettle();

    // Futebol não é principal, então o selo some — o card trocou mesmo.
    expect(find.text('PRINCIPAL'), findsNothing);
  });

  testWidgets('ELO sem posição mostra travessão, não zero', (tester) async {
    await tester.pumpWidget(wrap([e('Vôlei de praia')]));

    expect(find.text('RANKING'), findsOneWidget);
    expect(find.text('—'), findsOneWidget);
  });

  testWidgets('ELO com posição mostra a colocação', (tester) async {
    await tester.pumpWidget(wrap([e('Vôlei de praia', rank: 1240)]));

    expect(find.text('#1240'), findsOneWidget);
  });

  testWidgets('COMPETIR só aparece com callback', (tester) async {
    await tester.pumpWidget(wrap([e('Vôlei de praia')]));
    expect(find.text('COMPETIR'), findsNothing);

    await tester.pumpWidget(wrap([e('Vôlei de praia')], onCompete: () {}));
    expect(find.text('COMPETIR'), findsOneWidget);
  });

  testWidgets('lista encolhida não deixa a seleção apontar para fora', (
    tester,
  ) async {
    await tester.pumpWidget(wrap([e('A'), e('B'), e('C')]));
    await tester.tap(find.text('C'));
    await tester.pumpAndSettle();

    // O perfil recarrega com menos esportes: o índice 2 não existe mais.
    await tester.pumpWidget(wrap([e('A')]));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('A'), findsWidgets);
  });

  testWidgets('três esportes de nome longo não estouram', (tester) async {
    await tester.pumpWidget(
      wrap([
        e('Vôlei de praia', primary: true),
        e('Vôlei de quadra'),
        e('Futebol de areia'),
      ]),
    );

    expect(tester.takeException(), isNull);
  });
}
