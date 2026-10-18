import 'package:flutter/foundation.dart';

/// NexaSquad — o que o próprio atleta vê do programa de embaixadores.
///
/// Espelha as respostas de `functions/src/squad-athlete.ts` (`getMySquad`,
/// `getSquadRanking`, `viewSquadInvite`) e de `checkSquadCode`. O atleta vê
/// pontos, nível, ganhos e o pacote do nível; Score, ROI e ranking interno
/// são só do backoffice e nunca chegam aqui.

enum SquadTier { ath, amb, pro, cap }

SquadTier squadTierOf(Object? raw) => switch (raw) {
  'amb' => SquadTier.amb,
  'pro' => SquadTier.pro,
  'cap' => SquadTier.cap,
  _ => SquadTier.ath,
};

extension SquadTierLabel on SquadTier {
  String get label => switch (this) {
    SquadTier.ath => 'Athlete',
    SquadTier.amb => 'Ambassador',
    SquadTier.pro => 'Pro Ambassador',
    SquadTier.cap => 'Captain',
  };
}

enum SquadRegistrationsType { discount, freePerMonth, freeUnlimited }

/// Pacote do nível, como o servidor o entrega ao atleta (sem custo do kit,
/// teto de cachê nem o teto oculto das inscrições grátis).
@immutable
class SquadPackage {
  const SquadPackage({
    required this.tier,
    required this.commissionMin,
    required this.commissionMax,
    required this.followerDiscountPct,
    required this.registrationsType,
    required this.registrationsValue,
    required this.kit,
    required this.events,
    required this.partnerHalfOff,
    required this.campaignFee,
    required this.tournamentOriginBonusCents,
  });

  final SquadTier tier;

  /// Comissão exata (`min == max`) ou a faixa do Pro antes do contrato.
  final num commissionMin;
  final num commissionMax;
  final num followerDiscountPct;
  final SquadRegistrationsType registrationsType;

  /// `null` em [SquadRegistrationsType.freeUnlimited].
  final int? registrationsValue;
  final String kit;
  final String events;
  final bool partnerHalfOff;
  final bool campaignFee;
  final int? tournamentOriginBonusCents;

  bool get commissionIsRange => commissionMax != commissionMin;

  factory SquadPackage.fromMap(Map<String, Object?> m) {
    final commission = m['commissionPct'];
    num min = 0;
    num max = 0;
    if (commission is List && commission.length == 2) {
      min = _num(commission[0]);
      max = _num(commission[1]);
    } else {
      min = max = _num(commission);
    }
    final reg = _map(m['registrations']);
    final type = switch (reg['type']) {
      'freePerMonth' => SquadRegistrationsType.freePerMonth,
      'freeUnlimited' => SquadRegistrationsType.freeUnlimited,
      _ => SquadRegistrationsType.discount,
    };
    return SquadPackage(
      tier: squadTierOf(m['tier']),
      commissionMin: min,
      commissionMax: max,
      followerDiscountPct: _num(m['followerDiscountPct']),
      registrationsType: type,
      registrationsValue: type == SquadRegistrationsType.freeUnlimited
          ? null
          : _num(reg['value']).toInt(),
      kit: _str(m['kit']),
      events: _str(m['events']),
      partnerHalfOff: m['partnerHalfOff'] == true,
      campaignFee: m['campaignFee'] == true,
      tournamentOriginBonusCents: m['tournamentOriginBonusCents'] is num
          ? (m['tournamentOriginBonusCents'] as num).toInt()
          : null,
    );
  }
}

@immutable
class SquadEarnings {
  const SquadEarnings({
    required this.totalCents,
    required this.availableCents,
    required this.pendingCents,
    required this.receivedCents,
    required this.revenueCents,
    required this.nextPayoutDate,
    required this.minPayoutCents,
  });

  /// Pendente + liberada + paga: tudo que o código gerou no ciclo.
  final int totalCents;

  /// Liberada e ainda não repassada (com ajustes de reembolso descontados).
  final int availableCents;

  /// Aguardando o pagamento da inscrição.
  final int pendingCents;

  /// O que já caiu na carteira neste ciclo.
  final int receivedCents;

  /// Valor das inscrições confirmadas com o código.
  final int revenueCents;

  /// Data civil (`YYYY-MM-DD`) do repasse em aberto.
  final String nextPayoutDate;

  /// Abaixo disto o disponível acumula para o repasse seguinte.
  final int minPayoutCents;

  factory SquadEarnings.fromMap(Map<String, Object?> m) => SquadEarnings(
    totalCents: _int(m['totalCents']),
    availableCents: _int(m['availableCents']),
    pendingCents: _int(m['pendingCents']),
    receivedCents: _int(m['receivedCents']),
    revenueCents: _int(m['revenueCents']),
    nextPayoutDate: _str(m['nextPayoutDate']),
    minPayoutCents: _int(m['minPayoutCents']),
  );
}

enum SquadCommissionStatus { pending, released, paid, canceled }

@immutable
class SquadCommission {
  const SquadCommission({
    required this.id,
    required this.at,
    required this.label,
    required this.tournamentName,
    required this.categoryName,
    required this.origin,
    required this.amountCents,
    required this.status,
    required this.cancelReason,
  });

  final String id;
  final DateTime? at;

  /// "Lucas M." ou "Equipe CFC (4 atl.)".
  final String label;
  final String tournamentName;
  final String categoryName;

  /// `code`, `link` ou `qr`.
  final String origin;
  final int amountCents;
  final SquadCommissionStatus status;

  /// `refund`, `chargeback` ou `manual` (só cancelada).
  final String? cancelReason;

  factory SquadCommission.fromMap(Map<String, Object?> m) => SquadCommission(
    id: _str(m['id']),
    at: _date(m['at']),
    label: _str(m['label']),
    tournamentName: _str(m['tournamentName']),
    categoryName: _str(m['categoryName']),
    origin: _str(m['origin']),
    amountCents: _int(m['amountCents']),
    status: switch (m['status']) {
      'released' => SquadCommissionStatus.released,
      'paid' => SquadCommissionStatus.paid,
      'canceled' => SquadCommissionStatus.canceled,
      _ => SquadCommissionStatus.pending,
    },
    cancelReason: m['cancelReason'] as String?,
  );
}

@immutable
class SquadPayout {
  const SquadPayout({
    required this.id,
    required this.at,
    required this.amountCents,
  });

  final String id;
  final DateTime? at;
  final int amountCents;

  factory SquadPayout.fromMap(Map<String, Object?> m) => SquadPayout(
    id: _str(m['id']),
    at: _date(m['at']),
    amountCents: _int(m['amountCents']),
  );
}

@immutable
class SquadWeek {
  const SquadWeek({required this.weekStart, required this.cents});

  /// Segunda-feira (`YYYY-MM-DD`, calendário de São Paulo).
  final String weekStart;
  final int cents;
}

@immutable
class SquadLevel {
  const SquadLevel({required this.name, required this.min});

  final String name;
  final int min;
}

@immutable
class SquadPoints {
  const SquadPoints({
    required this.total,
    required this.level,
    required this.levels,
    required this.perConversion,
  });

  final int total;
  final String level;
  final List<SquadLevel> levels;
  final int perConversion;
}

@immutable
class SquadProgress {
  const SquadProgress({
    required this.toTier,
    required this.conversions,
    required this.minConversions,
    required this.reviewDate,
  });

  final SquadTier toTier;
  final int conversions;
  final int minConversions;

  /// Fim do contrato: quando a promoção é avaliada.
  final DateTime? reviewDate;

  int get remaining => (minConversions - conversions).clamp(0, minConversions);

  double get fraction =>
      minConversions <= 0 ? 1 : (conversions / minConversions).clamp(0, 1);
}

@immutable
class SquadAmendment {
  const SquadAmendment({required this.at, required this.package});

  final DateTime? at;
  final SquadPackage package;
}

@immutable
class SquadMember {
  const SquadMember({
    required this.tier,
    required this.code,
    required this.paused,
    required this.pausedUntil,
    required this.endsAt,
    required this.start,
    required this.end,
    required this.cycleId,
    required this.commissionPct,
    required this.followerDiscountPct,
    required this.followerDiscountFirstOnly,
    required this.pendingAmendment,
    required this.earnings,
    required this.conversions,
    required this.athletes,
    required this.weekly,
    required this.commissions,
    required this.payouts,
    required this.points,
    required this.progress,
    required this.package,
    required this.nextPackage,
  });

  final SquadTier tier;
  final String code;

  /// Contrato pausado: o código não dá desconto nem gera comissão.
  final bool paused;

  /// Data civil de retorno da pausa (`YYYY-MM-DD`).
  final String? pausedUntil;

  /// Data civil em que o contrato encerra antes do fim do ciclo.
  final String? endsAt;
  final DateTime? start;
  final DateTime? end;
  final String cycleId;
  final num commissionPct;
  final num followerDiscountPct;
  final bool followerDiscountFirstOnly;
  final SquadAmendment? pendingAmendment;
  final SquadEarnings earnings;

  /// Conversões com pagamento confirmado.
  final int conversions;

  /// Atletas trazidos (quem pagou a dupla inteira conta os dois).
  final int athletes;
  final List<SquadWeek> weekly;
  final List<SquadCommission> commissions;
  final List<SquadPayout> payouts;
  final SquadPoints points;
  final SquadProgress? progress;
  final SquadPackage package;
  final SquadPackage? nextPackage;

  bool get isPilot => cycleId == 'piloto';

  factory SquadMember.fromMap(Map<String, Object?> m) {
    final points = _map(m['points']);
    final progress = m['progress'] == null ? null : _map(m['progress']);
    final amendment = m['pendingAmendment'] == null
        ? null
        : _map(m['pendingAmendment']);
    final next = m['nextPackage'] == null ? null : _map(m['nextPackage']);
    return SquadMember(
      tier: squadTierOf(m['tier']),
      code: _str(m['code']),
      paused: m['status'] == 'paused',
      pausedUntil: _strOrNull(m['pausedUntil']),
      endsAt: _strOrNull(m['endsAt']),
      start: _date(m['start']),
      end: _date(m['end']),
      cycleId: _str(m['cycleId']),
      commissionPct: _num(m['commissionPct']),
      followerDiscountPct: _num(m['followerDiscountPct']),
      followerDiscountFirstOnly: m['followerDiscountFirstOnly'] != false,
      pendingAmendment: amendment == null
          ? null
          : SquadAmendment(
              at: _date(amendment['at']),
              package: SquadPackage.fromMap(_map(amendment['package'])),
            ),
      earnings: SquadEarnings.fromMap(_map(m['earnings'])),
      conversions: _int(m['conversions']),
      athletes: _int(m['athletes']),
      weekly: _list(m['weekly'])
          .map(
            (w) => SquadWeek(
              weekStart: _str(w['weekStart']),
              cents: _int(w['cents']),
            ),
          )
          .toList(),
      commissions: _list(
        m['commissions'],
      ).map(SquadCommission.fromMap).toList(),
      payouts: _list(m['payouts']).map(SquadPayout.fromMap).toList(),
      points: SquadPoints(
        total: _int(points['total']),
        level: _str(points['level']),
        levels: _levels(points['levels']),
        perConversion: _int(points['perConversion']),
      ),
      progress: progress == null
          ? null
          : SquadProgress(
              toTier: squadTierOf(progress['toTier']),
              conversions: _int(progress['conversions']),
              minConversions: _int(progress['minConversions']),
              reviewDate: _date(progress['reviewDate']),
            ),
      package: SquadPackage.fromMap(_map(m['package'])),
      nextPackage: next == null ? null : SquadPackage.fromMap(next),
    );
  }
}

@immutable
class SquadInviteSummary {
  const SquadInviteSummary({
    required this.id,
    required this.tier,
    required this.expiresAt,
  });

  final String id;
  final SquadTier tier;
  final DateTime? expiresAt;
}

/// Resposta de `getMySquad`: membro, convite em aberto ou nenhum dos dois.
@immutable
class MySquad {
  const MySquad({required this.member, required this.invite});

  static const none = MySquad(member: null, invite: null);

  final SquadMember? member;
  final SquadInviteSummary? invite;

  factory MySquad.fromMap(Map<String, Object?> m) {
    final member = m['member'] == null ? null : _map(m['member']);
    final invite = m['invite'] == null ? null : _map(m['invite']);
    return MySquad(
      member: member == null ? null : SquadMember.fromMap(member),
      invite: invite == null
          ? null
          : SquadInviteSummary(
              id: _str(invite['id']),
              tier: squadTierOf(invite['tier']),
              expiresAt: _date(invite['expiresAt']),
            ),
    );
  }
}

@immutable
class SquadRankingEntry {
  const SquadRankingEntry({
    required this.position,
    required this.name,
    required this.photoUrl,
    required this.points,
    required this.delta,
    required this.me,
  });

  final int position;
  final String name;
  final String? photoUrl;
  final int points;

  /// Posições ganhas na semana (negativo = caiu); `null` = entrou nesta semana.
  final int? delta;
  final bool me;

  factory SquadRankingEntry.fromMap(Map<String, Object?> m) =>
      SquadRankingEntry(
        position: _int(m['position']),
        name: _str(m['name']),
        photoUrl: _strOrNull(m['photoUrl']),
        points: _int(m['points']),
        delta: m['delta'] is num ? (m['delta'] as num).toInt() : null,
        me: m['me'] == true,
      );
}

@immutable
class SquadRanking {
  const SquadRanking({
    required this.entries,
    required this.me,
    required this.level,
    required this.levels,
  });

  final List<SquadRankingEntry> entries;
  final SquadRankingEntry? me;
  final String level;
  final List<SquadLevel> levels;

  factory SquadRanking.fromMap(Map<String, Object?> m) => SquadRanking(
    entries: _list(m['entries']).map(SquadRankingEntry.fromMap).toList(),
    me: m['me'] == null ? null : SquadRankingEntry.fromMap(_map(m['me'])),
    level: _str(m['level']),
    levels: _levels(m['levels']),
  );
}

@immutable
class SquadInvite {
  const SquadInvite({
    required this.id,
    required this.status,
    required this.package,
    required this.suggestedCode,
    required this.periodEnd,
    required this.message,
    required this.expiresAt,
    required this.firstName,
    required this.tournaments,
    required this.followerDiscountFirstOnly,
  });

  final String id;

  /// `sent`, `opened`, `accepted`, `expired`, `canceled` ou `scheduled`.
  final String status;
  final SquadPackage package;
  final String suggestedCode;

  /// Data civil (`YYYY-MM-DD`) do fim do período.
  final String? periodEnd;

  /// Recado do time no convite.
  final String? message;
  final DateTime? expiresAt;
  final String firstName;
  final int? tournaments;
  final bool followerDiscountFirstOnly;

  bool get isOpen => status == 'sent' || status == 'opened';

  factory SquadInvite.fromMap(Map<String, Object?> m) => SquadInvite(
    id: _str(m['id']),
    status: _str(m['status']),
    package: SquadPackage.fromMap(_map(m['package'])),
    suggestedCode: _str(m['suggestedCode']),
    periodEnd: _strOrNull(m['periodEnd']),
    message: _strOrNull(m['message']),
    expiresAt: _date(m['expiresAt']),
    firstName: _str(m['firstName']),
    tournaments: m['tournaments'] is num
        ? (m['tournaments'] as num).toInt()
        : null,
    followerDiscountFirstOnly: m['followerDiscountFirstOnly'] != false,
  );
}

/// Resposta de `checkSquadCode` no checkout da inscrição.
@immutable
class SquadCodeCheck {
  const SquadCodeCheck({
    required this.ambassadorName,
    required this.code,
    required this.origin,
    required this.discountPct,
    required this.feePercent,
  });

  static const none = SquadCodeCheck(
    ambassadorName: null,
    code: null,
    origin: null,
    discountPct: 0,
    feePercent: null,
  );

  final String? ambassadorName;
  final String? code;

  /// `code`, `link`, `qr` ou `null` (sem indicação).
  final String? origin;

  /// % do desconto que vale nesta inscrição (0 = já usou o da 1ª inscrição).
  final num discountPct;

  /// % da taxa da plataforma no torneio — teto do desconto. `null` = sem teto.
  final num? feePercent;

  bool get viaLink => origin == 'link' || origin == 'qr';

  factory SquadCodeCheck.fromMap(Map<String, Object?> m) => SquadCodeCheck(
    ambassadorName: _strOrNull(m['ambassadorName']),
    code: _strOrNull(m['code']),
    origin: _strOrNull(m['origin']),
    discountPct: _num(m['discountPct']),
    feePercent: m['feePercent'] is num ? m['feePercent'] as num : null,
  );
}

// ── leitura defensiva do payload da callable ────────────────────────────────

Map<String, Object?> _map(Object? raw) {
  if (raw is! Map) return const {};
  return raw.map((k, v) => MapEntry(k.toString(), v));
}

List<Map<String, Object?>> _list(Object? raw) {
  if (raw is! List) return const [];
  return raw.whereType<Map>().map(_map).toList();
}

List<SquadLevel> _levels(Object? raw) => _list(
  raw,
).map((l) => SquadLevel(name: _str(l['name']), min: _int(l['min']))).toList();

String _str(Object? v) => v is String ? v : '';

String? _strOrNull(Object? v) => v is String && v.trim().isNotEmpty ? v : null;

num _num(Object? v) => v is num ? v : 0;

int _int(Object? v) => v is num ? v.round() : 0;

/// Instante ISO do servidor, em UTC (formatar com `toNexagoEventLocal`).
DateTime? _date(Object? v) {
  if (v is! String || v.isEmpty) return null;
  return DateTime.tryParse(v)?.toUtc();
}
