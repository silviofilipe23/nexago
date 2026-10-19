import 'package:flutter/foundation.dart';

import '../../../core/brand/nexa_hashtag.dart';
import '../../../core/profiles/app_user_profile.dart';
import '../../../core/sports/sport_catalog.dart';
import 'arena_booking_labels.dart';
import 'my_booking_confirmed_athlete.dart';

/// Fundo do story da reserva (protótipo "Reservar · 5 · Compartilhar no story").
enum BookingStoryTheme {
  photo('Foto'),
  ember('Brasa'),
  night('Noite'),
  sand('Areia');

  const BookingStoryTheme(this.label);

  final String label;

  /// Areia é o único fundo claro: texto escuro por cima.
  bool get isLight => this == BookingStoryTheme.sand;
}

/// Informações que o atleta liga/desliga no story, na ordem dos chips.
enum BookingStoryInfo {
  time('Data e hora'),
  arena('Arena'),
  crew('Galera'),
  sport('Modalidade');

  const BookingStoryInfo(this.label);

  final String label;
}

/// Uma pessoa na linha "Galera" do story.
@immutable
class BookingStoryPerson {
  const BookingStoryPerson({
    required this.firstName,
    required this.initials,
    this.avatarUrl,
  });

  final String firstName;
  final String initials;
  final String? avatarUrl;
}

/// Tudo o que a arte do story escreve — já formatado.
@immutable
class BookingStoryData {
  const BookingStoryData({
    required this.timeRange,
    required this.dateLabel,
    required this.arenaName,
    required this.courtName,
    this.sportLabel,
    this.crew = const [],
  });

  /// `09:00–10:30`.
  final String timeRange;

  /// `SEX · 22 MAI`.
  final String dateLabel;
  final String arenaName;
  final String courtName;

  /// `VÔLEI DE PRAIA`; `null` quando a reserva não tem esporte gravado.
  final String? sportLabel;

  /// Quem reservou primeiro, depois os confirmados.
  final List<BookingStoryPerson> crew;

  /// Chips que fazem sentido para esta reserva: sem esporte gravado não há
  /// "Modalidade", e sem perfil carregado não há "Galera".
  List<BookingStoryInfo> get availableInfos => [
        for (final info in BookingStoryInfo.values)
          if (switch (info) {
            BookingStoryInfo.sport => sportLabel != null,
            BookingStoryInfo.crew => crew.isNotEmpty,
            _ => true,
          })
            info,
      ];
}

/// Monta os dados do story a partir da reserva recém-confirmada.
BookingStoryData bookingStoryDataFrom({
  required String arenaName,
  required String courtName,
  required String dateKey,
  required String startTime,
  required String endTime,
  String? sport,
  List<BookingStoryPerson> crew = const [],
}) {
  return BookingStoryData(
    timeRange: bookingStoryTimeRange(startTime, endTime),
    dateLabel: formatTicketDateCompact(dateKey).replaceAll('•', '·'),
    arenaName: arenaName.trim(),
    courtName: courtName.trim(),
    sportLabel: SportCatalog.labelOf(sport)?.toUpperCase(),
    crew: crew,
  );
}

/// `09:00` + `10:30` → `09:00–10:30` (meia-risca sem espaço, como no protótipo).
String bookingStoryTimeRange(String start, String end) {
  String hm(String v) => v.length >= 5 ? v.substring(0, 5) : v.trim();
  final s = hm(start);
  final e = hm(end);
  if (s.isEmpty) return e;
  if (e.isEmpty) return s;
  return '$s–$e';
}

/// Quem reservou ([ownerName]) na frente, depois os confirmados da reserva,
/// sem repetir ninguém. Só o primeiro nome: o story é público.
List<BookingStoryPerson> bookingStoryCrew({
  String? ownerUid,
  String? ownerName,
  String? ownerAvatarUrl,
  Iterable<MyBookingConfirmedAthlete> confirmed = const [],
}) {
  final crew = <BookingStoryPerson>[];
  final seen = <String>{};

  void add(String? uid, String? name, String? avatarUrl) {
    final display = name?.trim() ?? '';
    if (display.isEmpty) return;
    final id = uid?.trim() ?? '';
    final key = id.isNotEmpty ? 'uid:$id' : 'name:$display';
    if (!seen.add(key)) return;
    crew.add(
      BookingStoryPerson(
        firstName: display.split(RegExp(r'\s+')).first,
        initials: initialsFromDisplayName(display),
        avatarUrl: (avatarUrl?.trim() ?? '').isEmpty ? null : avatarUrl,
      ),
    );
  }

  add(ownerUid, ownerName, ownerAvatarUrl);
  for (final athlete in confirmed) {
    add(athlete.userId, athlete.displayName, athlete.avatarUrl);
  }
  return crew;
}

/// `Ana` · `Ana e Enzo` · `Ana, Enzo e Lia` · `Ana, Enzo, Rafael e Lia` ·
/// `Ana, Enzo, Rafael e +2`.
String bookingStoryCrewNames(List<BookingStoryPerson> crew) {
  final names = [for (final p in crew) p.firstName];
  if (names.isEmpty) return '';
  if (names.length == 1) return names.first;
  if (names.length <= 4) {
    return '${names.sublist(0, names.length - 1).join(', ')} e ${names.last}';
  }
  return '${names.take(3).join(', ')} e +${names.length - 3}';
}

/// Segunda linha da "Galera": quantos vão jogar — ou, sozinho, o convite.
String bookingStoryCrewCaption(int count) =>
    count <= 1 ? 'Quem vem jogar?' : '$count na quadra';

/// Legenda que acompanha a imagem na folha de compartilhamento.
String bookingStoryShareText(BookingStoryData data) {
  return withNexaHashtag(
    'Quadra garantida na ${data.arenaName}! '
    '${data.dateLabel.toLowerCase()} · ${data.timeRange}. Bora jogar?',
  );
}
