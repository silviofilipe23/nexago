// Retomada de inscrição em andamento: o CTA "Continuar" da trilha de passos
// (Home do atleta e aba "Minha inscrição") precisa SEMPRE carregar o
// `registrationId`. Sem ele a tela de inscrição abre no passo de categoria, e
// lá a categoria já inscrita vira selo sem toque — quem reservou solo ficava
// sem caminho até o convite do parceiro.
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/registration_progress_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_navigation.dart';

RegistrationProgress makeProgress({
  String registrationId = 'reg-1',
  String categoryId = 'cat-1',
  bool paymentPending = false,
}) {
  return RegistrationProgress(
    registrationId: registrationId,
    tournamentId: 't1',
    categoryId: categoryId,
    tournamentName: 'Open Goiânia Beach',
    categoryName: 'Masc. Intermediário',
    waitlist: false,
    steps: const [],
    pendingLabel: 'Falta fechar a dupla',
    currentStep: 2,
    totalSteps: 4,
    paymentPending: paymentPending,
    canCancel: true,
  );
}

void main() {
  group('registrationProgressResumeParams', () {
    test('falta o parceiro: ainda carrega registrationId e passo', () {
      final params = registrationProgressResumeParams(
        makeProgress(paymentPending: false),
      );

      expect(params['registrationId'], 'reg-1');
      expect(params['categoryId'], 'cat-1');
      expect(params['step'], 'payment');
    });

    test('só falta pagar: mesmo destino', () {
      final params = registrationProgressResumeParams(
        makeProgress(paymentPending: true),
      );

      expect(params['registrationId'], 'reg-1');
      expect(params['categoryId'], 'cat-1');
      expect(params['step'], 'payment');
    });
  });

  group('tournamentRegistrationResumeParams', () {
    test('retomada exige inscrição: sem id não há o que retomar', () {
      final params = tournamentRegistrationResumeParams(
        categoryId: 'cat-1',
        registrationId: '  ',
      );

      // Sem inscrição o destino é o fluxo normal (passo de categoria).
      expect(params.containsKey('registrationId'), isFalse);
      expect(params.containsKey('step'), isFalse);
      expect(params['categoryId'], 'cat-1');
    });
  });
}
