import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/user_location_snapshot.dart';
import 'package:nexago_app/features/arenas/domain/arena_amenities.dart';
import 'package:nexago_app/features/arenas/domain/arena_contact_message.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filter_logic.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_filters.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_providers.dart';

ArenaListItem _arena({
  required String id,
  String name = 'Arena',
  bool isUnclaimed = false,
  String? whatsapp,
  int reputationScore = 90,
  ArenaAmenities amenities = ArenaAmenities.empty,
  bool online = true,
  bool onsite = true,
}) {
  return ArenaListItem(
    id: id,
    name: name,
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: isUnclaimed ? 0 : 80,
    city: 'Goiânia',
    state: 'GO',
    latitude: -16.68,
    longitude: -49.26,
    courtTypes: const ['Vôlei de praia'],
    amenities: amenities,
    reputationScore: reputationScore,
    onlinePaymentEnabled: online,
    onsitePaymentEnabled: onsite,
    whatsapp: whatsapp,
    isUnclaimed: isUnclaimed,
  );
}

ArenaSearchResult _result(
  ArenaListItem arena, {
  double display = 80,
  bool hasSlot = false,
  bool exact = false,
}) {
  return ArenaSearchResult(
    arena: arena,
    selectedSlot: null,
    courtName: null,
    isExactMatch: exact,
    minutesDistance: null,
    displayPricePerHourReais: display,
  );
}

void main() {
  const user = UserLocationSnapshot(
    source: UserLocationSource.profile,
    city: 'Goiânia',
    state: 'GO',
    latitude: -16.68,
    longitude: -49.26,
  );

  List<String> idsAfterFilter(
    List<ArenaSearchResult> results,
    ArenaSearchFilters filters,
  ) {
    return filterAndSortArenaResults(
      results: results,
      filters: filters,
      userLocation: user,
      favoriteIds: const {},
    ).map((e) => e.result.arena.id).toList();
  }

  group('buildArenaContactWhatsAppMessage', () {
    test('diz de onde o atleta veio — é o ponto da mensagem', () {
      final msg = buildArenaContactWhatsAppMessage(arenaName: 'Arena Beach T3');
      expect(msg, contains('nexaGO'));
      expect(msg, contains('Arena Beach T3'));
    });

    test('nome vazio não vira frase quebrada', () {
      final msg = buildArenaContactWhatsAppMessage(arenaName: '   ');
      expect(msg, contains('nexaGO'));
      expect(msg, contains('a arena'));
      expect(msg, isNot(contains('Vi  no app')));
    });
  });

  group('buildNexagoArenaSignupContactUrl', () {
    test('sem WhatsApp comercial configurado, cai no e-mail de vendas', () {
      // Enquanto `kNexagoSalesWhatsApp` estiver vazio o botão tem de continuar
      // funcionando — link `wa.me` quebrado seria pior que não ter botão.
      final url = buildNexagoArenaSignupContactUrl();
      if (kNexagoSalesWhatsApp.isEmpty) {
        expect(url, startsWith('mailto:$kNexagoSalesEmail'));
        expect(url, contains('subject='));
      } else {
        expect(url, startsWith('https://wa.me/'));
      }
    });

    test('a mensagem diz que é dono de arena querendo cadastrar', () {
      final url = Uri.decodeFull(buildNexagoArenaSignupContactUrl());
      expect(url, contains('arena'));
      expect(url, contains('nexaGO'));
    });
  });

  group('ArenaListItem.isUnclaimed', () {
    test('ausência do campo mantém a arena como parceira', () {
      expect(_arena(id: 'a').isUnclaimed, isFalse);
    });
  });

  group('busca com arena pré-cadastrada', () {
    test('aparece quando não há filtro de promessa', () {
      final partner = _arena(id: 'partner');
      final unclaimed = _arena(id: 'pre', isUnclaimed: true);

      final ids = idsAfterFilter(
        [_result(partner), _result(unclaimed, display: 0)],
        ArenaSearchFilters.showAll(slot: ArenaSearchFilters.defaults().slot),
      );

      expect(ids, containsAll(<String>['partner', 'pre']));
    });

    test('some quando o atleta filtra por faixa de preço', () {
      final partner = _arena(id: 'partner');
      final unclaimed = _arena(id: 'pre', isUnclaimed: true);
      final filters = ArenaSearchFilters.showAll(
        slot: ArenaSearchFilters.defaults().slot,
      ).copyWith(priceBand: ArenaPriceBand.upTo60);

      final ids = idsAfterFilter(
        [_result(partner), _result(unclaimed, display: 0)],
        filters,
      );

      expect(ids, isNot(contains('pre')));
    });

    test('some quando o atleta exige reputação mínima', () {
      final unclaimed = _arena(id: 'pre', isUnclaimed: true, reputationScore: 0);
      final filters = ArenaSearchFilters.showAll(
        slot: ArenaSearchFilters.defaults().slot,
      ).copyWith(minReputationScore: 50);

      expect(idsAfterFilter([_result(unclaimed, display: 0)], filters), isEmpty);
    });

    test('nunca passa na frente de parceira, nem sem disponibilidade', () {
      final semSlot = _result(_arena(id: 'partner-sem-slot'));
      final pre = _result(_arena(id: 'pre', isUnclaimed: true), display: 0);

      final ordered = [pre, semSlot]..sort(compareArenaSearchResults);

      expect(ordered.map((e) => e.arena.id).toList(), [
        'partner-sem-slot',
        'pre',
      ]);
    });
  });
}
