import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';

void main() {
  group('ArenaCourt.sportTypesFromFirestore', () {
    test('reads types array', () {
      expect(
        ArenaCourt.sportTypesFromFirestore({
          'types': ['Vôlei de praia', 'Beach tennis'],
        }),
        ['Vôlei de praia', 'Beach tennis'],
      );
    });

    test('falls back to legacy type string', () {
      expect(
        ArenaCourt.sportTypesFromFirestore({'type': 'Tênis'}),
        ['Tênis'],
      );
    });

    test('deduplicates case-insensitively', () {
      expect(
        ArenaCourt.sportTypesFromFirestore({
          'types': ['Vôlei de praia', 'vôlei de praia'],
        }),
        ['Vôlei de praia'],
      );
    });
  });
}
