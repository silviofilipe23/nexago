import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/organizer_wallet_repository.dart';

void main() {
  group('OrganizerWalletView.fromCallable', () {
    test('lê os caixas por torneio e o perfil de quem chamou', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': [
          {'tournamentId': 't2', 'tournamentName': 'Copa B', 'availableReais': 90, 'pendingReais': 5},
        ],
        'selected': {'tournamentId': 't2', 'tournamentName': 'Copa B', 'availableReais': 90, 'pendingReais': 5},
        'payout': {'pixKey': 'a@b.com', 'pixKeyType': 'EMAIL', 'hasPixKey': true},
        'ledger': [
          {'id': 'l1', 'netReais': 92, 'grossReais': 100, 'platformFeeReais': 8, 'createdAt': '2026-09-16T12:00:00.000Z', 'athleteLabel': 'Ana Paula'},
        ],
        'withdrawals': [
          {'id': 'w1', 'amountReais': 40, 'status': 'pending', 'pixKey': '123••••••01', 'requestedBy': 'outro', 'requestedByStaff': true, 'createdAt': '2026-09-16T13:00:00.000Z'},
        ],
      });

      expect(view.cashBoxes.length, 1);
      expect(view.selected?.tournamentId, 't2');
      expect(view.selected?.availableReais, 90);
      expect(view.payout.hasPixKey, isTrue);
      expect(view.ledger.single.athleteLabel, 'Ana Paula');
      expect(view.withdrawals.single.pixKey, '123••••••01');
    });

    test('sem caixa acessível devolve lista vazia e selecionado nulo', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': <dynamic>[],
        'selected': null,
        'payout': {'pixKey': '', 'pixKeyType': '', 'hasPixKey': false},
        'ledger': <dynamic>[],
        'withdrawals': <dynamic>[],
      });

      expect(view.cashBoxes, isEmpty);
      expect(view.selected, isNull);
      expect(view.payout.hasPixKey, isFalse);
    });

    test('payload vazio não estoura', () {
      final view = OrganizerWalletView.fromCallable(const <String, dynamic>{});
      expect(view.cashBoxes, isEmpty);
      expect(view.selected, isNull);
      expect(view.ledger, isEmpty);
      expect(view.withdrawals, isEmpty);
      expect(view.payout.pixKey, '');
    });

    test('data inválida no extrato vira nulo em vez de estourar', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'ledger': [
          {'id': 'l1', 'createdAt': 'não é data'},
        ],
      });
      expect(view.ledger.single.createdAt, isNull);
    });

    test('número que vem como string ainda soma', () {
      final view = OrganizerWalletView.fromCallable(<String, dynamic>{
        'tournaments': [
          {'tournamentId': 't1', 'tournamentName': 'Copa A', 'availableReais': '12.5', 'pendingReais': 0},
        ],
      });
      expect(view.cashBoxes.single.availableReais, 12.5);
    });
  });
}
