import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/presentation/plan/widgets/arena_plan_gate.dart';

void main() {
  group('ArenaPlanUpsell', () {
    const expectedTitleByCapability = {
      ArenaCapability.pdvComandas: 'PDV e comandas',
      ArenaCapability.estoque: 'Controle de estoque',
      ArenaCapability.promocoes: 'Promoções de horário',
      ArenaCapability.metricasCompletas: 'Métricas completas',
      ArenaCapability.receberTorneios: 'Receber torneios',
      ArenaCapability.multiUnidade: 'Múltiplas unidades',
    };

    for (final entry in expectedTitleByCapability.entries) {
      testWidgets(
        'mostra o paywall de "${entry.value}" para ArenaCapability.${entry.key.name}',
        (tester) async {
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(body: ArenaPlanUpsell(capability: entry.key)),
            ),
          );

          expect(find.text(entry.value), findsOneWidget);
          expect(find.text('Planos Pro e Parceiro'), findsOneWidget);
          expect(find.text('Ver planos'), findsOneWidget);
        },
      );
    }

    testWidgets(
      'copy customizada (ex.: "limite atingido") sobrescreve o título e a '
      'descrição padrão da capability, sem precisar trocar o componente',
      (tester) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ArenaPlanUpsell(
                capability: ArenaCapability.pdvComandas,
                title: 'Limite de quadras atingido',
                description: 'O plano atual permite até 2 quadras.',
              ),
            ),
          ),
        );

        expect(find.text('Limite de quadras atingido'), findsOneWidget);
        expect(find.text('O plano atual permite até 2 quadras.'),
            findsOneWidget);
        // A copy padrão da capability não deve aparecer quando sobrescrita.
        expect(find.text('PDV e comandas'), findsNothing);
      },
    );
  });

  group('ArenaPlanReadOnlyBanner', () {
    testWidgets('mostra a mensagem de somente-leitura e o CTA "Ver planos"',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: ArenaPlanReadOnlyBanner(
              message: 'Somente leitura. Assine o Pro para editar.',
            ),
          ),
        ),
      );

      expect(
        find.text('Somente leitura. Assine o Pro para editar.'),
        findsOneWidget,
      );
      expect(find.text('Ver planos'), findsOneWidget);
    });
  });
}
