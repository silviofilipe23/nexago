import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/center_coach/domain/center_coach.dart';
import 'package:nexago_app/features/center_coach/domain/center_finance.dart';

String _day(DateTime at) =>
    '${at.year}-${at.month.toString().padLeft(2, '0')}-${at.day.toString().padLeft(2, '0')}';

CenterCoachInvoice _inv(
  String id,
  String status, {
  String due = '2026-10-30',
  DateTime? approvedAt,
  int refunded = 0,
  String method = '',
  String providerRef = '',
  DateTime? createdAt,
}) =>
    CenterCoachInvoice(
      id: id,
      status: status,
      amountCents: 10000,
      dueDate: due,
      approvedAt: approvedAt,
      refundedCents: refunded,
      method: method,
      providerRef: providerRef,
      createdAt: createdAt,
    );

void main() {
  const today = '2026-10-23';
  final now = DateTime.utc(2026, 10, 23, 15);

  test('abas: pendências com vencida/recusada primeiro; recebidos recentes',
      () {
    final all = [
      _inv('a', 'pending', due: '2026-10-28'),
      _inv('b', 'pending', due: '2026-10-10'),
      _inv('c', 'failed', due: '2026-10-29'),
      _inv('d', 'approved', approvedAt: DateTime.utc(2026, 10, 2)),
      _inv('e', 'approved', approvedAt: DateTime.utc(2026, 10, 20)),
      _inv('f', 'cancelled'),
    ];
    expect(
      centerInvoicesFor(all, CenterInvoiceTab.pending, today).map((i) => i.id),
      ['b', 'c', 'a'],
    );
    expect(
      centerInvoicesFor(all, CenterInvoiceTab.received, today).map((i) => i.id),
      ['e', 'd'],
    );
    expect(centerInvoicesFor(all, CenterInvoiceTab.all, today).length, 6);
  });

  test('etiqueta e linha de status', () {
    String line(CenterCoachInvoice i) => centerInvoiceStatusLine(
          i,
          todayKey: today,
          now: now,
          localDayKey: _day,
        );
    expect(centerInvoiceTag(_inv('x', 'pending', due: '2026-10-01'), today), (
      'Vencida',
      'red',
    ));
    expect(centerInvoiceTag(_inv('x', 'pending'), today),
        ('Aguardando', 'yellow'));
    expect(
        line(_inv('x', 'pending', due: '2026-10-22')), 'Venceu 22/10 · 1 dia');
    expect(line(_inv('x', 'pending')), 'Vence 30/10');
    expect(
      line(
        _inv(
          'x',
          'pending',
          providerRef: 'p',
          createdAt: now.subtract(const Duration(minutes: 40)),
        ),
      ),
      'Cobrança online · aguardando há 40 min',
    );
    expect(
      line(_inv('x', 'approved',
          approvedAt: DateTime.utc(2026, 10, 20, 12), method: 'pix')),
      'Pago 20/10 · Pix',
    );
    expect(
      line(_inv('x', 'approved',
          approvedAt: DateTime.utc(2026, 10, 20, 12), providerRef: 'p')),
      'Pago 20/10 · online',
    );
  });

  test('totais do mês líquidos de estorno e vencido em aberto', () {
    final t = centerFinanceTotals(
      [
        _inv('a', 'approved',
            approvedAt: DateTime.utc(2026, 10, 5), refunded: 2500),
        _inv('b', 'approved', approvedAt: DateTime.utc(2026, 9, 30)),
        _inv('c', 'refunded',
            approvedAt: DateTime.utc(2026, 10, 6), refunded: 10000),
        _inv('d', 'pending', due: '2026-10-01'),
        _inv('e', 'pending', due: '2026-11-01'),
      ],
      todayKey: today,
      localDayKey: _day,
    );
    expect(t.receivedCents, 7500);
    expect(t.overdueCents, 10000);
    expect(centerMonthLabel(today), 'outubro 2026');
  });

  test('validação da baixa manual (igual ao portal)', () {
    expect(
      centerManualConfirmError(method: null, proof: 'x', reason: 'abc'),
      'Escolha como foi pago.',
    );
    expect(
      centerManualConfirmError(method: 'pix', proof: ' a ', reason: 'abc'),
      'Informe o comprovante.',
    );
    expect(
      centerManualConfirmError(method: 'pix', proof: 'ab', reason: 'ok'),
      'Informe o motivo.',
    );
    expect(centerManualConfirmError(method: 'pix', proof: 'ab', reason: 'abc'),
        isNull);
    expect(centerPaymentMethodLabel('card'), 'Cartão');
  });
}
