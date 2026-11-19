import 'arena_booking_success_actions.dart';
import 'arena_court.dart';
import 'arena_list_item.dart';
import 'arena_promotion.dart';
import 'court_pricing.dart';

/// Regras puras do perfil público da arena (app do atleta): o que mostrar da
/// galeria, do endereço, do pagamento, das promoções e do compartilhar.

/// Fotos do perfil: a capa primeiro, depois a galeria, sem vazios e sem
/// repetir a capa.
List<String> arenaGalleryUrls(ArenaListItem arena) {
  final seen = <String>{};
  final urls = <String>[];
  for (final raw in [arena.coverUrl, ...arena.galleryImageUrls]) {
    final url = raw?.trim() ?? '';
    if (url.isEmpty || !seen.add(url)) continue;
    urls.add(url);
  }
  return List.unmodifiable(urls);
}

/// Menor preço/h entre as quadras abertas ("a partir de"). Quadra sem preço
/// próprio usa o da arena; sem quadra nenhuma vale o da arena. `null` quando
/// nada tem preço.
double? arenaEntryPricePerHour({
  required List<ArenaCourt> courts,
  required double arenaFallbackPerHour,
}) {
  final fallback = arenaFallbackPerHour > 0 ? arenaFallbackPerHour : null;
  double? cheapest;
  for (final court in courts) {
    if (court.isMaintenance) continue;
    final hourly = CourtPricing.resolveHourlyBase(
      court: court,
      arenaFallbackPerHourReais: fallback,
    );
    if (hourly == null) continue;
    if (cheapest == null || hourly < cheapest) cheapest = hourly;
  }
  return cheapest ?? fallback;
}

String _cityState(ArenaListItem arena) {
  final city = arena.city?.trim() ?? '';
  final state = arena.state?.trim() ?? '';
  if (city.isNotEmpty && state.isNotEmpty) return '$city, $state';
  return city.isNotEmpty ? city : state;
}

/// Endereço para exibir: rua + cidade/UF, sem repetir a cidade quando a linha
/// da rua já traz. `null` quando a arena não informou nada.
String? arenaFullAddress(ArenaListItem arena) {
  final street = arena.addressLine?.trim() ?? '';
  final cityState = _cityState(arena);
  final city = arena.city?.trim() ?? '';

  if (street.isNotEmpty) {
    final alreadyHasCity =
        city.isNotEmpty && street.toLowerCase().contains(city.toLowerCase());
    if (cityState.isEmpty || alreadyHasCity) return street;
    return '$street · $cityState';
  }
  if (cityState.isNotEmpty) return cityState;

  final label = arena.locationLabel.trim();
  return label.isEmpty ? null : label;
}

bool _hasCoordinates(ArenaListItem arena) {
  final lat = arena.latitude;
  final lng = arena.longitude;
  return lat != null && lng != null && lat.isFinite && lng.isFinite;
}

/// Dá para traçar rota: coordenadas, rua ou ao menos a cidade.
bool arenaHasDirections(ArenaListItem arena) =>
    _hasCoordinates(arena) ||
    (arena.addressLine?.trim().isNotEmpty ?? false) ||
    _cityState(arena).isNotEmpty;

/// Rota no mapa até a arena (coordenadas quando houver, senão a busca pelo
/// nome + endereço).
String arenaDirectionsUrl(ArenaListItem arena) {
  final String destination;
  if (_hasCoordinates(arena)) {
    destination = '${arena.latitude},${arena.longitude}';
  } else {
    final address = arenaFullAddress(arena)?.replaceAll(' · ', ', ');
    final name = arena.name.trim();
    destination = address == null ? name : '$name, $address';
  }
  return ArenaBookingSuccessActions.buildMapsDirectionsUrl(
    destination: destination,
  );
}

/// Como pagar a reserva nesta arena. `null` quando nenhuma forma está ligada.
String? arenaPaymentMethodsLabel({
  required bool online,
  required bool onsite,
}) {
  if (online && onsite) return 'Pix ou cartão pelo app, ou na arena';
  if (online) return 'Pix ou cartão pelo app';
  if (onsite) return 'Pagamento na arena';
  return null;
}

DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

/// Promoções que o atleta ainda pode aproveitar: ativas e não vencidas. As que
/// começam depois ficam, para ele planejar.
List<ArenaPromotion> visibleArenaPromotions(
  List<ArenaPromotion> promotions,
  DateTime now,
) {
  final today = _dateOnly(now);
  return List.unmodifiable(
    promotions.where((promo) {
      if (!promo.active) return false;
      final until = promo.validUntil;
      return until == null || !_dateOnly(until).isBefore(today);
    }),
  );
}

/// Texto do compartilhar o perfil (a hashtag entra no `nexaShareText`).
String arenaShareMessage(ArenaListItem arena, {required String url}) {
  final cityState = _cityState(arena);
  final where = cityState.isEmpty ? '' : ' ($cityState)';
  return 'Bora jogar na ${arena.name.trim()}$where? '
      'Dá para ver os horários e reservar pela nexaGO: $url';
}

/// Primeira mensagem do atleta para uma arena parceira.
String arenaPartnerWhatsAppMessage(String arenaName) {
  final name = arenaName.trim();
  final target = name.isEmpty ? 'arena' : name;
  return 'Olá! Vi a $target na nexaGO e tenho uma dúvida.';
}

/// Link do WhatsApp da arena parceira (o WhatsApp cadastrado ou, sem ele, o
/// telefone). `null` quando não há número utilizável.
String? arenaPartnerWhatsAppUrl(ArenaListItem arena) {
  final whatsapp = arena.whatsapp?.trim() ?? '';
  return ArenaBookingSuccessActions.buildWhatsAppUrl(
    phone: whatsapp.isNotEmpty ? whatsapp : arena.phone,
    message: arenaPartnerWhatsAppMessage(arena.name),
  );
}
