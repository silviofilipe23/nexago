import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme.dart';
import 'package:nexago_app/features/athlete/onboarding/domain/athlete_onboarding_providers.dart';
import 'package:nexago_app/features/athlete/onboarding/presentation/steps/athlete_onboarding_profile_step.dart';
import 'package:nexago_app/features/athlete/phone_verification/presentation/phone_verification_field.dart';

/// Sem `pumpAndSettle`: o `BrStateCityFields` fica num spinner enquanto o
/// asset do IBGE carrega, e spinner indeterminado nunca "assenta". Nada aqui
/// toca Firebase — o notifier do draft só usa Firebase dentro de `submit()`,
/// que retorna antes disso quando o rascunho é inválido.
Future<void> _pumpProfileStep(WidgetTester tester) async {
  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        theme: AppTheme.dark,
        home: const AthleteOnboardingProfileStep(),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('WhatsApp é obrigatório e digitável, sem exigir SMS',
      (tester) async {
    await _pumpProfileStep(tester);

    expect(find.text('WHATSAPP *'), findsOneWidget);
    // O número é digitado direto — o SMS virou opcional.
    final phoneField = tester.widget<PhoneVerificationField>(
      find.byType(PhoneVerificationField),
    );
    expect(phoneField.verified, isFalse);
    expect(find.text('Verificar por SMS é opcional'), findsOneWidget);
    expect(find.textContaining('organizador fala com você'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('concluir sem telefone acusa erro inline no WhatsApp',
      (tester) async {
    await _pumpProfileStep(tester);

    // Draft vazio: o submit é barrado pela validação local (isProfileValid
    // false) e nunca chega no Firebase.
    await tester.tap(find.text('Concluir cadastro'));
    await tester.pump();

    // Cada obrigatório acusa erro inline, o WhatsApp junto com os outros.
    expect(find.text('Informe seu nome'), findsOneWidget);
    expect(find.text('Data inválida (dd/mm/aaaa)'), findsOneWidget);
    expect(find.text('Selecione o gênero'), findsOneWidget);
    expect(find.text('Escolha uma foto pra concluir'), findsOneWidget);

    final phoneField = tester.widget<PhoneVerificationField>(
      find.byType(PhoneVerificationField),
    );
    expect(phoneField.errorText, 'Informe um WhatsApp válido com DDD');

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('digitar o WhatsApp limpa o erro e alimenta o rascunho',
      (tester) async {
    await _pumpProfileStep(tester);

    await tester.tap(find.text('Concluir cadastro'));
    await tester.pump();

    await tester.enterText(find.byType(TextField).at(2), '62999998888');
    await tester.pump();

    final container = ProviderScope.containerOf(
      tester.element(find.byType(AthleteOnboardingProfileStep)),
    );
    final draft = container.read(athleteOnboardingDraftProvider);
    expect(draft.phoneNumber, '(62) 99999-8888');
    expect(draft.isPhoneValid, isTrue);

    final phoneField = tester.widget<PhoneVerificationField>(
      find.byType(PhoneVerificationField),
    );
    expect(phoneField.errorText, isNull);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('telefone verificado vira selo e trava a edição', (tester) async {
    await _pumpProfileStep(tester);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(AthleteOnboardingProfileStep)),
    );
    container
        .read(athleteOnboardingDraftProvider.notifier)
        .setVerifiedPhoneNumber('+5562999998888');
    await tester.pump();

    expect(find.text('Verificado por SMS'), findsOneWidget);
    expect(find.text('Verificar por SMS é opcional'), findsNothing);
    // Depois do selo as rules recusam troca pelo client — o campo acompanha.
    final phoneField = tester.widget<PhoneVerificationField>(
      find.byType(PhoneVerificationField),
    );
    expect(phoneField.verified, isTrue);

    await tester.pumpWidget(const SizedBox());
  });
}
