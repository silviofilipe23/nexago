import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/store/domain/store_models.dart';
import 'package:nexago_app/features/store/domain/store_pickup.dart';

// Goiânia: Setor Bueno (perto) e Jardim Goiás (mais longe do atleta).
const _bueno = StorePickupArena(
  arenaId: 'bueno',
  name: 'Arena Bueno',
  latitude: -16.7095,
  longitude: -49.2622,
);
const _goias = StorePickupArena(
  arenaId: 'goias',
  name: 'Arena Goiás',
  latitude: -16.7050,
  longitude: -49.2380,
);
const _semCoordenada = StorePickupArena(arenaId: 'sem', name: 'Arena Sem GPS');

const _arenas = [_bueno, _goias, _semCoordenada];
const _today = '2026-10-16';

// Atleta no Setor Bueno.
const _lat = -16.7100;
const _lng = -49.2630;

StoreBookingVisit _visit(String arenaId, String day, [String status = 'active']) =>
    StoreBookingVisit(arenaId: arenaId, dateKey: day, status: status);

void main() {
  group('arena de retirada (escolhida → frequente → próxima → nenhuma)', () {
    test('1. a escolhida pelo atleta manda', () {
      final choice = resolveStorePickupArena(
        arenas: _arenas,
        chosenArenaId: 'goias',
        visits: [_visit('bueno', '2026-10-10'), _visit('bueno', '2026-10-12')],
        todayKey: _today,
        userLatitude: _lat,
        userLongitude: _lng,
      );
      expect(choice.arena?.arenaId, 'goias');
      expect(choice.source, StorePickupSource.chosen);
    });

    test('escolhida que deixou de ser ponto ativo é ignorada', () {
      final choice = resolveStorePickupArena(
        arenas: _arenas,
        chosenArenaId: 'fechou',
        visits: [_visit('goias', '2026-10-10')],
        todayKey: _today,
      );
      expect(choice.arena?.arenaId, 'goias');
      expect(choice.source, StorePickupSource.frequent);
    });

    test('2. a mais frequente nas reservas ativas dos últimos 60 dias', () {
      final choice = resolveStorePickupArena(
        arenas: _arenas,
        visits: [
          _visit('goias', '2026-10-01'),
          _visit('goias', '2026-10-08'),
          _visit('bueno', '2026-10-15'),
          // Cancelada não conta.
          _visit('bueno', '2026-10-14', 'cancelled'),
          _visit('bueno', '2026-10-13', 'canceled'),
          // Fora da janela de 60 dias não conta.
          _visit('bueno', '2026-08-16'),
          _visit('bueno', '2026-08-01'),
          // Arena que não é ponto de retirada não conta.
          _visit('outra', '2026-10-10'),
          _visit('outra', '2026-10-11'),
          _visit('outra', '2026-10-12'),
        ],
        todayKey: _today,
        userLatitude: _lat,
        userLongitude: _lng,
      );
      expect(choice.arena?.arenaId, 'goias');
      expect(choice.source, StorePickupSource.frequent);
    });

    test('a janela começa exatamente 60 dias atrás', () {
      final choice = resolveStorePickupArena(
        arenas: _arenas,
        visits: [_visit('goias', '2026-08-17')],
        todayKey: _today,
      );
      expect(choice.arena?.arenaId, 'goias');
      final outside = resolveStorePickupArena(
        arenas: _arenas,
        visits: [_visit('goias', '2026-08-16')],
        todayKey: _today,
      );
      expect(outside.source, StorePickupSource.none);
    });

    test('empate de frequência: a reserva mais recente desempata', () {
      final choice = resolveStorePickupArena(
        arenas: _arenas,
        visits: [
          _visit('bueno', '2026-10-02'),
          _visit('goias', '2026-10-09'),
          _visit('bueno', '2026-10-05'),
          _visit('goias', '2026-10-11'),
        ],
        todayKey: _today,
      );
      expect(choice.arena?.arenaId, 'goias');
    });

    test('3. sem reservas: a mais próxima pela localização já concedida', () {
      final choice = resolveStorePickupArena(
        arenas: _arenas,
        todayKey: _today,
        userLatitude: _lat,
        userLongitude: _lng,
      );
      expect(choice.arena?.arenaId, 'bueno');
      expect(choice.source, StorePickupSource.nearest);
    });

    test('4. sem escolha, reserva nem localização: nenhuma', () {
      final choice = resolveStorePickupArena(arenas: _arenas, todayKey: _today);
      expect(choice.arena, isNull);
      expect(choice.source, StorePickupSource.none);
    });

    test('sem pontos de retirada: nenhuma, mesmo com escolha salva', () {
      final choice = resolveStorePickupArena(
        arenas: const [],
        chosenArenaId: 'bueno',
        todayKey: _today,
      );
      expect(choice.source, StorePickupSource.none);
    });

    test('status de reserva ativa', () {
      expect(storeBookingIsActive('active'), isTrue);
      expect(storeBookingIsActive('checkin_open'), isTrue);
      expect(storeBookingIsActive('pending'), isTrue);
      expect(storeBookingIsActive('CANCELLED'), isFalse);
      expect(storeBookingIsActive('expired'), isFalse);
    });
  });

  group('folha "Trocar"', () {
    test('mais perto primeiro; sem coordenada no fim', () {
      final sorted = sortStorePickupArenasByDistance(
        const [_semCoordenada, _goias, _bueno],
        latitude: _lat,
        longitude: _lng,
      );
      expect(
        [for (final s in sorted) s.arena.arenaId],
        ['bueno', 'goias', 'sem'],
      );
      expect(sorted.first.distanceKm, lessThan(sorted[1].distanceKm!));
      expect(sorted.last.distanceKm, isNull);
    });

    test('sem localização do atleta mantém a ordem do servidor', () {
      final sorted = sortStorePickupArenasByDistance(_arenas);
      expect([for (final s in sorted) s.arena.arenaId], ['bueno', 'goias', 'sem']);
      expect(sorted.every((s) => s.distanceKm == null), isTrue);
    });

    test('distância formatada', () {
      expect(formatStoreDistance(0.8), '800 m');
      expect(formatStoreDistance(0.004), '10 m');
      expect(formatStoreDistance(2.34), '2,3 km');
      expect(formatStoreDistance(12.6), '13 km');
    });
  });
}
