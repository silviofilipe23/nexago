import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';
import 'package:nexago_app/features/arena/presentation/plan/widgets/arena_plan_gate.dart';

void main() {
  group('ArenaPlanUpsell', () {
    // O selo tem de nomear os planos que REALMENTE liberam a capability:
    // multiUnidade só existe no Elite, então "Planos Pro e Elite" mandaria a
    // arena assinar um plano que não destrava o recurso.
    const expectedCopyByCapability = {
      ArenaCapability.pdvComandas: ('PDV e comandas', 'Planos Pro e Elite'),
      ArenaCapability.estoque: ('Controle de estoque', 'Planos Pro e Elite'),
      ArenaCapability.promocoes: ('Promoções de horário', 'Planos Pro e Elite'),
      ArenaCapability.clubinho: ('Clubinho', 'Planos Pro e Elite'),
      ArenaCapability.metricasCompletas: (
        'Métricas completas',
        'Planos Pro e Elite'
      ),
      ArenaCapability.receberTorneios: (
        'Receber torneios',
        'Planos Pro e Elite'
      ),
      ArenaCapability.multiUnidade: ('Múltiplas unidades', 'Plano Elite'),
    };

    for (final entry in expectedCopyByCapability.entries) {
      final (title, badge) = entry.value;
      testWidgets(
        'mostra o paywall de "$title" com o selo "$badge" para '
        'ArenaCapability.${entry.key.name}',
        (tester) async {
          await tester.pumpWidget(
            MaterialApp(
              home: Scaffold(body: ArenaPlanUpsell(capability: entry.key)),
            ),
          );

          expect(find.text(title), findsOneWidget);
          expect(find.text(badge), findsOneWidget);
          expect(find.text('Ver planos'), findsOneWidget);
        },
      );
    }

    testWidgets(
      'selo customizado aponta o degrau seguinte: uma arena Starter no teto de '
      'quadras precisa do Pro, não do Elite da capability multiUnidade',
      (tester) async {
        await tester.pumpWidget(
          const MaterialApp(
            home: Scaffold(
              body: ArenaPlanUpsell(
                capability: ArenaCapability.multiUnidade,
                badge: 'Plano Pro',
                title: 'Limite de quadras atingido',
                description:
                    'O plano atual permite até 2 quadras. Assine o Pro para '
                    'cadastrar até 5.',
              ),
            ),
          ),
        );

        expect(find.text('Plano Pro'), findsOneWidget);
        expect(find.text('Plano Elite'), findsNothing);
      },
    );

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
