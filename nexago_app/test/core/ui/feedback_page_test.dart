import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/core/ui/feedback/feedback_page.dart';
import 'package:nexago_app/core/ui/feedback/show_feedback_page.dart';

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      theme: AppTheme.dark,
      home: child,
    );
  }

  group('FeedbackPage', () {
    testWidgets('renders success title and description', (tester) async {
      await tester.pumpWidget(
        wrap(
          FeedbackPage.success(
            title: 'Inscrição confirmada',
            description: 'Sua vaga está garantida.',
            eyebrow: 'Sucesso',
          ),
        ),
      );

      expect(find.text('Inscrição confirmada'), findsOneWidget);
      expect(find.text('Sua vaga está garantida.'), findsOneWidget);
      expect(find.text('SUCESSO'), findsOneWidget);
      expect(find.byIcon(Icons.check_rounded), findsOneWidget);
    });

    testWidgets('renders error with default close icon', (tester) async {
      await tester.pumpWidget(
        wrap(
          FeedbackPage.error(
            title: 'Pagamento falhou',
            description: 'Tente novamente.',
          ),
        ),
      );

      expect(find.text('Pagamento falhou'), findsOneWidget);
      expect(find.byIcon(Icons.close_rounded), findsOneWidget);
    });

    testWidgets('renders alert and info kinds', (tester) async {
      await tester.pumpWidget(
        wrap(
          FeedbackPage.alert(
            title: 'Convite expirado',
            description: 'Envie um novo convite.',
          ),
        ),
      );
      expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);

      await tester.pumpWidget(
        wrap(
          FeedbackPage.info(
            title: 'Convite cancelado',
            description: 'Você pode convidar outro parceiro.',
          ),
        ),
      );
      expect(find.byIcon(Icons.info_outline_rounded), findsOneWidget);
    });

    testWidgets('primary and secondary actions fire callbacks', (tester) async {
      var primaryTapped = false;
      var secondaryTapped = false;

      await tester.pumpWidget(
        wrap(
          FeedbackPage.success(
            title: 'Pronto',
            primaryAction: FeedbackAction(
              label: 'Continuar',
              onPressed: () => primaryTapped = true,
            ),
            secondaryAction: FeedbackAction(
              label: 'Voltar',
              onPressed: () => secondaryTapped = true,
              isPrimary: false,
            ),
          ),
        ),
      );

      await tester.tap(find.text('Continuar'));
      await tester.tap(find.text('Voltar'));
      expect(primaryTapped, isTrue);
      expect(secondaryTapped, isTrue);
    });

    testWidgets('extraContent is shown between description and actions', (
      tester,
    ) async {
      await tester.pumpWidget(
        wrap(
          FeedbackPage.info(
            title: 'Info',
            extraContent: const Text('Slot customizado'),
            primaryAction: FeedbackAction(
              label: 'OK',
              onPressed: () {},
            ),
          ),
        ),
      );

      expect(find.text('Slot customizado'), findsOneWidget);
      expect(find.text('OK'), findsOneWidget);
    });
  });

  group('pushFeedbackPage', () {
    testWidgets('pushes feedback as fullscreen dialog', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Builder(
            builder: (context) {
              return Scaffold(
                body: ElevatedButton(
                  onPressed: () => pushFeedbackPage(
                    context,
                    FeedbackPage.success(title: 'Feito'),
                  ),
                  child: const Text('Abrir'),
                ),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Abrir'));
      await tester.pumpAndSettle();

      expect(find.text('Feito'), findsOneWidget);
    });
  });
}
