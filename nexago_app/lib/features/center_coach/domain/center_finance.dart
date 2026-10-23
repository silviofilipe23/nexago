import 'center_coach.dart';
import 'center_students.dart';

/// G15 Cobranças e G16 Confirmar pagamento manual no app (canvas "NexaGO
/// Centro de Treinamento", `ct-gestao-b.jsx`). Mesma regra de ouro do portal:
/// só é recebido o que o provedor aprovou ou o que foi confirmado à mão com
/// comprovante e motivo (`invoices.actions.ts › confirmManual`).

enum CenterInvoiceTab { pending, received, all }

const Map<CenterInvoiceTab, String> kCenterInvoiceTabLabels = {
  CenterInvoiceTab.pending: 'Pendências',
  CenterInvoiceTab.received: 'Recebidos',
  CenterInvoiceTab.all: 'Todas',
};

/// Formas de pagamento da baixa manual: valor gravado, rótulo do botão e o
/// rótulo curto que vai no evento/auditoria (igual ao `PAYMENT_METHOD_LABELS`).
const List<(String, String, String)> kCenterManualMethods = [
  ('pix', 'Pix direto ao centro', 'Pix'),
  ('cash', 'Dinheiro', 'Dinheiro'),
  ('card', 'Cartão na maquininha', 'Cartão'),
  ('transfer', 'Transferência', 'Transferência'),
  ('other', 'Outro', 'Outro'),
];

String centerPaymentMethodLabel(String method) {
  for (final (v, _, short) in kCenterManualMethods) {
    if (v == method) return short;
  }
  return '';
}

/// Precisa de ação: pendente (no prazo ou vencida), recusada ou contestada.
bool centerInvoiceIsOpen(CenterCoachInvoice i) =>
    i.status == 'pending' || i.status == 'failed' || i.status == 'disputed';

bool centerInvoiceInTab(CenterCoachInvoice i, CenterInvoiceTab tab) =>
    switch (tab) {
      CenterInvoiceTab.pending => centerInvoiceIsOpen(i),
      CenterInvoiceTab.received =>
        i.status == 'approved' || i.status == 'refunded',
      CenterInvoiceTab.all => true,
    };

/// Ordem da lista: nas pendências, vencidas/recusadas/contestadas primeiro e
/// depois pelo vencimento; nos recebidos, o pagamento mais recente primeiro.
List<CenterCoachInvoice> centerInvoicesFor(
  Iterable<CenterCoachInvoice> all,
  CenterInvoiceTab tab,
  String todayKey,
) {
  final list = [
    for (final i in all)
      if (centerInvoiceInTab(i, tab)) i,
  ];
  int urgency(CenterCoachInvoice i) {
    final st = centerInvoiceDisplayStatus(i, todayKey);
    return st == 'late' || st == 'failed' || st == 'disputed' ? 0 : 1;
  }

  list.sort((a, b) {
    if (tab == CenterInvoiceTab.received) {
      final x = a.approvedAt, y = b.approvedAt;
      if (x != null && y != null) return y.compareTo(x);
      return b.dueDate.compareTo(a.dueDate);
    }
    if (tab == CenterInvoiceTab.pending) {
      final u = urgency(a) - urgency(b);
      if (u != 0) return u;
      return a.dueDate.compareTo(b.dueDate);
    }
    return b.dueDate.compareTo(a.dueDate);
  });
  return list;
}

/// Etiqueta (texto, tom) da cobrança.
(String, String) centerInvoiceTag(CenterCoachInvoice i, String todayKey) =>
    switch (centerInvoiceDisplayStatus(i, todayKey)) {
      'late' => ('Vencida', 'red'),
      'failed' => ('Recusada', 'red'),
      'disputed' => ('Contestada', 'red'),
      'approved' => ('Paga', 'green'),
      'refunded' => ('Estornada', 'mute'),
      'cancelled' => ('Cancelada', 'mute'),
      _ => ('Aguardando', 'yellow'),
    };

int _daysBetween(String from, String to) {
  final a = DateTime.tryParse(from), b = DateTime.tryParse(to);
  if (a == null || b == null) return 0;
  return DateTime.utc(
    b.year,
    b.month,
    b.day,
  ).difference(DateTime.utc(a.year, a.month, a.day)).inDays;
}

/// "há 40 min", "há 2h", "há 3 dias".
String centerAgo(DateTime from, DateTime now) {
  final m = now.difference(from).inMinutes;
  if (m < 60) return 'há ${m < 1 ? 1 : m} min';
  final h = m ~/ 60;
  if (h < 24) return 'há ${h}h';
  final d = h ~/ 24;
  return d == 1 ? 'há 1 dia' : 'há $d dias';
}

/// Linha de baixo da cobrança: "Pix gerado · aguardando há 2h",
/// "Venceu 12/10 · 8 dias", "Pago 20/10 · Dinheiro"…
String centerInvoiceStatusLine(
  CenterCoachInvoice i, {
  required String todayKey,
  required DateTime now,
  required String Function(DateTime at) localDayKey,
}) {
  final st = centerInvoiceDisplayStatus(i, todayKey);
  switch (st) {
    case 'late':
      final d = _daysBetween(i.dueDate, todayKey);
      return 'Venceu ${centerDayMonth(i.dueDate)} · '
          '${d == 1 ? '1 dia' : '$d dias'}';
    case 'pending':
      if (i.providerRef.isNotEmpty && i.createdAt != null) {
        return 'Cobrança online · aguardando ${centerAgo(i.createdAt!, now)}';
      }
      return 'Vence ${centerDayMonth(i.dueDate)}';
    case 'failed':
      return 'Pagamento recusado no provedor';
    case 'disputed':
      return 'Contestação aberta no provedor';
    case 'approved':
      final method = centerPaymentMethodLabel(i.method);
      final day = i.approvedAt == null
          ? ''
          : ' ${centerDayMonth(localDayKey(i.approvedAt!))}';
      final online = i.method.isEmpty && i.providerRef.isNotEmpty;
      return [
        'Pago$day',
        if (method.isNotEmpty) method else if (online) 'online',
        if (i.refundedCents > 0) 'estorno parcial',
      ].join(' · ');
    case 'refunded':
      return 'Estornada';
    default:
      return 'Cancelada';
  }
}

/// Números do topo: recebido no mês (líquido de estornos) e vencido em aberto.
({int receivedCents, int overdueCents}) centerFinanceTotals(
  Iterable<CenterCoachInvoice> all, {
  required String todayKey,
  required String Function(DateTime at) localDayKey,
}) {
  final month = todayKey.substring(0, 7);
  var received = 0, overdue = 0;
  for (final i in all) {
    if ((i.status == 'approved' || i.status == 'refunded') &&
        i.approvedAt != null &&
        localDayKey(i.approvedAt!).startsWith(month)) {
      received += i.amountCents - i.refundedCents;
    }
    if (centerInvoiceDisplayStatus(i, todayKey) == 'late') {
      overdue += i.amountCents;
    }
  }
  return (receivedCents: received < 0 ? 0 : received, overdueCents: overdue);
}

/// "outubro 2026".
String centerMonthLabel(String todayKey) {
  const months = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  final p = todayKey.split('-');
  final m = p.length > 1 ? int.tryParse(p[1]) : null;
  if (m == null || m < 1 || m > 12) return todayKey;
  return '${months[m - 1]} ${p[0]}';
}

/// Erro do formulário da baixa manual (`null` = pode confirmar). Mesmas
/// regras do portal: comprovante com 2+ letras e motivo com 3+.
String? centerManualConfirmError({
  required String? method,
  required String proof,
  required String reason,
}) {
  if (method == null) return 'Escolha como foi pago.';
  if (proof.trim().length < 2) return 'Informe o comprovante.';
  if (reason.trim().length < 3) return 'Informe o motivo.';
  return null;
}
