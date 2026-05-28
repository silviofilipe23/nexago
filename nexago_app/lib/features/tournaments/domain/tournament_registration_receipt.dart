import 'package:intl/intl.dart';

import 'tournament_category_spots.dart';
import 'tournament_detail_model.dart';
import 'tournament_discovery_models.dart';

/// Dados exibidos no comprovante / ticket de inscrição confirmada.
class TournamentRegistrationReceipt {
  const TournamentRegistrationReceipt({
    required this.registrationId,
    required this.categoryId,
    required this.player1Name,
    required this.player2Name,
    required this.isPaid,
    this.player1AvatarUrl,
    this.player2AvatarUrl,
    this.registeredAt,
  });

  final String registrationId;
  final String categoryId;
  final String player1Name;
  final String player2Name;
  final String? player1AvatarUrl;
  final String? player2AvatarUrl;
  final bool isPaid;
  final DateTime? registeredAt;
}

final _receiptDateFmt = DateFormat('d MMM yyyy', 'pt_BR');

/// `Comprovante #NXG-04298 · 18 Mai 2026`
String formatRegistrationReceiptSubtitle({
  required String registrationId,
  DateTime? registeredAt,
}) {
  final code = formatRegistrationReceiptCode(registrationId);
  final at = registeredAt ?? DateTime.now();
  final month = _receiptDateFmt.format(at);
  final capitalized =
      month.isEmpty ? month : '${month[0].toUpperCase()}${month.substring(1)}';
  return 'Comprovante #$code · $capitalized';
}

String formatRegistrationReceiptCode(String registrationId) {
  final id = registrationId.trim();
  if (id.isEmpty) return '—';
  final suffix = id.length <= 5 ? id : id.substring(id.length - 5);
  return 'NXG-${suffix.toUpperCase()}';
}

/// `VAGA #6/8` na categoria.
String formatRegistrationSlotLabel({
  required TournamentCategoryOffer? offer,
  required Map<String, int> enrollmentByCategoryId,
  required String categoryId,
}) {
  if (offer == null) return 'VAGA —';
  final capacity = categoryMaxTeams(offer);
  final enrolled = categoryEnrolledCount(
    offer,
    inscriptionCount: enrollmentByCategoryId[categoryId],
  );
  if (capacity <= 0) return 'VAGA #$enrolled';
  return 'VAGA #$enrolled/$capacity';
}

String tournamentSuccessLocationSubtitle(TournamentDetail tournament) {
  final date = tournament.dateLabel.trim();
  final location = tournament.location.trim();
  if (date.isEmpty && location.isEmpty) return '';
  if (date.isEmpty) return location;
  if (location.isEmpty) return date;
  return '$date · $location';
}

final _shareDayFmt = DateFormat('d', 'pt_BR');
final _shareMonthFmt = DateFormat('MMM', 'pt_BR');
final _shareFooterFmt = DateFormat('MMM yyyy', 'pt_BR');

String initialsFromDisplayName(String name) {
  final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first.toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

String formatShareCardPlayerLine(String player1, String player2) {
  final p1 = player1.trim();
  final p2 = player2.trim();
  if (p1.isEmpty && p2.isEmpty) return '—';
  if (p1.isEmpty) return p2;
  if (p2.isEmpty) return p1;
  return '$p1 · $p2';
}

/// `18–20 Mai` para o card compartilhável.
String tournamentShareCardDateLabel(TournamentDetail tournament) {
  final start = tournament.startDate;
  final end = tournament.endDate;
  final month = _shareMonthFmt.format(start);
  final cap =
      month.isEmpty ? month : '${month[0].toUpperCase()}${month.substring(1)}';

  if (end != null &&
      (end.year != start.year ||
          end.month != start.month ||
          end.day != start.day)) {
    final endMonth = _shareMonthFmt.format(end);
    final endCap = endMonth.isEmpty
        ? endMonth
        : '${endMonth[0].toUpperCase()}${endMonth.substring(1)}';
    if (start.month == end.month && start.year == end.year) {
      return '${_shareDayFmt.format(start)}–${_shareDayFmt.format(end)} $cap';
    }
    return '${_shareDayFmt.format(start)} $cap – ${_shareDayFmt.format(end)} $endCap';
  }

  final label = tournament.dateLabel.trim();
  if (label.isNotEmpty) return label;
  return '${_shareDayFmt.format(start)} $cap';
}

/// `Arena Beach GYN · Goiânia, GO`
String tournamentShareCardLocationLine(TournamentDetail tournament) {
  final location = tournament.location.trim();
  final city = tournament.city.trim();
  if (location.isEmpty && city.isEmpty) return '';
  if (city.isEmpty) return location;
  if (location.isEmpty) return city;
  return '$location · $city';
}

/// `NEXAGO.APP · MAI 2026`
String tournamentShareCardFooter(TournamentDetail tournament) {
  final label = _shareFooterFmt.format(tournament.startDate).toUpperCase();
  return 'NEXAGO.APP · $label';
}
