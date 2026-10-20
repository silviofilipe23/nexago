/// Mensalidade de aula em aberto do atleta — espelha um item de
/// `getMyClassCharges` (`functions/src/arena-class-athlete-charges.ts`).
/// `arenaClassCharges` é só da equipe da arena; o atleta lê pela callable. O
/// link da fatura só vem quando dá para pagar online — cobrança manual é só
/// informativa (o aluno paga direto à arena).
class ClassChargeEntry {
  const ClassChargeEntry({
    required this.chargeId,
    required this.arenaId,
    required this.arenaName,
    required this.description,
    required this.amountReais,
    required this.dueDate,
    required this.overdue,
    required this.payment,
    this.invoiceUrl,
  });

  final String chargeId;
  final String arenaId;
  final String arenaName;
  final String description;
  final double amountReais;

  /// `YYYY-MM-DD`.
  final String dueDate;
  final bool overdue;

  /// `online` (fatura pronta), `preparing` (link sendo gerado) ou `manual`.
  final String payment;

  /// Fatura do Asaas (PIX ou cartão) — só http(s).
  final String? invoiceUrl;

  bool get canPayOnline => invoiceUrl != null;

  factory ClassChargeEntry.fromMap(Map<String, Object?> map) {
    String s(String key, [String fallback = '']) {
      final v = map[key];
      return v is String ? v : fallback;
    }

    final amount = map['amountReais'];
    final url = Uri.tryParse(s('invoiceUrl').trim());
    final validUrl = url != null &&
        (url.scheme == 'https' || url.scheme == 'http') &&
        url.host.isNotEmpty;
    return ClassChargeEntry(
      chargeId: s('chargeId'),
      arenaId: s('arenaId'),
      arenaName: s('arenaName', 'Arena'),
      description: s('description', 'Mensalidade'),
      amountReais: amount is num ? amount.toDouble() : 0,
      dueDate: s('dueDate'),
      overdue: map['overdue'] == true,
      payment: s('payment', 'manual'),
      invoiceUrl: validUrl ? url.toString() : null,
    );
  }
}

/// "Vence 25/10" / "Venceu 05/10" (sem data: "Em aberto").
String classChargeDueLabel(ClassChargeEntry c) {
  final parts = c.dueDate.split('-');
  if (parts.length != 3) return 'Em aberto';
  final day = '${parts[2]}/${parts[1]}';
  return c.overdue ? 'Venceu $day' : 'Vence $day';
}

/// Linha no lugar do botão "Pagar" quando não há fatura (`null` = tem botão).
String? classChargeInfoLabel(ClassChargeEntry c) {
  if (c.canPayOnline) return null;
  if (c.payment == 'preparing') return 'Link de pagamento em preparo';
  return 'Pagamento direto com a arena';
}
