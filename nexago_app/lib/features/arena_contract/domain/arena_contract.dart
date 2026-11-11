import '../../schedule_plans/domain/schedule_plan_models.dart'
    show spDouble, spInt, spMap, spMapList, spStr, spStrOrNull;

/// "Meu contrato": o contrato de mensalista que a arena registrou no CRM, visto
/// pelo próprio atleta. Espelho do payload da callable `getMyArenaContracts`
/// (`functions/src/arena-crm-athlete-model.ts`).
///
/// O mensalista não tem horário fixo: tem um banco de horas por semana (seg a
/// dom) e joga no dia e horário que quiser.

enum ArenaContractStatus { active, expiring, overdue, notRenewed, canceled }

ArenaContractStatus arenaContractStatusFrom(String raw) => switch (raw) {
      'expiring' => ArenaContractStatus.expiring,
      'overdue' => ArenaContractStatus.overdue,
      'not_renewed' => ArenaContractStatus.notRenewed,
      'canceled' => ArenaContractStatus.canceled,
      _ => ArenaContractStatus.active,
    };

enum ArenaInstallmentState { paid, late, open, future, link }

ArenaInstallmentState arenaInstallmentStateFrom(String raw) => switch (raw) {
      'paid' => ArenaInstallmentState.paid,
      'late' => ArenaInstallmentState.late,
      'link' => ArenaInstallmentState.link,
      'future' => ArenaInstallmentState.future,
      _ => ArenaInstallmentState.open,
    };

class ArenaContractInstallment {
  const ArenaContractInstallment({
    required this.number,
    required this.month,
    required this.dueDate,
    required this.amountReais,
    required this.state,
  });

  factory ArenaContractInstallment.fromMap(Map<String, dynamic> m) =>
      ArenaContractInstallment(
        number: spInt(m['number'], 1),
        month: spStr(m['month']),
        dueDate: spStr(m['dueDate']),
        amountReais: spDouble(m['amountReais']),
        state: arenaInstallmentStateFrom(spStr(m['state'])),
      );

  final int number;

  /// `YYYY-MM`.
  final String month;

  /// `YYYY-MM-DD`.
  final String dueDate;
  final double amountReais;
  final ArenaInstallmentState state;
}

class ArenaContractPayment {
  const ArenaContractPayment({
    required this.paidOn,
    required this.amountReais,
    required this.installments,
    required this.method,
  });

  factory ArenaContractPayment.fromMap(Map<String, dynamic> m) =>
      ArenaContractPayment(
        paidOn: spStr(m['paidOn']),
        amountReais: spDouble(m['amountReais']),
        installments: spInt(m['installments'], 1),
        method: spStr(m['method'], 'Na arena'),
      );

  final String paidOn;
  final double amountReais;
  final int installments;

  /// Já em português ("Pix online", "Dinheiro", "Na arena").
  final String method;
}

/// Link de pagamento aberto pela arena (Pix ou cartão no Asaas): pago, a
/// parcela dá baixa sozinha.
class ArenaContractPayLink {
  const ArenaContractPayLink({
    required this.invoiceUrl,
    required this.amountReais,
    required this.installments,
  });

  final String invoiceUrl;
  final double amountReais;
  final int installments;
}

class ArenaContract {
  const ArenaContract({
    required this.id,
    required this.arenaId,
    required this.arenaName,
    required this.planName,
    required this.period,
    required this.dueDay,
    required this.weeklyHours,
    required this.monthlyPriceReais,
    required this.startDate,
    required this.autoRenew,
    required this.status,
    required this.overdueCount,
    required this.overdueReais,
    required this.paidInstallments,
    this.arenaLogoUrl,
    this.arenaWhatsapp,
    this.endDate,
    this.nextDueDate,
    this.overdueSince,
    this.totalInstallments,
    this.installments = const [],
    this.payLink,
    this.payments = const [],
    this.weekHours = const [],
  });

  factory ArenaContract.fromMap(Map<String, dynamic> m) {
    final link = spMap(m['payLink']);
    final url = spStr(link['invoiceUrl']);
    final total = m['totalInstallments'];
    return ArenaContract(
      id: spStr(m['id']),
      arenaId: spStr(m['arenaId']),
      arenaName: spStr(m['arenaName'], 'Arena'),
      arenaLogoUrl: spStrOrNull(m['arenaLogoUrl']),
      arenaWhatsapp: spStrOrNull(m['arenaWhatsapp']),
      planName: spStr(m['planName'], 'Plano'),
      period: spStr(m['period'], 'monthly'),
      dueDay: spInt(m['dueDay'], 5),
      weeklyHours: spDouble(m['weeklyHours'], 1),
      monthlyPriceReais: spDouble(m['monthlyPriceReais']),
      startDate: spStr(m['startDate']),
      endDate: spStrOrNull(m['endDate']),
      autoRenew: m['autoRenew'] == true,
      status: arenaContractStatusFrom(spStr(m['status'])),
      nextDueDate: spStrOrNull(m['nextDueDate']),
      overdueCount: spInt(m['overdueCount']),
      overdueReais: spDouble(m['overdueReais']),
      overdueSince: spStrOrNull(m['overdueSince']),
      paidInstallments: spInt(m['paidInstallments']),
      totalInstallments: total is num ? total.toInt() : null,
      installments: [
        for (final i in spMapList(m['installments']))
          ArenaContractInstallment.fromMap(i),
      ],
      payLink: url.isEmpty
          ? null
          : ArenaContractPayLink(
              invoiceUrl: url,
              amountReais: spDouble(link['amountReais']),
              installments: spInt(link['installments'], 1),
            ),
      payments: [
        for (final p in spMapList(m['payments']))
          ArenaContractPayment.fromMap(p),
      ],
      weekHours: [
        for (final h in (m['weekHours'] is List ? m['weekHours'] as List : []))
          h is num ? h.toDouble() : 0,
      ],
    );
  }

  final String id;
  final String arenaId;
  final String arenaName;
  final String? arenaLogoUrl;

  /// Só dígitos com DDI (`5562…`), pronto para o wa.me.
  final String? arenaWhatsapp;
  final String planName;

  /// `monthly` · `quarterly` · `semiannual` · `annual`.
  final String period;
  final int dueDay;

  /// Banco de horas da semana (seg a dom), de meia em meia hora.
  final double weeklyHours;
  final double monthlyPriceReais;
  final String startDate;

  /// Fim do período atual; `null` = renova sozinho, sem fim.
  final String? endDate;
  final bool autoRenew;
  final ArenaContractStatus status;
  final String? nextDueDate;
  final int overdueCount;
  final double overdueReais;

  /// Vencimento da parcela atrasada mais antiga.
  final String? overdueSince;
  final int paidInstallments;
  final int? totalInstallments;
  final List<ArenaContractInstallment> installments;
  final ArenaContractPayLink? payLink;
  final List<ArenaContractPayment> payments;

  /// Horas reservadas por semana, 8 semanas; a última é a corrente (conta o
  /// que já está reservado até domingo).
  final List<double> weekHours;

  bool get isOverdue => overdueReais > 0;

  /// Horas reservadas nesta semana.
  double get hoursThisWeek => weekHours.isEmpty ? 0 : weekHours.last;

  /// O que sobra do banco nesta semana (nunca negativo).
  double get hoursLeftThisWeek {
    final left = weeklyHours - hoursThisWeek;
    return left > 0 ? left : 0;
  }

  /// Valor do botão de pagar: o link, se cobre o atraso; senão o atraso.
  double get amountToPay => payLink?.amountReais ?? overdueReais;
}

class MyArenaContracts {
  const MyArenaContracts({this.today = '', this.contracts = const []});

  factory MyArenaContracts.fromMap(Map<String, dynamic> m) => MyArenaContracts(
        today: spStr(m['today']),
        contracts: [
          for (final c in spMapList(m['contracts'])) ArenaContract.fromMap(c),
        ],
      );

  /// `YYYY-MM-DD` no fuso do evento (o "hoje" do servidor).
  final String today;
  final List<ArenaContract> contracts;

  ArenaContract? byId(String? id) {
    if (contracts.isEmpty) return null;
    for (final c in contracts) {
      if (c.id == id) return c;
    }
    return contracts.first;
  }
}
