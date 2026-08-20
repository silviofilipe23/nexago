import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_shell_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_lgpd_consent_box.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_shell_category_card.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/tournament_registration/registration_shell_summary_card.dart';

/// Os cartões da tela única, isolados. O que importa aqui é o que o atleta lê:
/// selo da categoria, aviso de bloqueio, linhas do resumo e o gate do termo.
void main() {
  TournamentCategoryOffer offer({
    String id = 'cat-1',
    String name = 'Misto Iniciante',
    double fee = 140,
    int? teamSize,
    String level = 'Iniciante 2',
  }) => TournamentCategoryOffer(
    id: id,
    name: name,
    entryFee: fee,
    level: level,
    genderType: 'mixed',
    teamSize: teamSize,
  );

  Future<void> pump(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );
  }

  group('RegistrationShellCategoryCard', () {
    testWidgets('mostra nome, preço e selo da categoria escolhida', (
      tester,
    ) async {
      await pump(
        tester,
        RegistrationShellCategoryCard(
          selected: offer(),
          selectedStatus: const RegistrationCategoryStatus(
            badge: 'JÁ INSCRITO',
          ),
          others: const [],
          pickerOpen: false,
          onTogglePicker: () {},
          onSelect: (_) {},
          hasRegistration: true,
        ),
      );

      expect(find.text('Categoria'), findsOneWidget);
      expect(find.text('Misto Iniciante'), findsOneWidget);
      expect(find.text('JÁ INSCRITO'), findsOneWidget);
      expect(find.textContaining('140'), findsOneWidget);
    });

    // Com inscrição na categoria a mensagem de bloqueio some: a vaga já é do
    // atleta, e repetir "está lotada" só assusta.
    testWidgets('aviso de bloqueio some quando já existe inscrição', (
      tester,
    ) async {
      const lotado = RegistrationCategoryStatus(
        badge: 'LOTADO',
        blocked: true,
        message: 'Esta categoria está lotada.',
      );

      await pump(
        tester,
        RegistrationShellCategoryCard(
          selected: offer(),
          selectedStatus: lotado,
          others: const [],
          pickerOpen: false,
          onTogglePicker: () {},
          onSelect: (_) {},
          hasRegistration: false,
        ),
      );
      expect(find.text('Esta categoria está lotada.'), findsOneWidget);

      await pump(
        tester,
        RegistrationShellCategoryCard(
          selected: offer(),
          selectedStatus: lotado,
          others: const [],
          pickerOpen: false,
          onTogglePicker: () {},
          onSelect: (_) {},
          hasRegistration: true,
        ),
      );
      expect(find.text('Esta categoria está lotada.'), findsNothing);
    });

    testWidgets('"Trocar" só aparece com outra categoria, e abre a lista', (
      tester,
    ) async {
      await pump(
        tester,
        RegistrationShellCategoryCard(
          selected: offer(),
          selectedStatus: const RegistrationCategoryStatus(),
          others: const [],
          pickerOpen: false,
          onTogglePicker: () {},
          onSelect: (_) {},
          hasRegistration: false,
        ),
      );
      expect(find.text('Trocar'), findsNothing);

      var toggles = 0;
      await pump(
        tester,
        RegistrationShellCategoryCard(
          selected: offer(),
          selectedStatus: const RegistrationCategoryStatus(),
          others: [
            (
              offer: offer(id: 'cat-2', name: 'Quarteto Misto', fee: 280),
              status: const RegistrationCategoryStatus(badge: 'LOTADO'),
            ),
          ],
          pickerOpen: false,
          onTogglePicker: () => toggles++,
          onSelect: (_) {},
          hasRegistration: false,
        ),
      );
      expect(find.text('Trocar'), findsOneWidget);
      // Fechado, a outra categoria não aparece.
      expect(find.text('Quarteto Misto'), findsNothing);

      await tester.tap(find.text('Trocar'));
      expect(toggles, 1);
    });

    testWidgets('lista aberta mostra as outras com preço e selo', (
      tester,
    ) async {
      TournamentCategoryOffer? picked;
      await pump(
        tester,
        RegistrationShellCategoryCard(
          selected: offer(),
          selectedStatus: const RegistrationCategoryStatus(),
          others: [
            (
              offer: offer(id: 'cat-2', name: 'Quarteto Misto', fee: 280),
              status: const RegistrationCategoryStatus(badge: 'LOTADO'),
            ),
          ],
          pickerOpen: true,
          onTogglePicker: () {},
          onSelect: (o) => picked = o,
          hasRegistration: false,
        ),
      );

      expect(find.text('Quarteto Misto'), findsOneWidget);
      expect(find.text('LOTADO'), findsOneWidget);
      expect(find.textContaining('280'), findsOneWidget);

      await tester.tap(find.text('Quarteto Misto'));
      expect(picked?.id, 'cat-2');
    });
  });

  group('RegistrationShellSummaryCard', () {
    testWidgets('mostra as linhas do resumo', (tester) async {
      await pump(
        tester,
        const RegistrationShellSummaryCard(
          tournamentName: '1°COPA COLIGADOS 2026',
          locationLine: 'Arena Coligados · Goiânia',
          dateLabel: '24 out',
          categoryName: 'Misto Iniciante',
          statusLabel: 'Convite enviado',
          priceLabel: 'R\$ 140,00',
          priceUnitLabel: 'dupla',
          uniformLabel: 'Salvo',
          lgpdLabel: 'Aceito',
        ),
      );

      expect(find.text('Resumo da inscrição'), findsOneWidget);
      expect(find.text('1°COPA COLIGADOS 2026'), findsOneWidget);
      expect(find.text('Arena Coligados · Goiânia'), findsOneWidget);
      expect(find.text('Convite enviado'), findsOneWidget);
      expect(find.text('Inscrição (por dupla)'), findsOneWidget);
      expect(find.text('Salvo'), findsOneWidget);
    });

    // Categoria sem uniforme e inscrição inexistente não têm o que relatar —
    // linha vazia no resumo é pior que linha ausente.
    testWidgets('omite uniforme e LGPD quando não se aplicam', (tester) async {
      await pump(
        tester,
        const RegistrationShellSummaryCard(
          tournamentName: 'Copa',
          locationLine: '',
          dateLabel: 'Data a confirmar',
          categoryName: 'Livre',
          statusLabel: 'Não inscrito',
          priceLabel: 'R\$ 0,00',
          priceUnitLabel: 'dupla',
        ),
      );

      expect(find.text('Uniforme'), findsNothing);
      expect(find.text('Termo LGPD'), findsNothing);
      expect(find.text('Não inscrito'), findsOneWidget);
    });

    testWidgets('equipe ganha a linha do nome', (tester) async {
      await pump(
        tester,
        const RegistrationShellSummaryCard(
          tournamentName: 'Copa',
          locationLine: 'Goiânia',
          dateLabel: '24 out',
          categoryName: 'Quarteto Misto',
          teamName: 'Coligados QA',
          statusLabel: 'Elenco 3/4',
          priceLabel: 'R\$ 280,00',
          priceUnitLabel: 'equipe',
        ),
      );

      expect(find.text('Equipe'), findsOneWidget);
      expect(find.text('Coligados QA'), findsOneWidget);
      expect(find.text('Inscrição (por equipe)'), findsOneWidget);
    });
  });

  group('RegistrationLgpdConsentBox', () {
    testWidgets('marca e desmarca, e abre o termo completo', (tester) async {
      var accepted = false;
      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(),
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => SingleChildScrollView(
                child: RegistrationLgpdConsentBox(
                  accepted: accepted,
                  onChanged: (v) => setState(() => accepted = v),
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Ler termo completo'), findsOneWidget);
      expect(find.textContaining('autorizo'), findsNothing);

      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      expect(accepted, isTrue);

      await tester.tap(find.text('Ler termo completo'));
      await tester.pump();
      expect(find.text('Ocultar termo'), findsOneWidget);
      expect(find.textContaining('autorizo'), findsOneWidget);
    });

    testWidgets('desabilitado não muda o aceite', (tester) async {
      var changes = 0;
      await pump(
        tester,
        RegistrationLgpdConsentBox(
          accepted: false,
          enabled: false,
          onChanged: (_) => changes++,
        ),
      );

      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      expect(changes, 0);
    });
  });
}
