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
  testWidgets('telefone é opcional: label e texto auxiliar sem verificação',
      (tester) async {
    await _pumpProfileStep(tester);

    // O campo declara que é opcional — antes o passo travava aqui.
    expect(find.text('NÚMERO DE TELEFONE (OPCIONAL)'), findsOneWidget);
    // Texto auxiliar orienta quem não recebeu o SMS a concluir e verificar
    // depois, avisando que torneios continuam exigindo a verificação.
    expect(find.textContaining('SMS não chegou?'), findsOneWidget);
    expect(find.text('Nenhum número verificado'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'concluir sem telefone não gera erro de telefone — só dos obrigatórios',
      (tester) async {
    await _pumpProfileStep(tester);

    // Draft vazio: o submit é barrado pela validação local (isProfileValid
    // false) e nunca chega no Firebase.
    await tester.tap(find.text('Concluir cadastro'));
    await tester.pump();

    // Os campos realmente obrigatórios acusam erro inline...
    expect(find.text('Informe seu nome'), findsOneWidget);
    expect(find.text('Data inválida (dd/mm/aaaa)'), findsOneWidget);
    expect(find.text('Selecione o gênero'), findsOneWidget);
    expect(find.text('Escolha uma foto pra concluir'), findsOneWidget);

    // ...mas o telefone não: nenhum errorText no campo (era o erro bloqueante
    // removido) e o texto auxiliar continua orientando, não bloqueando.
    final phoneField = tester.widget<PhoneVerificationField>(
      find.byType(PhoneVerificationField),
    );
    expect(phoneField.errorText, isNull);
    expect(find.textContaining('SMS não chegou?'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('com telefone verificado o texto auxiliar some', (tester) async {
    await _pumpProfileStep(tester);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(AthleteOnboardingProfileStep)),
    );
    container
        .read(athleteOnboardingDraftProvider.notifier)
        .setVerifiedPhoneNumber('+5562999998888');
    await tester.pump();

    expect(find.textContaining('SMS não chegou?'), findsNothing);
    expect(find.text('Verificado por SMS'), findsOneWidget);
    // E.164 gravado pela CF sai mascarado pra exibição.
    expect(find.text('(62) 99999-8888'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
  });
}
