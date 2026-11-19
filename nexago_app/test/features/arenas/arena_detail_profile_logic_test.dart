import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_detail_profile_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_promotion.dart';

ArenaListItem _arena({
  String? coverUrl,
  List<String> gallery = const [],
  double price = 0,
  String? addressLine,
  String? city,
  String? state,
  String locationLabel = '',
  String? whatsapp,
  String? phone,
  double? lat,
  double? lng,
}) {
  return ArenaListItem(
    id: 'a1',
    name: 'Arena Pé na Areia',
    locationLabel: locationLabel,
    coverUrl: coverUrl,
    galleryImageUrls: gallery,
    pricePerHourReais: price,
    addressLine: addressLine,
    city: city,
    state: state,
    whatsapp: whatsapp,
    phone: phone,
    latitude: lat,
    longitude: lng,
  );
}

ArenaCourt _court(String id, {double? price, bool maintenance = false}) {
  return ArenaCourt(
    id: id,
    name: 'Quadra $id',
    sportTypes: const ['Areia'],
    status:
        maintenance ? ArenaCourtStatus.maintenance : ArenaCourtStatus.active,
    basePricePerHourReais: price,
  );
}

ArenaPromotion _promo({
  bool active = true,
  DateTime? validFrom,
  DateTime? validUntil,
  String label = 'Tarde',
}) {
  return ArenaPromotion(
    id: label,
    active: active,
    label: label,
    courtIds: const [],
    weekdays: const [2, 4],
    startTime: '14:00',
    endTime: '17:00',
    discountPercent: 20,
    validFrom: validFrom,
    validUntil: validUntil,
  );
}

void main() {
  group('arenaGalleryUrls', () {
    test('puts the cover first and keeps the gallery order', () {
      final urls = arenaGalleryUrls(
        _arena(coverUrl: 'c.jpg', gallery: const ['g1.jpg', 'g2.jpg']),
      );
      expect(urls, ['c.jpg', 'g1.jpg', 'g2.jpg']);
    });

    test('drops blanks and duplicates of the cover', () {
      final urls = arenaGalleryUrls(
        _arena(coverUrl: ' c.jpg ', gallery: const ['', 'c.jpg', ' g1.jpg']),
      );
      expect(urls, ['c.jpg', 'g1.jpg']);
    });

    test('is empty without cover nor gallery', () {
      expect(arenaGalleryUrls(_arena()), isEmpty);
    });

    test('uses the gallery when there is no cover', () {
      expect(arenaGalleryUrls(_arena(gallery: const ['g1.jpg'])), ['g1.jpg']);
    });
  });

  group('arenaEntryPricePerHour', () {
    test('is the cheapest open court', () {
      final price = arenaEntryPricePerHour(
        courts: [_court('1', price: 120), _court('2', price: 90)],
        arenaFallbackPerHour: 100,
      );
      expect(price, 90);
    });

    test('ignores courts in maintenance', () {
      final price = arenaEntryPricePerHour(
        courts: [
          _court('1', price: 120),
          _court('2', price: 50, maintenance: true),
        ],
        arenaFallbackPerHour: 0,
      );
      expect(price, 120);
    });

    test('courts without price use the arena price', () {
      final price = arenaEntryPricePerHour(
        courts: [_court('1'), _court('2', price: 130)],
        arenaFallbackPerHour: 80,
      );
      expect(price, 80);
    });

    test('falls back to the arena price without courts', () {
      expect(
        arenaEntryPricePerHour(courts: const [], arenaFallbackPerHour: 75),
        75,
      );
    });

    test('is null when nothing has a price', () {
      expect(
        arenaEntryPricePerHour(courts: [_court('1')], arenaFallbackPerHour: 0),
        isNull,
      );
    });
  });

  group('arenaFullAddress', () {
    test('joins the street with city and state', () {
      final address = arenaFullAddress(
        _arena(addressLine: 'Rua 10, 200', city: 'Goiânia', state: 'GO'),
      );
      expect(address, 'Rua 10, 200 · Goiânia, GO');
    });

    test('does not repeat the city already in the street line', () {
      final address = arenaFullAddress(
        _arena(
          addressLine: 'Rua 10, 200, Goiânia - GO',
          city: 'Goiânia',
          state: 'GO',
        ),
      );
      expect(address, 'Rua 10, 200, Goiânia - GO');
    });

    test('uses city and state alone without a street', () {
      expect(
        arenaFullAddress(_arena(city: 'Goiânia', state: 'GO')),
        'Goiânia, GO',
      );
    });

    test('falls back to the location label', () {
      expect(
        arenaFullAddress(_arena(locationLabel: 'Setor Bueno')),
        'Setor Bueno',
      );
    });

    test('is null with nothing to show', () {
      expect(arenaFullAddress(_arena()), isNull);
    });
  });

  group('arenaHasDirections', () {
    test('is true with coordinates', () {
      expect(arenaHasDirections(_arena(lat: -16.7, lng: -49.2)), isTrue);
    });

    test('is true with an address', () {
      expect(arenaHasDirections(_arena(addressLine: 'Rua 10')), isTrue);
    });

    test('is false with only the arena name', () {
      expect(arenaHasDirections(_arena()), isFalse);
    });
  });

  group('arenaDirectionsUrl', () {
    test('routes to the coordinates when there are any', () {
      final url = arenaDirectionsUrl(_arena(lat: -16.7, lng: -49.2));
      expect(Uri.parse(url).queryParameters['destination'], '-16.7,-49.2');
    });

    test('searches name and address without coordinates', () {
      final url = arenaDirectionsUrl(
        _arena(addressLine: 'Rua 10, 200', city: 'Goiânia', state: 'GO'),
      );
      final destination = Uri.parse(url).queryParameters['destination'];
      expect(destination, contains('Arena Pé na Areia'));
      expect(destination, contains('Rua 10, 200'));
    });
  });

  group('arenaPaymentMethodsLabel', () {
    test('both methods', () {
      expect(
        arenaPaymentMethodsLabel(online: true, onsite: true),
        'Pix ou cartão pelo app, ou na arena',
      );
    });

    test('only online', () {
      expect(
        arenaPaymentMethodsLabel(online: true, onsite: false),
        'Pix ou cartão pelo app',
      );
    });

    test('only onsite', () {
      expect(
        arenaPaymentMethodsLabel(online: false, onsite: true),
        'Pagamento na arena',
      );
    });

    test('neither is null', () {
      expect(arenaPaymentMethodsLabel(online: false, onsite: false), isNull);
    });
  });

  group('visibleArenaPromotions', () {
    final today = DateTime(2026, 11, 19, 15, 30);

    test('keeps active promotions in their window', () {
      final promos = visibleArenaPromotions(
        [
          _promo(label: 'a'),
          _promo(label: 'b', validUntil: DateTime(2026, 11, 19)),
          _promo(label: 'c', validFrom: DateTime(2026, 11, 1)),
        ],
        today,
      );
      expect(promos.map((p) => p.label), ['a', 'b', 'c']);
    });

    test('drops paused and expired promotions', () {
      final promos = visibleArenaPromotions(
        [
          _promo(label: 'paused', active: false),
          _promo(label: 'expired', validUntil: DateTime(2026, 11, 18)),
        ],
        today,
      );
      expect(promos, isEmpty);
    });

    test('keeps a promotion that starts later, so the athlete plans ahead', () {
      final promos = visibleArenaPromotions(
        [_promo(label: 'soon', validFrom: DateTime(2026, 12, 1))],
        today,
      );
      expect(promos.single.label, 'soon');
    });
  });

  group('arenaShareMessage', () {
    test('names the arena, the city and the link', () {
      final text = arenaShareMessage(
        _arena(city: 'Goiânia', state: 'GO'),
        url: 'https://atleta.nexago.com.br/reservar/a1',
      );
      expect(
        text,
        'Bora jogar na Arena Pé na Areia (Goiânia, GO)? '
        'Dá para ver os horários e reservar pela nexaGO: '
        'https://atleta.nexago.com.br/reservar/a1',
      );
    });

    test('leaves the city out when unknown', () {
      final text = arenaShareMessage(_arena(), url: 'https://x');
      expect(
        text,
        'Bora jogar na Arena Pé na Areia? '
        'Dá para ver os horários e reservar pela nexaGO: https://x',
      );
    });
  });

  group('arenaPartnerWhatsAppMessage', () {
    test('mentions the arena by name', () {
      expect(
        arenaPartnerWhatsAppMessage('Arena Pé na Areia'),
        'Olá! Vi a Arena Pé na Areia na nexaGO e tenho uma dúvida.',
      );
    });
  });

  group('arenaPartnerWhatsAppUrl', () {
    test('uses the WhatsApp number', () {
      final url = arenaPartnerWhatsAppUrl(_arena(whatsapp: '(62) 99999-0000'));
      expect(url, startsWith('https://wa.me/'));
      expect(url, contains('62999990000'));
    });

    test('falls back to the phone', () {
      final url = arenaPartnerWhatsAppUrl(_arena(phone: '62 98888-1111'));
      expect(url, contains('62988881111'));
    });

    test('is null without any number', () {
      expect(arenaPartnerWhatsAppUrl(_arena()), isNull);
    });
  });
}
