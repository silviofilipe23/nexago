import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';
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

    // O arredondamento do pendente não tinha teste: dava para apagar o
    // `_round2` dele e a suíte seguia verde.
    test('arredonda o pendente também', () {
      expect(sumCashBoxes([box('a', 0, 0.1), box('b', 0, 0.2)]).pendingReais, 0.3);
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
    const live = TournamentCashBox(
      tournamentId: 't1',
      tournamentName: '',
      availableReais: 150,
      pendingReais: 20,
    );

    test('aplica o saldo ao vivo sem perder o nome do torneio', () {
      final merged = applyLiveBalance(box('t1', 100, 0), live);
      expect(merged.availableReais, 150);
      expect(merged.pendingReais, 20);
      expect(merged.tournamentName, 't1');
    });

    // A identidade é a do próprio snapshot: uma emissão do caixa anterior não
    // pode ser fundida na linha do caixa novo.
    test('saldo de um caixa não mexe na linha de outro', () {
      final merged = applyLiveBalance(box('t2', 100, 0), live);
      expect(merged.availableReais, 100);
      expect(merged.pendingReais, 0);
      expect(merged.tournamentName, 't2');
    });

    test('sem emissão do stream a linha da callable fica de pé', () {
      final merged = applyLiveBalance(box('t1', 100, 7), null);
      expect(merged.availableReais, 100);
      expect(merged.pendingReais, 7);
    });
  });

  // Regras do valor do saque: viviam no `State` da tela, fora do alcance de
  // qualquer teste.
  group('parseWithdrawalAmount', () {
    test('aceita vírgula e ponto como separador decimal', () {
      expect(parseWithdrawalAmount('25,50'), 25.5);
      expect(parseWithdrawalAmount('25.50'), 25.5);
    });

    test('espaço em volta não atrapalha', () {
      expect(parseWithdrawalAmount('  30  '), 30);
    });

    test('vazio e texto inválido não viram número', () {
      expect(parseWithdrawalAmount(''), isNull);
      expect(parseWithdrawalAmount('   '), isNull);
      expect(parseWithdrawalAmount('abc'), isNull);
    });
  });

  group('withdrawalAmountError', () {
    test('campo vazio não é erro: é o estado inicial', () {
      expect(withdrawalAmountError(raw: '', availableReais: 100), isNull);
    });

    test('texto inválido pede um valor válido', () {
      expect(
        withdrawalAmountError(raw: 'abc', availableReais: 100),
        'Informe um valor válido.',
      );
    });

    test('abaixo do piso avisa o mínimo', () {
      expect(
        withdrawalAmountError(raw: '19,99', availableReais: 100),
        'Mínimo: ${formatBRL(minWithdrawalReais)}.',
      );
    });

    test('zero é abaixo do piso', () {
      expect(
        withdrawalAmountError(raw: '0', availableReais: 100),
        'Mínimo: ${formatBRL(minWithdrawalReais)}.',
      );
    });

    test('acima do saldo avisa o teto', () {
      expect(
        withdrawalAmountError(raw: '100,01', availableReais: 100),
        'Máximo disponível: ${formatBRL(100)}.',
      );
    });

    test('sacar exatamente o saldo passa', () {
      expect(withdrawalAmountError(raw: '100', availableReais: 100), isNull);
      expect(withdrawalAmountError(raw: '100,00', availableReais: 100), isNull);
    });
  });

  group('canRequestWithdrawalAmount', () {
    test('valor válido dentro do saldo libera', () {
      expect(
        canRequestWithdrawalAmount(raw: '50', availableReais: 100),
        isTrue,
      );
    });

    test('campo vazio não libera — diferente de não ser erro', () {
      expect(withdrawalAmountError(raw: '', availableReais: 100), isNull);
      expect(canRequestWithdrawalAmount(raw: '', availableReais: 100), isFalse);
    });

    test('abaixo do piso, acima do saldo e zero não liberam', () {
      expect(
        canRequestWithdrawalAmount(raw: '19,99', availableReais: 100),
        isFalse,
      );
      expect(
        canRequestWithdrawalAmount(raw: '100,01', availableReais: 100),
        isFalse,
      );
      expect(canRequestWithdrawalAmount(raw: '0', availableReais: 100), isFalse);
    });
  });
}
