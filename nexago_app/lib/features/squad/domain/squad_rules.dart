import '../../../core/deep_link/app_domains.dart';
import '../../../core/formatting/app_currency_format.dart';
import '../../../core/time/nexago_event_timezone.dart';
import 'squad_models.dart';

/// Regras de apresentação do NexaSquad no app — puras, testáveis sem widget.

const _months = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun', //
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

String _two(int n) => n.toString().padLeft(2, '0');

/// "20 out" — dia e mês abreviado sem ponto, como no desenho (e no portal).
String squadDayMonth(DateTime instant) {
  final sp = toNexagoEventLocal(instant);
  return '${_two(sp.day)} ${_months[sp.month - 1]}';
}

/// "20 out" a partir de uma data civil `YYYY-MM-DD` (sem fuso).
String squadDayKeyLabel(String key) {
  final parts = key.split('-');
  if (parts.length != 3) return key;
  final month = int.tryParse(parts[1]) ?? 0;
  final day = int.tryParse(parts[2]) ?? 0;
  if (month < 1 || month > 12 || day < 1) return key;
  return '${_two(day)} ${_months[month - 1]}';
}

/// "Hoje", "Ontem" ou "13 out", no calendário de São Paulo.
String squadRelativeDay(DateTime instant, DateTime now) {
  final day = nexagoEventDayKey(instant);
  if (day == nexagoEventDayKey(now)) return 'Hoje';
  if (day == nexagoEventDayKey(now.subtract(const Duration(days: 1)))) {
    return 'Ontem';
  }
  return squadDayMonth(instant);
}

/// "08 set → 06 dez".
String squadPeriodLabel(DateTime? start, DateTime? end) {
  if (start == null || end == null) return '';
  return '${squadDayMonth(start)} → ${squadDayMonth(end)}';
}

/// "10%" ou "12,5%".
String squadPercent(num pct) {
  final text = pct == pct.roundToDouble()
      ? pct.toInt().toString()
      : pct.toStringAsFixed(1).replaceAll('.', ',');
  return '$text%';
}

/// "1.280".
String squadThousands(int n) {
  final s = n.abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) out.write('.');
    out.write(s[i]);
  }
  return out.toString();
}

/// "R$ 324" e o resto em centavos (",00") separados, como o número grande do desenho.
(String, String) squadSplitBRL(int cents) {
  final full = formatBRLFromCents(cents);
  final comma = full.lastIndexOf(',');
  if (comma < 0) return (full, '');
  return (full.substring(0, comma), full.substring(comma));
}

/// "Você ganhou no piloto" / "Você ganhou neste ciclo".
String squadEarnedHeadline(SquadMember m) =>
    m.isPilot ? 'Você ganhou no piloto' : 'Você ganhou neste ciclo';

/// Linha do repasse: data só para o que de fato entra no repasse em aberto.
String squadPayoutLine(SquadEarnings e) {
  if (e.availableCents <= 0) {
    return 'O que for liberado cai na carteira NexaGO a cada repasse.';
  }
  final date = squadDayKeyLabel(e.nextPayoutDate);
  final goes = e.nextPayoutCents > 0 && e.nextPayoutCents >= e.minPayoutCents;
  if (goes && e.nextPayoutCents >= e.availableCents) {
    return 'Cai na carteira NexaGO em $date';
  }
  if (goes) {
    return '${formatBRLFromCents(e.nextPayoutCents)} cai na carteira NexaGO em '
        '$date; o resto entra no repasse seguinte.';
  }
  if (e.availableCents < e.minPayoutCents) {
    return 'Repasse a partir de ${formatBRLFromCents(e.minPayoutCents)}: o '
        'saldo acumula para o próximo.';
  }
  return 'Entra no repasse seguinte ao de $date.';
}

/// Próximo repasse curto ("20 out"), ou "—" quando nada entra nele.
String squadNextPayoutShort(SquadEarnings e) {
  if (e.nextPayoutCents <= 0 || e.nextPayoutCents < e.minPayoutCents) {
    return '—';
  }
  return squadDayKeyLabel(e.nextPayoutDate);
}

/// Onde o desconto vale, pelas regras: "na primeira inscrição e na primeira
/// reserva", "em reservas e clubinhos"… `null` = desligado em tudo.
String? squadDiscountWhere({
  required bool firstOnly,
  required SquadDiscountScope scope,
}) {
  final kinds = <(bool, String, String)>[
    (scope.registration, 'na primeira inscrição', 'inscrições'),
    (scope.booking, 'na primeira reserva', 'reservas'),
    (scope.club, 'no primeiro clubinho', 'clubinhos'),
  ].where((k) => k.$1).map((k) => firstOnly ? k.$2 : k.$3).toList();
  if (kinds.isEmpty) return null;
  final list = kinds.length == 1
      ? kinds.first
      : '${kinds.sublist(0, kinds.length - 1).join(', ')} e ${kinds.last}';
  return firstOnly ? list : 'em $list';
}

/// "10% OFF na 1ª inscrição" (o código é divulgado em torneios, então a
/// inscrição vem primeiro); sem desconto em inscrição, cai em onde ele vale.
/// Vazio = desconto desligado em tudo.
String _squadOffer(SquadMember m) {
  final pct = squadPercent(m.followerDiscountPct);
  if (m.followerDiscountScope.registration) {
    return m.followerDiscountFirstOnly
        ? '$pct OFF na 1ª inscrição'
        : '$pct OFF nas inscrições';
  }
  final where = squadDiscountWhere(
    firstOnly: m.followerDiscountFirstOnly,
    scope: m.followerDiscountScope,
  );
  return where == null ? '' : '$pct OFF $where';
}

/// "10% OFF na 1ª inscrição de quem usar".
String squadFollowerOffer(SquadMember m) {
  final offer = _squadOffer(m);
  return offer.isEmpty
      ? 'Sem desconto pra quem usar, no momento'
      : '$offer de quem usar';
}

/// Progresso para o próximo nível.
String squadProgressLine(SquadProgress p) {
  final when = p.reviewDate == null
      ? ''
      : ' na avaliação de ${squadDayMonth(p.reviewDate!)}';
  if (p.remaining <= 0) {
    return 'Meta de conversões batida: você concorre a ${p.toTier.label}$when.';
  }
  final noun = p.remaining == 1 ? 'conversão' : 'conversões';
  return 'Mais ${p.remaining} $noun pra concorrer a ${p.toTier.label}$when.';
}

/// Aviso do contrato pausado / com fim marcado (sem o motivo, que é interno).
String? squadContractNotice(SquadMember m) {
  if (m.paused) {
    final until = m.pausedUntil == null
        ? ''
        : ' até ${squadDayKeyLabel(m.pausedUntil!)}';
    return 'Contrato pausado$until: seu código não dá desconto nem gera '
        'comissão enquanto isso.';
  }
  if (m.endsAt != null) {
    return 'Seu contrato termina em ${squadDayKeyLabel(m.endsAt!)}.';
  }
  return null;
}

// ── status das comissões ────────────────────────────────────────────────────

enum SquadStatusTone { pending, win, muted, danger }

String squadCommissionStatusLabel(SquadCommission c, {bool short = false}) {
  switch (c.status) {
    case SquadCommissionStatus.pending:
      return short ? 'Aguardando' : 'Aguardando pgto';
    case SquadCommissionStatus.released:
      return 'Liberada';
    case SquadCommissionStatus.paid:
      return 'Paga';
    case SquadCommissionStatus.canceled:
      return switch (c.cancelReason) {
        'refund' => 'Cancelada · reembolso',
        'chargeback' => 'Cancelada · estorno',
        _ => 'Cancelada',
      };
  }
}

SquadStatusTone squadCommissionTone(SquadCommission c) => switch (c.status) {
  SquadCommissionStatus.pending => SquadStatusTone.pending,
  SquadCommissionStatus.released => SquadStatusTone.win,
  SquadCommissionStatus.paid => SquadStatusTone.muted,
  SquadCommissionStatus.canceled => SquadStatusTone.danger,
};

/// "Open Errejota · Masc. C".
String squadCommissionEvent(SquadCommission c) => [
  c.tournamentName,
  c.categoryName,
].where((s) => s.trim().isNotEmpty).join(' · ');

// ── extrato (tela 03) ───────────────────────────────────────────────────────

enum SquadStatementKind { commission, payout }

class SquadStatementItem {
  const SquadStatementItem({
    required this.kind,
    required this.at,
    required this.title,
    required this.amountCents,
    this.commission,
  });

  final SquadStatementKind kind;
  final DateTime? at;
  final String title;
  final int amountCents;
  final SquadCommission? commission;
}

/// Comissões e repasses para a carteira, do mais recente para o mais antigo.
List<SquadStatementItem> squadStatement(SquadMember m) {
  final items = <SquadStatementItem>[
    for (final c in m.commissions)
      SquadStatementItem(
        kind: SquadStatementKind.commission,
        at: c.at,
        title: [
          c.label,
          c.tournamentName,
        ].where((s) => s.trim().isNotEmpty).join(' · '),
        amountCents: c.amountCents,
        commission: c,
      ),
    for (final p in m.payouts)
      SquadStatementItem(
        kind: SquadStatementKind.payout,
        at: p.at,
        title: 'Repasse para a carteira',
        amountCents: p.amountCents,
      ),
  ];
  items.sort((a, b) {
    final at = a.at?.millisecondsSinceEpoch ?? 0;
    final bt = b.at?.millisecondsSinceEpoch ?? 0;
    return bt.compareTo(at);
  });
  return items;
}

/// "+ R$ 12,00", "R$ 10,00" (cancelada, riscada na tela) ou "− R$ 180,00".
String squadStatementAmount(SquadStatementItem i) {
  final value = formatBRLFromCents(i.amountCents);
  if (i.kind == SquadStatementKind.payout) return '− $value';
  if (i.commission?.status == SquadCommissionStatus.canceled) return value;
  return '+ $value';
}

/// Rótulos das barras por semana: dia/mês na primeira e na virada do mês, só
/// o dia nas outras ("8/9", "15", "22", "29", "6/10", "13").
List<String> squadWeekLabels(List<SquadWeek> weeks) {
  final out = <String>[];
  int? lastMonth;
  for (final w in weeks) {
    final parts = w.weekStart.split('-');
    final month = parts.length == 3 ? int.tryParse(parts[1]) ?? 0 : 0;
    final day = parts.length == 3 ? int.tryParse(parts[2]) ?? 0 : 0;
    out.add(month != lastMonth ? '$day/$month' : '$day');
    lastMonth = month;
  }
  return out;
}

// ── benefícios do pacote ────────────────────────────────────────────────────

enum SquadBenefitKind {
  commission,
  registrations,
  kit,
  events,
  partner,
  campaign,
  bonus,
}

class SquadBenefit {
  const SquadBenefit(this.kind, this.title, this.subtitle);

  final SquadBenefitKind kind;
  final String title;
  final String subtitle;
}

String _commissionTitle(SquadPackage p) => p.commissionIsRange
    ? '${squadPercent(p.commissionMin)} a ${squadPercent(p.commissionMax)} de comissão'
    : '${squadPercent(p.commissionMin)} de comissão';

String _registrationsTitle(SquadPackage p) {
  switch (p.registrationsType) {
    case SquadRegistrationsType.discount:
      return '${p.registrationsValue ?? 0}% OFF nas suas inscrições';
    case SquadRegistrationsType.freePerMonth:
      final n = p.registrationsValue ?? 1;
      return n == 1 ? '1 inscrição grátis/mês' : '$n inscrições grátis/mês';
    case SquadRegistrationsType.freeUnlimited:
      return 'Inscrições grátis';
  }
}

/// Os benefícios do pacote, na ordem do desenho. [periodEnd] entra no texto
/// das inscrições ("Até 06 dez") quando conhecido.
List<SquadBenefit> squadBenefits(SquadPackage p, {String? periodEnd}) {
  final until = periodEnd == null ? 'Durante todo o ciclo' : 'Até $periodEnd';
  return [
    SquadBenefit(
      SquadBenefitKind.commission,
      _commissionTitle(p),
      'Em cada inscrição paga com seu código',
    ),
    SquadBenefit(
      SquadBenefitKind.registrations,
      _registrationsTitle(p),
      p.registrationsType == SquadRegistrationsType.freePerMonth
          ? 'Renova todo dia 1º'
          : until,
    ),
    if (p.kit.trim().isNotEmpty)
      SquadBenefit(SquadBenefitKind.kit, 'Kit Squad', p.kit.trim()),
    if (p.events.trim().isNotEmpty)
      SquadBenefit(
        SquadBenefitKind.events,
        'Acesso antecipado',
        '${p.events.trim()} nos torneios NexaGO',
      ),
    if (p.partnerHalfOff)
      const SquadBenefit(
        SquadBenefitKind.partner,
        '50% para sua dupla',
        'Na inscrição de quem joga com você',
      ),
    if (p.campaignFee)
      const SquadBenefit(
        SquadBenefitKind.campaign,
        'Cachê por campanha',
        'Combinado com o time NexaGO a cada ação',
      ),
    if (p.tournamentOriginBonusCents != null)
      SquadBenefit(
        SquadBenefitKind.bonus,
        '${formatBRLFromCents(p.tournamentOriginBonusCents!)} por torneio',
        'Bônus por torneio que você trouxer para a NexaGO',
      ),
  ];
}

/// Chips do próximo nível ("Até 15% de comissão", "Inscrições grátis"…).
List<String> squadNextTierChips(SquadPackage p) => [
  p.commissionIsRange
      ? 'Até ${squadPercent(p.commissionMax)} de comissão'
      : '${squadPercent(p.commissionMin)} de comissão',
  _registrationsTitle(p),
  if (p.kit.trim().isNotEmpty) p.kit.trim(),
  if (p.partnerHalfOff) '50% para sua dupla',
  if (p.campaignFee) 'Cachê por campanha',
];

// ── ranking (tela 04) ───────────────────────────────────────────────────────

/// Faixa de cima: só quando a posição mudou na semana.
String? squadRankingMoveLine(SquadRankingEntry? me) {
  final d = me?.delta;
  if (d == null || d == 0) return null;
  final n = d.abs();
  final noun = n == 1 ? 'posição' : 'posições';
  return d > 0
      ? 'Você subiu $n $noun esta semana.'
      : 'Você caiu $n $noun esta semana.';
}

/// "▲3", "▼2" ou "—".
String squadDeltaLabel(int? delta) {
  if (delta == null) return 'novo';
  if (delta > 0) return '▲$delta';
  if (delta < 0) return '▼${delta.abs()}';
  return '—';
}

/// Primeiro nome (pódio).
String squadFirstName(String name) {
  final parts = name.trim().split(RegExp(r'\s+'));
  return parts.isEmpty ? name : parts.first;
}

/// "JV" para "João Victor".
String squadInitials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  return parts.take(2).map((p) => p[0].toUpperCase()).join();
}

// ── código e links ──────────────────────────────────────────────────────────

/// Maiúsculas, sem acento e sem espaço ("joão10 " → "JOAO10"). Não valida.
String normalizeSquadCode(String raw) {
  const from = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
  const to = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn';
  final buf = StringBuffer();
  for (final ch in raw.runes.map(String.fromCharCode)) {
    final i = from.indexOf(ch);
    buf.write(i >= 0 ? to[i] : ch);
  }
  return buf.toString().replaceAll(RegExp(r'\s+'), '').toUpperCase();
}

final RegExp _personalCodeRe = RegExp(r'^[A-Z0-9]{4,12}$');

/// Código pessoal do embaixador: 4 a 12 letras (A–Z) ou números.
bool isValidSquadPersonalCode(String code) => _personalCodeRe.hasMatch(code);

/// Link de indicação: o portal guarda `?squad=` em qualquer página e o app o
/// grava ao abrir o Universal Link (`squadRefFromUri`). QR leva `&via=qr`.
String squadShareLink({
  required String code,
  String? tournamentId,
  bool viaQr = false,
}) {
  final path = tournamentId == null || tournamentId.isEmpty
      ? '/'
      : '/torneios/$tournamentId';
  final qr = viaQr ? '&via=qr' : '';
  return '${AppDomains.athletePortal}$path?squad=${Uri.encodeQueryComponent(code)}$qr';
}

/// Link sem `https://` para exibir no campo de copiar.
String squadLinkDisplay(String link) =>
    link.replaceFirst(RegExp(r'^https?://'), '');

// ── desconto do seguidor no checkout (tela 07) ──────────────────────────────

/// O Asaas não cobra PIX abaixo disto (`MIN_CHARGE_CENTS`).
const int _minChargeCents = 500;

/// Piso da taxa por transação (`FEE_FLOOR_REAIS` de `platform-fees.ts`).
const double _feeFloorReais = 1.5;

double _roundMoney(double n) => (n * 100).round() / 100;

/// Taxa da plataforma em centavos; `null` = torneio sem organizador.
///
/// Mesma conta, em reais e com os mesmos arredondamentos, de
/// `computePlatformFeeReais` + `discountFeeCapCents`: feita direto em
/// centavos, alguns preços davam 1 centavo de diferença. [floorReais] é o
/// piso da taxa (o clubinho não tem: 0).
int? squadPlatformFeeCents(
  int priceCents,
  num? feePercent, {
  num floorReais = _feeFloorReais,
}) {
  if (feePercent == null) return null;
  final amount = priceCents / 100;
  if (!(amount > 0) || !(feePercent > 0)) return 0;
  final pctFee = _roundMoney(amount * feePercent / 100);
  final withFloor = _roundMoney(
    pctFee > floorReais ? pctFee : floorReais.toDouble(),
  );
  final ceiling = _roundMoney(amount - 0.01);
  final capped = withFloor < ceiling ? withFloor : ceiling;
  return ((capped < 0 ? 0 : capped) * 100).round();
}

/// Prévia do desconto do código, espelho de `followerDiscountFor` +
/// `squad-fee-cap.ts` (e de `squad-discount.ts` do portal): % sobre o preço,
/// nunca abaixo do mínimo do Asaas e nunca acima da taxa da plataforma — o
/// desconto sai da taxa da nexaGO. O valor de verdade volta na cobrança.
/// Vale para inscrição, reserva e clubinho: muda só a taxa (e o piso).
int squadDiscountPreviewCents(
  int priceCents,
  num pct,
  num? feePercent, {
  num floorReais = _feeFloorReais,
}) {
  if (pct <= 0 || priceCents <= 0) return 0;
  final raw = (priceCents * pct / 100).round();
  final cap = squadPlatformFeeCents(
    priceCents,
    feePercent,
    floorReais: floorReais,
  );
  var cents = raw;
  if (priceCents - _minChargeCents < cents)
    cents = priceCents - _minChargeCents;
  if (cap != null && cap < cents) cents = cap;
  return cents < 0 ? 0 : cents;
}

// ── benefício "Inscrições" do próprio embaixador ────────────────────────────

/// Prévia do desconto do embaixador na PRÓPRIA parcela, espelho de
/// `perkDiscountCents` (`squad-own-perk.ts`): % de [shareCents] (a parcela
/// dele, mesmo pagando a dupla/equipe inteira), sem deixar a cobrança — já
/// com o desconto do seguidor ([otherDiscountCents]) — abaixo do mínimo do
/// Asaas. O valor de verdade volta em `squadPerkReais`.
int squadOwnPerkDiscountCents({
  required num pct,
  required int shareCents,
  required int chargeCents,
  int otherDiscountCents = 0,
}) {
  if (pct <= 0 || shareCents <= 0) return 0;
  final base = shareCents < chargeCents ? shareCents : chargeCents;
  final raw = (base * pct / 100).round();
  final room = chargeCents - otherDiscountCents - _minChargeCents;
  final cents = raw < room ? raw : room;
  return cents < 0 ? 0 : cents;
}

/// O que o checkout da inscrição mostra do benefício do embaixador.
enum SquadOwnPerkOffer {
  /// Sem benefício (ou não é embaixador ativo).
  none,

  /// % na parcela dele: linha de desconto no resumo.
  discount,

  /// Parcela grátis disponível pagando só a própria parcela: ação principal.
  freeShare,

  /// Gratuidade disponível, mas pagando a dupla/equipe inteira: só avisa
  /// que ela cobre apenas a parcela dele.
  freeOnlyOwnShare,

  /// As gratuidades do mês acabaram: aviso e pagamento normal.
  freeUsedUp,
}

/// [amountType] = `share` (própria parcela) ou `full` (dupla/equipe inteira).
SquadOwnPerkOffer squadOwnPerkOffer(
  SquadOwnPerk? perk, {
  required String amountType,
}) {
  if (perk == null) return SquadOwnPerkOffer.none;
  if (!perk.isFree) {
    return perk.isDiscount
        ? SquadOwnPerkOffer.discount
        : SquadOwnPerkOffer.none;
  }
  if (!perk.available) return SquadOwnPerkOffer.freeUsedUp;
  return amountType == 'full'
      ? SquadOwnPerkOffer.freeOnlyOwnShare
      : SquadOwnPerkOffer.freeShare;
}

/// "2 inscrições grátis restantes este mês"; `null` com o teto oculto
/// (ilimitadas) — aí não se mostra número nenhum.
String? squadFreeRemainingLabel(int? remaining) {
  if (remaining == null || remaining <= 0) return null;
  return remaining == 1
      ? '1 inscrição grátis restante este mês'
      : '$remaining inscrições grátis restantes este mês';
}

// ── card de compartilhar (tela 02) ──────────────────────────────────────────

/// "26 OUT · ARENA ERREJOTA".
String squadEventEyebrow(DateTime start, String location) {
  final day = squadDayMonth(start).toUpperCase();
  final place = location.trim().toUpperCase();
  return place.isEmpty ? day : '$day · $place';
}

/// "10% OFF na 1ª inscrição" / "10% OFF nas inscrições"; vazio = sem desconto.
String squadOfferShort(SquadMember m) => _squadOffer(m);

/// Texto que acompanha o card no compartilhamento. A identificação de
/// publicidade (#publi) é regra do contrato e vai junto, como no card.
String squadShareText({
  required SquadMember member,
  required String link,
  String? tournamentName,
}) {
  final offer = squadOfferShort(member);
  final lead = tournamentName == null || tournamentName.trim().isEmpty
      ? 'Bora jogar na NexaGO?'
      : 'Bora jogar o ${tournamentName.trim()} comigo?';
  final gain = offer.isEmpty ? '' : ' e ganhe $offer';
  return '$lead Use meu código ${member.code}$gain: $link #publi';
}
