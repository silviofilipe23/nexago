import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_entry.dart';
import 'package:nexago_app/features/athlete/domain/agenda/class_charge_payment_watch.dart';

ClassChargeEntry _charge(String id, {String payment = 'online'}) =>
    ClassChargeEntry.fromMap({
      'chargeId': id,
      'arenaId': 'arena1',
      'arenaName': 'Arena CFC',
      'description': 'Mensal 2x · Novembro',
      'amountReais': 180,
      'dueDate': '2026-11-05',
      'payment': payment,
      'invoiceUrl': payment == 'online' ? 'https://www.asaas.com/i/$id' : null,
    });

/// Devolve as listas em sequência (a última se repete); `null` = erro.
Future<List<ClassChargeEntry>> Function() _reads(
  List<List<ClassChargeEntry>?> lists,
  List<int> calls,
) {
  return () async {
    final i = calls.length;
    calls.add(i);
    final list = lists[i < lists.length ? i : lists.length - 1];
    if (list == null) throw Exception('rede');
    return list;
  };
}

Future<void> _noWait(Duration _) async {}

void main() {
  test('espera só as de cobrança online (com link ou em preparo)', () {
    expect(
      classChargesAwaitingOnlinePayment([
        _charge('a'),
        _charge('b', payment: 'preparing'),
        _charge('c', payment: 'manual'),
      ]),
      {'a', 'b'},
    );
  });

  test('para assim que a paga some da lista', () async {
    final calls = <int>[];
    final paid = await watchClassChargesPaid(
      watched: {'a', 'b'},
      fetch: _reads([
        [_charge('a'), _charge('b')],
        [_charge('a'), _charge('b')],
        [_charge('a')], // o webhook deu baixa em "b"
      ], calls),
      wait: _noWait,
    );
    expect(paid, {'b'});
    expect(calls, hasLength(3));
  });

  test('erro de leitura não vira "pago"', () async {
    final calls = <int>[];
    final paid = await watchClassChargesPaid(
      watched: {'a'},
      fetch: _reads([
        null,
        null,
        [_charge('a')]
      ], calls),
      wait: _noWait,
    );
    expect(paid, isEmpty);
    expect(calls, hasLength(classChargePaymentWatchDelays.length));
  });

  test('prazo acaba sem baixa: nada pago, ~1 min no total', () async {
    final waited = <Duration>[];
    final paid = await watchClassChargesPaid(
      watched: {'a'},
      fetch: _reads([
        [_charge('a')],
      ], []),
      wait: (d) async => waited.add(d),
    );
    expect(paid, isEmpty);
    expect(
      waited.fold<Duration>(Duration.zero, (t, d) => t + d),
      const Duration(minutes: 1),
    );
  });

  test('cancelada (novo resume, tela fechada) para sem resultado', () async {
    final calls = <int>[];
    var cancelled = false;
    final paid = await watchClassChargesPaid(
      watched: {'a'},
      fetch: () async {
        calls.add(calls.length);
        cancelled = true; // cancela durante a leitura
        return const [];
      },
      isCancelled: () => cancelled,
      wait: _noWait,
    );
    expect(paid, isEmpty);
    expect(calls, hasLength(1));
  });

  test('nada a esperar: nem lê', () async {
    final calls = <int>[];
    final paid = await watchClassChargesPaid(
      watched: const {},
      fetch: _reads([const []], calls),
      wait: _noWait,
    );
    expect(paid, isEmpty);
    expect(calls, isEmpty);
  });
}
