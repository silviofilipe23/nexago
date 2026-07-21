import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_amenities.dart';

void main() {
  group('ArenaAmenities.matchesRequirements — acessibilidade', () {
    test('quadra acessível: arena sem o campo não passa no filtro', () {
      const arena = ArenaAmenities.empty;
      const required = ArenaAmenities(hasAccessibleCourt: true);

      expect(arena.matchesRequirements(required), isFalse);
    });

    test('quadra acessível: arena com o campo passa no filtro', () {
      const arena = ArenaAmenities(hasAccessibleCourt: true);
      const required = ArenaAmenities(hasAccessibleCourt: true);

      expect(arena.matchesRequirements(required), isTrue);
    });

    test('banheiro acessível: arena sem o campo não passa no filtro', () {
      const arena = ArenaAmenities.empty;
      const required = ArenaAmenities(hasAccessibleBathroom: true);

      expect(arena.matchesRequirements(required), isFalse);
    });

    test('banheiro acessível: arena com o campo passa no filtro', () {
      const arena = ArenaAmenities(hasAccessibleBathroom: true);
      const required = ArenaAmenities(hasAccessibleBathroom: true);

      expect(arena.matchesRequirements(required), isTrue);
    });

    test('vaga PCD: arena sem o campo não passa no filtro', () {
      const arena = ArenaAmenities.empty;
      const required = ArenaAmenities(hasPcdParking: true);

      expect(arena.matchesRequirements(required), isFalse);
    });

    test('vaga PCD: arena com o campo passa no filtro', () {
      const arena = ArenaAmenities(hasPcdParking: true);
      const required = ArenaAmenities(hasPcdParking: true);

      expect(arena.matchesRequirements(required), isTrue);
    });

    test('exige todos os campos de acessibilidade combinados', () {
      const arena = ArenaAmenities(
        hasAccessibleCourt: true,
        hasAccessibleBathroom: true,
        hasPcdParking: false,
      );
      const required = ArenaAmenities(
        hasAccessibleCourt: true,
        hasAccessibleBathroom: true,
        hasPcdParking: true,
      );

      expect(arena.matchesRequirements(required), isFalse);
    });

    test('nenhum requisito de acessibilidade passa sempre', () {
      const arena = ArenaAmenities.empty;
      const required = ArenaAmenities(parking: true);

      expect(arena.matchesRequirements(required), isFalse);
      expect(arena.matchesRequirements(ArenaAmenities.empty), isTrue);
    });
  });

  group('ArenaAmenities.hasAny — acessibilidade', () {
    test('true quando só um campo de acessibilidade está setado', () {
      const arena = ArenaAmenities(hasPcdParking: true);
      expect(arena.hasAny, isTrue);
    });

    test('false quando nenhum campo está setado', () {
      expect(ArenaAmenities.empty.hasAny, isFalse);
    });
  });

  group('ArenaAmenities.fromMap — acessibilidade', () {
    test('campo ausente vira false (retrocompatibilidade com docs antigos)', () {
      final a = ArenaAmenities.fromMap({'parking': true});

      expect(a.hasAccessibleCourt, isFalse);
      expect(a.hasAccessibleBathroom, isFalse);
      expect(a.hasPcdParking, isFalse);
    });

    test('lê os 3 novos campos do mapa', () {
      final a = ArenaAmenities.fromMap({
        'hasAccessibleCourt': true,
        'hasAccessibleBathroom': true,
        'hasPcdParking': true,
      });

      expect(a.hasAccessibleCourt, isTrue);
      expect(a.hasAccessibleBathroom, isTrue);
      expect(a.hasPcdParking, isTrue);
    });
  });

  group('ArenaAmenities.toFirestoreMap — acessibilidade', () {
    test('inclui os 3 novos campos', () {
      const a = ArenaAmenities(
        hasAccessibleCourt: true,
        hasAccessibleBathroom: true,
        hasPcdParking: true,
      );
      final map = a.toFirestoreMap();

      expect(map['hasAccessibleCourt'], isTrue);
      expect(map['hasAccessibleBathroom'], isTrue);
      expect(map['hasPcdParking'], isTrue);
    });
  });

  group('ArenaAmenities.copyWith — acessibilidade', () {
    test('altera só o campo passado, preserva os demais', () {
      const original = ArenaAmenities(parking: true);
      final updated = original.copyWith(hasAccessibleCourt: true);

      expect(updated.parking, isTrue);
      expect(updated.hasAccessibleCourt, isTrue);
      expect(updated.hasAccessibleBathroom, isFalse);
      expect(updated.hasPcdParking, isFalse);
    });
  });

  group('ArenaAmenities equality — acessibilidade', () {
    test('== e hashCode consideram os novos campos', () {
      const a = ArenaAmenities(hasAccessibleCourt: true);
      const b = ArenaAmenities(hasAccessibleCourt: true);
      const c = ArenaAmenities(hasAccessibleCourt: false);

      expect(a, equals(b));
      expect(a.hashCode, equals(b.hashCode));
      expect(a == c, isFalse);
    });
  });
}
