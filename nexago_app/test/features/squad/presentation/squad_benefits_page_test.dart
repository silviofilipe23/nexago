import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/router/routes.dart';
import 'package:nexago_app/features/squad/domain/squad_models.dart';
import 'package:nexago_app/features/squad/presentation/widgets/squad_sheets.dart';

import '../squad_test_support.dart';

void main() {
  setUpAll(loadSquadFonts);

  group('Benefícios (tela 05)', () {
    testWidgets('nível com período, faixa de pontos e total', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadBenefits,
      );

      expect(find.text('SEU NÍVEL'), findsOneWidget);
      expect(find.text('Ambassador'), findsOneWidget);
      expect(
        squadTextOf(tester, const Key('squad-tier-meta')),
        '08 set → 06 dez · Gold · 1.280 pts',
      );
    });

    testWidgets('pacote do nível com status ATIVO', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadBenefits,
      );

      expect(find.text('10% de comissão'), findsOneWidget);
      expect(find.text('1 inscrição grátis/mês'), findsOneWidget);
      expect(find.text('Renova todo dia 1º'), findsOneWidget);
      expect(find.text('Kit Squad'), findsOneWidget);
      expect(find.text('Kit completo'), findsWidgets);
      expect(find.text('ATIVO'), findsWidgets);
      expect(find.text('PAUSADO'), findsNothing);
    });

    testWidgets('próximo nível: conversões, linha de progresso e chips', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad()),
        location: AppRoutes.squadBenefits,
      );

      expect(find.text('Próximo nível'), findsOneWidget);
      expect(find.text('Pro Ambassador'), findsOneWidget);
      expect(find.text('7/12'), findsOneWidget);
      expect(
        find.text(
          'Mais 5 conversões pra concorrer a Pro Ambassador na avaliação '
          'de 06 dez.',
        ),
        findsOneWidget,
      );
      for (final chip in [
        'Até 15% de comissão',
        'Inscrições grátis',
        'Kit premium + uniforme',
        '50% para sua dupla',
        'Cachê por campanha',
      ]) {
        expect(find.text(chip), findsOneWidget, reason: chip);
      }
    });

    testWidgets('topo da escada (sem promoção): sem "Próximo nível"', (
      tester,
    ) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(squadMember(withProgress: false)),
        ),
        location: AppRoutes.squadBenefits,
      );

      expect(find.text('Próximo nível'), findsNothing);
      expect(find.byKey(const Key('squad-tier-meta')), findsOneWidget);
    });

    testWidgets('contrato pausado: aviso e status PAUSADO', (tester) async {
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(
          mySquad: memberSquad(
            squadMember(status: 'paused', pausedUntil: '2026-11-03'),
          ),
        ),
        location: AppRoutes.squadBenefits,
      );

      expect(
        find.textContaining('Contrato pausado até 03 nov'),
        findsOneWidget,
      );
      expect(find.text('PAUSADO'), findsWidgets);
      expect(find.text('ATIVO'), findsNothing);
    });

    testWidgets('"Ver contrato" abre o resumo das regras e "Fechar" fecha', (
      tester,
    ) async {
      final member = squadMember();
      await pumpSquadApp(
        tester,
        repo: FakeSquadRepository(mySquad: memberSquad(member)),
        location: AppRoutes.squadBenefits,
      );

      expect(find.text('Ver contrato'), findsOneWidget);
      await tester.tap(find.byKey(const Key('squad-contract-link')));
      await settleSheet(tester);

      expect(find.text('Contrato do NexaSquad'), findsOneWidget);
      final clauses = squadContractClauses(
        package: member.package,
        followerDiscountFirstOnly: true,
        periodLabel: '08 set → 06 dez',
      );
      expect(clauses.first, 'Nível Ambassador · 08 set → 06 dez.');
      for (final clause in clauses) {
        expect(find.text(clause), findsOneWidget, reason: clause);
      }

      await tester.tap(find.text('Fechar'));
      await settleSheet(tester);
      expect(find.text('Contrato do NexaSquad'), findsNothing);
    });
  });

  group('squadContractClauses', () {
    test('faixa do Pro avisa que o valor exato fica no contrato', () {
      final clauses = squadContractClauses(
        package: squadPackage('pro'),
        followerDiscountFirstOnly: false,
      );

      expect(clauses.first, 'Nível Pro Ambassador.');
      expect(
        clauses[1],
        startsWith(
          'Comissão de 10% a 15% (o valor exato fica no contrato) sobre cada',
        ),
      );
      // Desconto em todas as compras: sem "na primeira inscrição".
      expect(
        clauses[2],
        startsWith(
          'Quem usar o seu código ganha 15% de desconto em inscrições, '
          'reservas e clubinhos. O desconto sai da taxa da NexaGO',
        ),
      );
      expect(
        clauses,
        contains('Ao divulgar, identifique a parceria com #publi.'),
      );
    });

    test('desconto só na primeira inscrição aparece na cláusula', () {
      final clauses = squadContractClauses(
        package: squadPackage('amb'),
        followerDiscountFirstOnly: true,
        periodLabel: 'até 06 dez',
      );

      expect(clauses.first, 'Nível Ambassador · até 06 dez.');
      expect(clauses[1], startsWith('Comissão de 10% sobre cada'));
      expect(
        clauses[2],
        contains(
          '10% de desconto na primeira inscrição, na primeira reserva e no '
          'primeiro clubinho.',
        ),
      );
    });

    test('cláusula do desconto segue o escopo; desligado em tudo some', () {
      final onlyBooking = squadContractClauses(
        package: squadPackage('amb'),
        followerDiscountFirstOnly: false,
        followerDiscountScope: const SquadDiscountScope(
          registration: false,
          booking: true,
          club: false,
        ),
      );
      expect(
        onlyBooking[2],
        startsWith('Quem usar o seu código ganha 10% de desconto em reservas.'),
      );

      final none = squadContractClauses(
        package: squadPackage('amb'),
        followerDiscountFirstOnly: true,
        followerDiscountScope: const SquadDiscountScope(
          registration: false,
          booking: false,
          club: false,
        ),
      );
      expect(none.any((c) => c.contains('de desconto')), isFalse);
    });
  });
}
