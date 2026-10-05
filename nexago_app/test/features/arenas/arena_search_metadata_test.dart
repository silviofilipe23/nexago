import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_search_metadata.dart';

void main() {
  group('ArenaSearchMetadata', () {
    test('splitCourtTypes separates surfaces from sports', () {
      final split = ArenaSearchMetadata.splitCourtTypes(
        const ['Vôlei de praia', 'Areia', 'Beach tennis'],
      );
      expect(split.surfaces, ['Areia']);
      expect(split.sports, contains('Vôlei de praia'));
      expect(split.sports, contains('Beach tennis'));
    });

    test('mergeSportCodes deduplica rótulo (qualquer caixa) e código do mesmo esporte', () {
      final merged = ArenaSearchMetadata.mergeSportCodes(
        profileSports: const ['Vôlei de praia'],
        courtTypeLabels: const ['vôlei de praia', 'Beach tennis'],
      );
      expect(merged, ['beachVolleyball', 'beachTennis']);
    });

    test('mergeSportCodes grava código; fora do catálogo segue cru (fase 5b)', () {
      final merged = ArenaSearchMetadata.mergeSportCodes(
        profileSports: const ['beachVolleyball'],
        courtTypeLabels: const ['Vôlei de praia', 'beachTennis', 'Pickleball'],
      );
      expect(merged, ['beachVolleyball', 'beachTennis', 'Pickleball']);
    });

    test('isSurfaceLabel recognizes filter options', () {
      expect(ArenaSearchMetadata.isSurfaceLabel('Areia'), isTrue);
      expect(ArenaSearchMetadata.isSurfaceLabel('Vôlei de praia'), isFalse);
    });
  });
}
