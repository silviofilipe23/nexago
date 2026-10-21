import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../../core/time/nexago_event_timezone.dart';
import '../../../professor_mode/domain/professor_lessons.dart';

/// Pagamento de aula do atleta para o professor independente (B17/B19) —
/// `professorCharges/{id}` lido pelo próprio aluno (a rule deixa quando
/// `athleteId` é ele). Só functions escrevem; o webhook do Asaas grava
/// `paidAt`, `billingType` e `receipt` quando vira `paid`.
class LessonPayment {
  const LessonPayment({
    required this.id,
    required this.professorUid,
    required this.professorName,
    required this.athleteId,
    required this.studentName,
    required this.description,
    required this.amountReais,
    required this.dueDate,
    required this.status,
    this.period,
    this.recurring = false,
    this.billingType,
    this.paymentId,
    this.paidAt,
    this.cardLast4,
    this.cardBrand,
    this.receiptUrl,
    this.invoiceNumber,
  });

  factory LessonPayment.fromMap(String id, Map<String, Object?> map) {
    final receipt = map['receipt'];
    final r = receipt is Map ? receipt : const {};
    return LessonPayment(
      id: id,
      professorUid: _str(map['professorUid']),
      professorName: _str(map['professorName'], 'Professor'),
      athleteId: _str(map['athleteId']),
      studentName: _str(map['studentName'], 'Aluno'),
      description: _str(map['description'], 'Aula'),
      amountReais: _num(map['amountReais']) ?? 0,
      dueDate: _str(map['dueDate']),
      period: _strOrNull(map['period']),
      recurring: map['recurring'] == true,
      status: _str(map['status'], 'open'),
      billingType: _strOrNull(map['billingType']),
      paymentId: _strOrNull(map['paymentId']),
      paidAt: _date(map['paidAt']),
      cardLast4: _strOrNull(r['cardLast4']),
      cardBrand: _strOrNull(r['cardBrand']),
      receiptUrl: _httpsOrNull(r['receiptUrl']),
      invoiceNumber: _strOrNull(r['invoiceNumber']),
    );
  }

  final String id;
  final String professorUid;
  final String professorName;
  final String athleteId;
  final String studentName;
  final String description;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String dueDate;

  /// `YYYY-MM` do vencimento.
  final String? period;
  final bool recurring;

  /// `creating`, `open`, `paid`, `canceled`, `refunded`, `failed`.
  final String status;

  /// `PIX`, `CREDIT_CARD`, `DEBIT_CARD`, `BOLETO`… (Asaas).
  final String? billingType;
  final String? paymentId;
  final DateTime? paidAt;
  final String? cardLast4;
  final String? cardBrand;

  /// Comprovante oficial do Asaas (`transactionReceiptUrl`), só https.
  final String? receiptUrl;
  final String? invoiceNumber;

  bool get isPaid => status == 'paid';
}

/// Recorrência do aluno na carteira (`professors/{uid}/students/{athleteId}`
/// `.recurring`) — de onde sai a "Próxima cobrança".
class LessonPaymentRecurrence {
  const LessonPaymentRecurrence({required this.dueDay, this.lastPeriod});

  /// `null` = sem recorrência (o professor parou ou nunca ligou).
  static LessonPaymentRecurrence? fromStudentMap(Map<String, Object?>? map) {
    final raw = map?['recurring'];
    if (raw is! Map) return null;
    final day = _num(raw['dueDay'])?.toInt() ?? 0;
    if (day < 1 || day > 31) return null;
    return LessonPaymentRecurrence(
      dueDay: day,
      lastPeriod: _strOrNull(raw['lastPeriod']),
    );
  }

  final int dueDay;

  /// `YYYY-MM` da última cobrança gerada.
  final String? lastPeriod;
}

// ── rótulos ───────────────────────────────────────────────────────────────

const _monthsShort = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

const _monthsLong = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', //
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const _weekdaysShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

String _two(int v) => v.toString().padLeft(2, '0');

/// "Mensal 8 aulas · novembro": o mês de referência (do vencimento) quando a
/// descrição ainda não o traz.
String lessonPaymentTitle(LessonPayment p) {
  final month = _monthOfPeriod(p.period ?? _periodOfDay(p.dueDate));
  if (month == null) return p.description;
  if (p.description.toLowerCase().contains(month)) return p.description;
  return '${p.description} · $month';
}

/// "Pix" / "Cartão •••• 4471" / "Boleto".
String lessonPaymentMethodLabel(LessonPayment p) {
  switch (p.billingType?.toUpperCase()) {
    case 'PIX':
      return 'Pix';
    case 'CREDIT_CARD':
    case 'DEBIT_CARD':
      final last4 = p.cardLast4;
      return last4 == null ? 'Cartão' : 'Cartão •••• $last4';
    case 'BOLETO':
      return 'Boleto';
    default:
      return 'Online';
  }
}

/// Linha miúda debaixo de "Pago com" (`null` = sem linha).
String? lessonPaymentMethodHint(LessonPayment p) {
  switch (p.billingType?.toUpperCase()) {
    case 'PIX':
      return 'Compensado na hora';
    case 'CREDIT_CARD':
      final brand = _brandLabel(p.cardBrand);
      return brand == null ? 'Crédito' : '$brand · crédito';
    case 'DEBIT_CARD':
      final brand = _brandLabel(p.cardBrand);
      return brand == null ? 'Débito' : '$brand · débito';
    case 'BOLETO':
      return 'Compensado pelo banco';
    default:
      return null;
  }
}

String? _brandLabel(String? raw) {
  final b = raw?.trim().toUpperCase() ?? '';
  if (b.isEmpty || b == 'UNKNOWN') return null;
  return switch (b) {
    'MASTERCARD' => 'Mastercard',
    'VISA' => 'Visa',
    'ELO' => 'Elo',
    'AMEX' => 'Amex',
    'HIPERCARD' => 'Hipercard',
    _ => b[0] + b.substring(1).toLowerCase(),
  };
}

/// "21 out · 10:32" no fuso do evento (o `paidAt` chega em UTC).
String lessonPaymentShortDate(DateTime? instant) {
  if (instant == null) return '—';
  final d = toNexagoEventLocal(instant);
  return '${_two(d.day)} ${_monthsShort[d.month - 1]} · '
      '${_two(d.hour)}:${_two(d.minute)}';
}

/// "21 out 2026 · 10:32".
String lessonPaymentLongDate(DateTime? instant) {
  if (instant == null) return '—';
  final d = toNexagoEventLocal(instant);
  return '${_two(d.day)} ${_monthsShort[d.month - 1]} ${d.year} · '
      '${_two(d.hour)}:${_two(d.minute)}';
}

/// Id do Asaas encurtado: `pay_8x2kq0e2e7c21` → "8X2···7C21".
String lessonPaymentShortId(String? raw) {
  final id = (raw ?? '').replaceFirst(RegExp(r'^pay_'), '').toUpperCase();
  if (id.isEmpty) return '—';
  if (id.length <= 10) return id;
  return '${id.substring(0, 3)}···${id.substring(id.length - 4)}';
}

/// Id completo para copiar (sem o prefixo `pay_`).
String lessonPaymentFullId(String? raw) =>
    (raw ?? '').replaceFirst(RegExp(r'^pay_'), '').toUpperCase();

/// "10 dez": o mês seguinte ao último gerado (ou ao desta cobrança), no dia
/// de vencimento da recorrência — dia 31 em mês curto cai no último dia.
/// `null` sem recorrência.
String? lessonPaymentNextChargeLabel(
  LessonPayment p,
  LessonPaymentRecurrence? recurrence,
) {
  if (recurrence == null) return null;
  final base =
      _latestPeriod(recurrence.lastPeriod, p.period ?? _periodOfDay(p.dueDate));
  if (base == null) return null;
  var year = base.$1;
  var month = base.$2 + 1;
  if (month > 12) {
    month = 1;
    year++;
  }
  final lastDay = DateTime(year, month + 1, 0).day;
  final day = recurrence.dueDay > lastDay ? lastDay : recurrence.dueDay;
  return '${_two(day)} ${_monthsShort[month - 1]}';
}

(int, int)? _latestPeriod(String? a, String? b) {
  final pa = _parsePeriod(a);
  final pb = _parsePeriod(b);
  if (pa == null) return pb;
  if (pb == null) return pa;
  return (pa.$1 * 12 + pa.$2) >= (pb.$1 * 12 + pb.$2) ? pa : pb;
}

(int, int)? _parsePeriod(String? raw) {
  final parts = (raw ?? '').split('-');
  if (parts.length < 2) return null;
  final y = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (y == null || m == null || m < 1 || m > 12) return null;
  return (y, m);
}

String? _periodOfDay(String dayKey) =>
    dayKey.length >= 7 ? dayKey.substring(0, 7) : null;

String? _monthOfPeriod(String? period) {
  final p = _parsePeriod(period);
  return p == null ? null : _monthsLong[p.$2 - 1];
}

// ── próxima aula ──────────────────────────────────────────────────────────

/// Aulas de [now] em diante, da mais próxima para a mais distante.
List<ProfessorLesson> lessonPaymentUpcoming(
  List<ProfessorLesson> lessons,
  DateTime now,
) {
  final local = toNexagoEventLocal(now);
  final today = '${local.year}-${_two(local.month)}-${_two(local.day)}';
  final clock = '${_two(local.hour)}:${_two(local.minute)}';
  final out = [
    for (final l in lessons)
      if (l.date.compareTo(today) > 0 ||
          (l.date == today && l.startTime.compareTo(clock) >= 0))
        l,
  ]..sort((a, b) {
      final byDate = a.date.compareTo(b.date);
      return byDate != 0 ? byDate : a.startTime.compareTo(b.startTime);
    });
  return out;
}

/// "Ter, 04 nov · 19:00 · Quadra 2".
String lessonPaymentLessonLabel(ProfessorLesson l) {
  final parts = l.date.split('-');
  final labelParts = <String>[];
  if (parts.length == 3) {
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    final d = int.tryParse(parts[2]);
    if (y != null && m != null && d != null && m >= 1 && m <= 12) {
      final weekday = DateTime(y, m, d).weekday;
      labelParts.add(
          '${_weekdaysShort[weekday - 1]}, ${_two(d)} ${_monthsShort[m - 1]}');
    }
  }
  if (l.startTime.isNotEmpty) labelParts.add(l.startTime);
  if (l.courtName.isNotEmpty) labelParts.add(l.courtName);
  return labelParts.join(' · ');
}

/// Texto do "Compartilhar" do comprovante.
String lessonPaymentShareText(LessonPayment p) {
  final lines = [
    'Comprovante de pagamento · nexaGO',
    '${lessonPaymentTitle(p)} — Prof. ${p.professorName}',
    'Valor: ${_brl(p.amountReais)}',
    'Pago em ${lessonPaymentLongDate(p.paidAt)} · ${lessonPaymentMethodLabel(p)}',
    if (p.paymentId != null)
      'ID da transação: ${lessonPaymentFullId(p.paymentId)}',
    if (p.receiptUrl != null) p.receiptUrl!,
  ];
  return lines.join('\n');
}

String _brl(double v) {
  final cents = (v * 100).round();
  final reais = cents ~/ 100;
  final rest = cents % 100;
  final digits = reais.toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write('.');
    buf.write(digits[i]);
  }
  return rest == 0 ? 'R\$ $buf' : 'R\$ $buf,${_two(rest)}';
}

/// Valor em destaque: "R$ 880" (sem centavos) ou "R$ 373,33".
String lessonPaymentAmount(double v) => _brl(v);

// ── leitura ───────────────────────────────────────────────────────────────

String _str(Object? v, [String fallback = '']) {
  final s = v is String ? v.trim() : '';
  return s.isEmpty ? fallback : s;
}

String? _strOrNull(Object? v) {
  final s = v is String ? v.trim() : '';
  return s.isEmpty ? null : s;
}

String? _httpsOrNull(Object? v) {
  final s = _strOrNull(v);
  if (s == null) return null;
  final uri = Uri.tryParse(s);
  return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty ? s : null;
}

double? _num(Object? v) => v is num ? v.toDouble() : null;

DateTime? _date(Object? v) {
  if (v is Timestamp) return v.toDate();
  if (v is DateTime) return v;
  return null;
}
