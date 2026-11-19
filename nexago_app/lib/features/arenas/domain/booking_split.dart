/// "Dividir com os jogadores" da reserva de quadra: cada pessoa recebe uma
/// cobrança Pix da sua fatia (`arenaBookings/{bookingId}/paymentShares/{id}`).
/// Fatia não paga até o prazo vira `covered_by_organizer` e soma ao valor
/// devido no local — a reserva nunca cai por causa disso.
///
/// Espelha `splitArenaBookingPayment` (`functions/src/arena-booking-split.ts`)
/// e o portal do atleta (`arena-booking-split-repository.ts`).
library;

/// Mesmo teto do servidor (`MAX_SHARES`).
const int kBookingSplitMaxShares = 20;

/// Mesma tolerância do servidor (`AMOUNT_TOLERANCE_REAIS`): a soma das
/// fatias precisa bater com o valor a pagar agora dentro desta margem.
const double kBookingSplitToleranceReais = 0.02;

int _toCents(double reais) => (reais * 100).round();

/// Divide [totalReais] em [count] fatias iguais, em centavos. O resto do
/// arredondamento vai um centavo para cada uma das primeiras fatias, para a
/// soma bater exatamente (R$ 100 / 3 = 33,34 + 33,33 + 33,33).
List<double> splitEvenlyReais(double totalReais, int count) {
  if (count <= 0) return const [];
  final totalCents = _toCents(totalReais);
  final baseCents = totalCents ~/ count;
  final remainder = totalCents - baseCents * count;
  return List<double>.unmodifiable([
    for (var i = 0; i < count; i++) (baseCents + (i < remainder ? 1 : 0)) / 100,
  ]);
}

/// Soma das fatias, em reais, sem o ruído do ponto flutuante.
double splitSumReais(Iterable<double> amounts) =>
    amounts.fold<int>(0, (acc, a) => acc + _toCents(a)) / 100;

/// A soma bate com o total esperado (mesma tolerância do servidor).
bool splitSumMatches(Iterable<double> amounts, double expectedReais) =>
    (_toCents(splitSumReais(amounts)) - _toCents(expectedReais)).abs() <=
    _toCents(kBookingSplitToleranceReais);

/// Valor digitado no campo de reais ("12,50", "12.5", "R$ 12,50"). Vazio ou
/// ilegível = 0.
double parseReaisInput(String raw) {
  final cleaned = raw.replaceAll(RegExp(r'[^0-9,.]'), '');
  if (cleaned.isEmpty) return 0;
  // "1.234,56" → milhar com ponto; "12.5" → decimal com ponto.
  final normalized = cleaned.contains(',')
      ? cleaned.replaceAll('.', '').replaceAll(',', '.')
      : cleaned;
  final value = double.tryParse(normalized);
  if (value == null || value.isNaN || value.isInfinite || value < 0) return 0;
  return _toCents(value) / 100;
}

/// "12,50" — o valor no campo, sem o "R$".
String formatReaisInput(double reais) =>
    (_toCents(reais) / 100).toStringAsFixed(2).replaceAll('.', ',');

/// Uma pessoa na divisão. "Você" entra por padrão e pode sair.
class BookingSplitParticipant {
  const BookingSplitParticipant({
    required this.athleteId,
    required this.name,
    required this.amountReais,
    this.photoUrl,
    this.isSelf = false,
  });

  final String athleteId;
  final String name;
  final String? photoUrl;
  final bool isSelf;
  final double amountReais;

  BookingSplitParticipant copyWith({double? amountReais}) =>
      BookingSplitParticipant(
        athleteId: athleteId,
        name: name,
        photoUrl: photoUrl,
        isSelf: isSelf,
        amountReais: amountReais ?? this.amountReais,
      );
}

/// O que a folha devolve para a tela de confirmar: quem paga quanto.
///
/// [evenly] = ninguém mexeu nos valores: na hora de criar a reserva a divisão
/// é refeita sobre o valor que o servidor devolver (cupom ou crédito que
/// mudaram o total no meio do caminho não travam a divisão).
class BookingSplitDraft {
  BookingSplitDraft({
    required List<BookingSplitParticipant> participants,
    this.evenly = true,
    this.ownCpf,
  }) : participants = List.unmodifiable(participants);

  final List<BookingSplitParticipant> participants;
  final bool evenly;

  /// CPF digitado na folha quando "Você" paga e ainda não tinha CPF salvo.
  final String? ownCpf;

  bool get isEmpty => participants.isEmpty;

  int get guestCount => participants.where((p) => !p.isSelf).length;

  double get sumReais => splitSumReais(participants.map((p) => p.amountReais));

  bool sumMatches(double totalReais) =>
      splitSumMatches(participants.map((p) => p.amountReais), totalReais);

  /// Pode enviar: alguém além de "Você", todo mundo com valor e a soma certa.
  /// Mesmo critério do `splitCanSubmit` do web.
  bool canSubmit(double totalReais) =>
      guestCount > 0 &&
      participants.length <= kBookingSplitMaxShares &&
      participants.every((p) => p.amountReais > 0) &&
      sumMatches(totalReais);

  /// Fatias para a callable sobre o valor final da reserva. Divisão igual é
  /// refeita sobre [totalReais]; valores ajustados à mão valem como estão —
  /// e `null` se não somarem mais o total (o atleta precisa conferir).
  List<({String athleteId, double amountReais})>? sharesFor(
    double totalReais,
  ) {
    final amounts = evenly
        ? splitEvenlyReais(totalReais, participants.length)
        : participants.map((p) => p.amountReais).toList();
    if (!splitSumMatches(amounts, totalReais)) return null;
    return [
      for (var i = 0; i < participants.length; i++)
        (athleteId: participants[i].athleteId, amountReais: amounts[i]),
    ];
  }

  /// Nome de cada pagador para o acompanhamento ("Você" para o dono).
  Map<String, String> get payerNames => {
        for (final p in participants) p.athleteId: p.isSelf ? 'Você' : p.name,
      };

  /// "Você + 2 jogadores" / "3 jogadores".
  String get summaryLabel {
    final hasSelf = participants.any((p) => p.isSelf);
    final guests = guestCount;
    final guestsLabel = guests == 1 ? '1 jogador' : '$guests jogadores';
    return hasSelf ? 'Você + $guestsLabel' : guestsLabel;
  }
}

/// Status de uma fatia, como o servidor grava.
enum BookingShareStatus {
  pending,
  paid,
  expired,
  coveredByOrganizer;

  static BookingShareStatus parse(Object? raw) => switch (raw) {
        'paid' => BookingShareStatus.paid,
        'expired' => BookingShareStatus.expired,
        'covered_by_organizer' => BookingShareStatus.coveredByOrganizer,
        _ => BookingShareStatus.pending,
      };

  /// Rótulo na lista de quem pagou (mesmos textos do web).
  String get label => switch (this) {
        BookingShareStatus.paid => 'Pago',
        BookingShareStatus.expired => 'Expirado',
        BookingShareStatus.coveredByOrganizer => 'Virou sua conta',
        BookingShareStatus.pending => 'Aguardando',
      };
}

/// Uma fatia viva (`arenaBookings/{bookingId}/paymentShares/{id}`).
class BookingPaymentShare {
  const BookingPaymentShare({
    required this.id,
    required this.payerAthleteId,
    required this.amountReais,
    required this.status,
    this.pixCopyPaste,
    this.qrCodeBase64,
    this.expiresAt,
    this.createdAt,
  });

  final String id;
  final String payerAthleteId;
  final double amountReais;
  final BookingShareStatus status;
  final String? pixCopyPaste;
  final String? qrCodeBase64;
  final DateTime? expiresAt;
  final DateTime? createdAt;

  bool get isPending => status == BookingShareStatus.pending;

  /// Lê o doc tolerando campo faltando ou de tipo errado. Datas chegam já
  /// como `DateTime` (o repositório converte o `Timestamp` do Firestore).
  factory BookingPaymentShare.fromMap(String id, Map<String, dynamic> data) {
    String? str(Object? v) =>
        v is String && v.trim().isNotEmpty ? v.trim() : null;
    final amount = data['amountReais'];
    return BookingPaymentShare(
      id: id,
      payerAthleteId: str(data['payerAthleteId']) ?? '',
      amountReais: amount is num ? amount.toDouble() : 0,
      status: BookingShareStatus.parse(data['status']),
      pixCopyPaste: str(data['pixCopyPaste']),
      qrCodeBase64: str(data['qrCodeBase64']),
      expiresAt: _dateOf(data['expiresAt']),
      createdAt: _dateOf(data['createdAt']),
    );
  }
}

DateTime? _dateOf(Object? raw) => raw is DateTime ? raw : null;

/// Resumo do acompanhamento: quanto já entrou e quanto virou conta do dono.
class BookingSplitProgress {
  BookingSplitProgress(List<BookingPaymentShare> shares)
      : total = shares.length,
        paid = shares.where((s) => s.status == BookingShareStatus.paid).length,
        pending = shares.where((s) => s.isPending).length,
        coveredReais = splitSumReais(
          shares
              .where((s) => s.status == BookingShareStatus.coveredByOrganizer)
              .map((s) => s.amountReais),
        ),
        paidReais = splitSumReais(
          shares
              .where((s) => s.status == BookingShareStatus.paid)
              .map((s) => s.amountReais),
        );

  final int total;
  final int paid;
  final int pending;
  final double paidReais;

  /// Fatias não pagas a tempo, somadas ao valor a pagar na arena.
  final double coveredReais;

  /// "2 de 4 pagaram".
  String get label => total == 0 ? '' : '$paid de $total pagaram';
}

/// Texto para o dono mandar a um jogador (WhatsApp) com o Pix copia e cola da
/// fatia dele — o convidado também recebe o aviso por push.
String bookingShareMessage({
  required String arenaName,
  required double amountReais,
  required String pixCopyPaste,
  String? whenLabel,
}) {
  final value = formatReaisInput(amountReais);
  final when = (whenLabel ?? '').trim();
  return [
    'Sua parte da quadra em $arenaName${when.isEmpty ? '' : ' ($when)'}: '
        'R\$ $value.',
    'Pix copia e cola:',
    pixCopyPaste,
  ].join('\n');
}
