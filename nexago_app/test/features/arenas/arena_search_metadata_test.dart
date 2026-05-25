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

    test('mergeSportLabels deduplicates case-insensitively', () {
      final merged = ArenaSearchMetadata.mergeSportLabels(
        profileSports: const ['Vôlei de praia'],
        courtTypeLabels: const ['vôlei de praia', 'Beach tennis'],
      );
      expect(merged, hasLength(2));
      expect(merged, contains('Vôlei de praia'));
      expect(merged, contains('Beach tennis'));
    });

    test('isSurfaceLabel recognizes filter options', () {
      expect(ArenaSearchMetadata.isSurfaceLabel('Areia'), isTrue);
      expect(ArenaSearchMetadata.isSurfaceLabel('Vôlei de praia'), isFalse);
    });
  });
}
