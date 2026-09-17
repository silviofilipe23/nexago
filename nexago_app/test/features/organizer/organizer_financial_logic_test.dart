import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';
import 'package:nexago_app/features/organizer/domain/organizer_wallet_providers.dart';

TournamentCashBox box(String id, double available, double pending) => TournamentCashBox(
      tournamentId: id,
      tournamentName: id,
      availableReais: available,
      pendingReais: pending,
    );

void main() {
  group('sumCashBoxes', () {
    test('soma disponível e pendente de todos os caixas', () {
      final total = sumCashBoxes([box('a', 90, 5), box('b', 10.5, 0)]);
      expect(total.availableReais, 100.5);
      expect(total.pendingReais, 5);
    });

    test('lista vazia soma zero', () {
      final total = sumCashBoxes(const []);
      expect(total.availableReais, 0);
      expect(total.pendingReais, 0);
    });

    test('não acumula erro de ponto flutuante', () {
      expect(sumCashBoxes([box('a', 0.1, 0), box('b', 0.2, 0)]).availableReais, 0.3);
    });
  });

  group('withdrawalRequesterLabel', () {
    test('o próprio pedido aparece como Você', () {
      expect(
        withdrawalRequesterLabel(requestedBy: 'u1', requestedByStaff: false, viewerUid: 'u1'),
        'Você',
      );
    });

    test('pedido da equipe aparece como gestor', () {
      expect(
        withdrawalRequesterLabel(requestedBy: 'outro', requestedByStaff: true, viewerUid: 'u1'),
        'Gestor da equipe',
      );
    });

    test('pedido do dono aparece como dono', () {
      expect(
        withdrawalRequesterLabel(requestedBy: 'dono', requestedByStaff: false, viewerUid: 'u1'),
        'Dono do evento',
      );
    });

    test('sem quem pediu não afirma papel', () {
      expect(
        withdrawalRequesterLabel(requestedBy: '', requestedByStaff: false, viewerUid: 'u1'),
        '—',
      );
    });
  });

  // Grupo além do brief: o `watchCashBox` emite o caixa com `tournamentName`
  // vazio (o doc `tournamentWallets/{id}` não guarda nome), então a fusão tem
  // de aplicar só os saldos sobre a linha que a callable trouxe. Trocar a
  // linha pelo valor do stream deixaria o título do caixa em branco.
  group('applyLiveBalance', () {
    final live = TournamentCashBox(
      tournamentId: 't1',
      tournamentName: '',
      availableReais: 150,
      pendingReais: 20,
    );

    test('aplica o saldo ao vivo sem perder o nome do torneio', () {
      final merged = applyLiveBalance(box('t1', 100, 0), 't1', live);
      expect(merged.availableReais, 150);
      expect(merged.pendingReais, 20);
      expect(merged.tournamentName, 't1');
    });

    test('saldo de um caixa não mexe na linha de outro', () {
      final merged = applyLiveBalance(box('t2', 100, 0), 't1', live);
      expect(merged.availableReais, 100);
      expect(merged.pendingReais, 0);
      expect(merged.tournamentName, 't2');
    });

    test('sem emissão do stream a linha da callable fica de pé', () {
      final merged = applyLiveBalance(box('t1', 100, 7), 't1', null);
      expect(merged.availableReais, 100);
      expect(merged.pendingReais, 7);
    });
  });
}
