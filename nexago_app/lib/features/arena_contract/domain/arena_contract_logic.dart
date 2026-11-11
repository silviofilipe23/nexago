import 'arena_contract.dart';

/// Rótulos e contas da tela "Meu contrato" — tudo puro, testável sem widget.

const _monthShort = [
  'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', //
  'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
];

/// "3h", "1h30", "30min"; média arredonda para 15 min.
String arenaContractHoursLabel(double hours) {
  final total = ((hours * 60) / 15).round() * 15;
  final h = total ~/ 60;
  final m = total % 60;
  if (h == 0) return m == 0 ? '0h' : '${m}min';
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

String arenaContractPeriodLabel(String period) => switch (period) {
      'quarterly' => 'Trimestral',
      'semiannual' => 'Semestral',
      'annual' => 'Anual',
      _ => 'Mensal',
    };

/// `2026-11-15` → `15/11`.
String arenaContractDayMonth(String? dateKey) {
  final d = dateKey ?? '';
  if (d.length < 10) return '';
  return '${d.substring(8, 10)}/${d.substring(5, 7)}';
}

/// `2026-11` → `NOV`.
String arenaContractMonthShort(String monthKey) {
  final m = int.tryParse(monthKey.length >= 7 ? monthKey.substring(5, 7) : '');
  if (m == null || m < 1 || m > 12) return monthKey;
  return _monthShort[m - 1];
}

/// Selo do topo: "Em dia", "2 em atraso", "Termina 14/12".
String arenaContractStatusLabel(ArenaContract c) {
  switch (c.status) {
    case ArenaContractStatus.overdue:
      return c.overdueCount == 1
          ? '1 em atraso'
          : '${c.overdueCount} em atraso';
    case ArenaContractStatus.expiring:
      return c.endDate == null
          ? 'Terminando'
          : 'Termina ${arenaContractDayMonth(c.endDate)}';
    case ArenaContractStatus.notRenewed:
      return 'Encerrado';
    case ArenaContractStatus.canceled:
      return 'Cancelado';
    case ArenaContractStatus.active:
      return 'Em dia';
  }
}

/// "R$ 300/mês · vence todo dia 15".
String arenaContractPriceLine(ArenaContract c, String money) =>
    '$money/mês · vence todo dia ${c.dueDay.toString().padLeft(2, '0')}';

/// Chips do topo: período, fim ou renovação, horas por semana.
List<String> arenaContractTags(ArenaContract c) => [
      arenaContractPeriodLabel(c.period),
      if (c.autoRenew)
        'Renova sozinho'
      else if (c.endDate != null)
        'até ${arenaContractDayMonth(c.endDate)}',
      '${arenaContractHoursLabel(c.weeklyHours)} por semana',
    ];

/// Rótulo da parcela no quadradinho: "Paga", "Atrasada", "Vence 15", "Futura".
String arenaInstallmentLabel(ArenaContractInstallment i) => switch (i.state) {
      ArenaInstallmentState.paid => 'Paga',
      ArenaInstallmentState.late => 'Atrasada',
      // No link de pagamento aberto pela arena.
      ArenaInstallmentState.link => 'A pagar',
      ArenaInstallmentState.open =>
        'Vence ${i.dueDate.length >= 10 ? i.dueDate.substring(8, 10) : ''}',
      ArenaInstallmentState.future => 'Futura',
    };

/// "2 de 3 pagas" (período fechado) ou "6 pagas" (renova sozinho).
String arenaContractPaidLine(ArenaContract c) {
  final total = c.totalInstallments;
  if (total == null) {
    return c.paidInstallments == 1 ? '1 paga' : '${c.paidInstallments} pagas';
  }
  return '${c.paidInstallments} de $total pagas';
}

/// "15/11 · 3ª de 3 parcelas" — a parcela que vem.
String? arenaContractNextLine(ArenaContract c) {
  final next = c.nextDueDate;
  if (next == null) return null;
  final number = c.paidInstallments + c.overdueCount + 1;
  final total = c.totalInstallments;
  final which =
      total == null ? '$numberª parcela' : '$numberª de $total parcelas';
  return '${arenaContractDayMonth(next)} · $which';
}

/// Linha do banco de horas: "de 3h · sobram 1h30" / "de 3h · banco usado".
String arenaContractHoursLine(ArenaContract c) {
  final left = c.hoursLeftThisWeek;
  final total = arenaContractHoursLabel(c.weeklyHours);
  return left > 0
      ? 'de $total · sobram ${arenaContractHoursLabel(left)}'
      : 'de $total · banco da semana usado';
}

/// Fração (0–1) do banco usado nesta semana, para a barra.
double arenaContractHoursFraction(ArenaContract c) {
  if (c.weeklyHours <= 0) return 0;
  final f = c.hoursThisWeek / c.weeklyHours;
  return f.clamp(0, 1).toDouble();
}

/// Mensagem pronta para o WhatsApp da arena.
String arenaContractWhatsappMessage(ArenaContract c, String money) {
  if (c.isOverdue) {
    return 'Oi! Sou mensalista do ${c.planName}. Vi no app que tenho $money em '
        'aberto e queria acertar.';
  }
  return 'Oi! Sou mensalista do ${c.planName} e tenho uma dúvida sobre o meu contrato.';
}

/// Caminho de Meu contrato já no contrato certo.
String arenaContractLocation(String? contractId,
    {String base = '/meu-contrato'}) {
  final id = contractId?.trim() ?? '';
  return id.isEmpty ? base : '$base?id=${Uri.encodeQueryComponent(id)}';
}
