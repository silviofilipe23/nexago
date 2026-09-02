import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/registration_wizard/registration_wizard_notice.dart';

void main() {
  testWidgets(
    'countdown não reinicia barra nem rótulo ao remontar o widget',
    (tester) async {
      const totalWindow = Duration(minutes: 30);
      final expiresAt = DateTime.now().add(const Duration(minutes: 20));

      Future<double?> progressValue() async {
        final indicator = tester.widget<LinearProgressIndicator>(
          find.descendant(
            of: find.byType(RegistrationWizardNotice),
            matching: find.byType(LinearProgressIndicator),
          ),
        );
        return indicator.value;
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RegistrationWizardNotice(
              expiresAt: expiresAt,
              totalWindow: totalWindow,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('PAGUE EM 30 MIN'), findsOneWidget);
      final firstProgress = await progressValue();
      expect(firstProgress, closeTo(20 / 30, 0.02));

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: RegistrationWizardNotice(
              expiresAt: expiresAt,
              totalWindow: totalWindow,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('PAGUE EM 30 MIN'), findsOneWidget);
      expect(find.text('PAGUE EM 20 MIN'), findsNothing);
      final secondProgress = await progressValue();
      expect(secondProgress, closeTo(firstProgress!, 0.02));
    },
  );
}
