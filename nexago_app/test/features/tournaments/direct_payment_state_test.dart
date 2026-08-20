import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/direct_payment_state.dart';

/// Pagamento DIRETO com o organizador: não existe webhook, o dinheiro cai fora
/// do app e o que o sistema registra é a DECLARAÇÃO de cada atleta.
void main() {
  group('resolveDirectPaymentState', () {
    test('ninguém declarou por mim: ainda há o que fazer', () {
      expect(
        resolveDirectPaymentState(
          isPaid: false,
          sharePaidUids: const [],
          myUid: 'eu',
          declaredPaidAt: null,
          paymentVerifiedByOrganizer: false,
        ),
        DirectPaymentState.idle,
      );
    });

    test('declarei minha parte: falta o parceiro', () {
      expect(
        resolveDirectPaymentState(
          isPaid: false,
          sharePaidUids: const ['eu'],
          myUid: 'eu',
          declaredPaidAt: null,
          paymentVerifiedByOrganizer: false,
        ),
        DirectPaymentState.waitingPartner,
      );
    });

    test('dupla fechou: vaga vale, organizador ainda vai conferir', () {
      expect(
        resolveDirectPaymentState(
          isPaid: true,
          sharePaidUids: const ['eu', 'parceiro'],
          myUid: 'eu',
          declaredPaidAt: DateTime(2026, 8, 19),
          paymentVerifiedByOrganizer: false,
        ),
        DirectPaymentState.waitingOrganizer,
      );
    });

    test('organizador conferiu: confirmado', () {
      expect(
        resolveDirectPaymentState(
          isPaid: true,
          sharePaidUids: const ['eu', 'parceiro'],
          myUid: 'eu',
          declaredPaidAt: DateTime(2026, 8, 19),
          paymentVerifiedByOrganizer: true,
        ),
        DirectPaymentState.confirmed,
      );
    });

    // Inscrição direta fechada ANTES deste fluxo existir nunca entrou na fila
    // de conferência: dizer que alguém vai conferir seria mentira.
    test('inscrição antiga, sem declaração registrada, já é confirmada', () {
      expect(
        resolveDirectPaymentState(
          isPaid: true,
          sharePaidUids: const [],
          myUid: 'eu',
          declaredPaidAt: null,
          paymentVerifiedByOrganizer: false,
        ),
        DirectPaymentState.confirmed,
      );
    });

    test('sem sessão, nada foi declarado por mim', () {
      expect(
        resolveDirectPaymentState(
          isPaid: false,
          sharePaidUids: const ['outro'],
          myUid: null,
          declaredPaidAt: null,
          paymentVerifiedByOrganizer: false,
        ),
        DirectPaymentState.idle,
      );
    });
  });

  group('directPaymentAwaitsAction', () {
    test('só em idle o atleta ainda tem o que fazer', () {
      expect(directPaymentAwaitsAction(DirectPaymentState.idle), isTrue);
      expect(directPaymentAwaitsAction(DirectPaymentState.waitingPartner), isFalse);
      expect(directPaymentAwaitsAction(DirectPaymentState.waitingOrganizer), isFalse);
      expect(directPaymentAwaitsAction(DirectPaymentState.confirmed), isFalse);
    });
  });
}
