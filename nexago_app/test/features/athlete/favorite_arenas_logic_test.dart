import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_list_item.dart';
import 'package:nexago_app/features/athlete/domain/favorites_providers.dart';

ArenaListItem _arena(String id, {String name = 'Arena'}) {
  return ArenaListItem(
    id: id,
    name: name,
    locationLabel: 'Goiânia · GO',
    pricePerHourReais: 80,
  );
}

void main() {
  group('mergeFavoriteArenas', () {
    test('preserves favorite order and skips missing arenas', () {
      final arenas = [
        _arena('a1', name: 'Arena 1'),
        _arena('a2', name: 'Arena 2'),
        _arena('a3', name: 'Arena 3'),
      ];

      final merged = mergeFavoriteArenas(
        favoriteIds: const ['a3', 'missing', 'a1'],
        arenas: arenas,
      );

      expect(merged.map((a) => a.id).toList(), ['a3', 'a1']);
      expect(merged.first.name, 'Arena 3');
    });

    test('returns empty when no favorites', () {
      expect(
        mergeFavoriteArenas(
          favoriteIds: const [],
          arenas: [_arena('a1')],
        ),
        isEmpty,
      );
    });
  });
}
