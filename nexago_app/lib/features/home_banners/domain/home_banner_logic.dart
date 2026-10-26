import 'home_banner.dart';

/// Teto do carrossel: com mais cards o atleta não chega ao fim (o backoffice
/// já avisa a partir de 5).
const homeBannerCarouselMax = 6;

/// "Novos" = conta criada há até 30 dias.
const homeBannerNewAthleteDays = 30;

/// Data civil de São Paulo (`YYYY-MM-DD`) — as datas do banner são de lá. O
/// Brasil não tem horário de verão desde 2019: UTC−3 fixo.
String saoPauloDateKey(DateTime now) {
  final sp = now.toUtc().subtract(const Duration(hours: 3));
  String two(int v) => v.toString().padLeft(2, '0');
  return '${sp.year}-${two(sp.month)}-${two(sp.day)}';
}

/// O que o app sabe do atleta para decidir o público. `null` = ainda
/// carregando: o banner daquele público espera em vez de piscar.
class HomeBannerAthlete {
  const HomeBannerAthlete({
    this.accountCreatedAt,
    this.hasBookings,
    this.hasTournaments,
  });

  final DateTime? accountCreatedAt;
  final bool? hasBookings;
  final bool? hasTournaments;
}

bool homeBannerAudienceMatches(
  HomeBannerAudience audience,
  HomeBannerAthlete athlete,
  DateTime now,
) {
  return switch (audience) {
    HomeBannerAudience.all => true,
    HomeBannerAudience.newAthletes => athlete.accountCreatedAt != null &&
        now.difference(athlete.accountCreatedAt!).inDays <
            homeBannerNewAthleteDays,
    HomeBannerAudience.noBooking => athlete.hasBookings == false,
    HomeBannerAudience.booked => athlete.hasBookings == true,
    HomeBannerAudience.noTournament => athlete.hasTournaments == false,
  };
}

/// Os banners que este atleta vê agora, na ordem do backoffice: dentro do
/// período, no público, não dispensados, não escondidos pelo primeiro toque e
/// com o destino disponível neste app (ex.: Loja desligada esconde o banner
/// da Loja).
List<HomeBanner> eligibleHomeBanners({
  required List<HomeBanner> banners,
  required Map<String, HomeBannerMarks> marks,
  required HomeBannerAthlete athlete,
  required DateTime now,
  bool Function(HomeBannerDestination destination)? destinationAvailable,
}) {
  final today = saoPauloDateKey(now);
  return banners.where((b) {
    if (b.startDate != null && b.startDate!.compareTo(today) > 0) return false;
    if (b.endDate != null && b.endDate!.compareTo(today) < 0) return false;
    final m = marks[b.id] ?? const HomeBannerMarks();
    if (b.dismissible && m.dismissed) return false;
    if (b.hideAfterClick && m.clicked) return false;
    if (destinationAvailable != null && !destinationAvailable(b.destination)) {
      return false;
    }
    return homeBannerAudienceMatches(b.audience, athlete, now);
  }).toList();
}

/// O que ocupa o lugar do banner na Home: o carrossel com os cards de
/// carrossel; sem nenhum, o primeiro compacto. Mesma regra de `homeSlot` no
/// backoffice.
class HomeBannerSlot {
  const HomeBannerSlot(this.format, this.banners);

  final HomeBannerFormat format;
  final List<HomeBanner> banners;
}

HomeBannerSlot? homeBannerSlot(List<HomeBanner> eligible) {
  final carousel = eligible
      .where((b) => b.format == HomeBannerFormat.carousel)
      .take(homeBannerCarouselMax)
      .toList();
  if (carousel.isNotEmpty) {
    return HomeBannerSlot(HomeBannerFormat.carousel, carousel);
  }
  final compact =
      eligible.where((b) => b.format == HomeBannerFormat.compact).firstOrNull;
  return compact == null
      ? null
      : HomeBannerSlot(HomeBannerFormat.compact, [compact]);
}
