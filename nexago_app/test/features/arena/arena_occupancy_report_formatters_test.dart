import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/presentation/arena_occupancy_report_formatters.dart';

void main() {
  group('formatOccupancyHours', () {
    test('zero horas mostra "0h"', () {
      expect(formatOccupancyHours(0), '0h');
      expect(formatOccupancyHours(-1), '0h');
    });

    test('horas inteiras não mostram casas decimais', () {
      expect(formatOccupancyHours(3), '3h');
    });

    test('horas fracionárias usam vírgula com 1 casa decimal', () {
      expect(formatOccupancyHours(2.5), '2,5h');
      expect(formatOccupancyHours(1.25), '1,3h'); // arredonda p/ 1 casa
    });
  });

  group('formatOccupancyUniqueAthletes', () {
    test('singular para 1 jogador', () {
      expect(formatOccupancyUniqueAthletes(1), '1 jogador');
    });

    test('plural para 0 e para mais de 1', () {
      expect(formatOccupancyUniqueAthletes(0), '0 jogadores');
      expect(formatOccupancyUniqueAthletes(5), '5 jogadores');
    });
  });

  group('formatOccupancyPercent', () {
    test('arredonda para inteiro quando bem próximo', () {
      expect(formatOccupancyPercent(66.66), '66,7%');
      expect(formatOccupancyPercent(75.0), '75%');
    });

    test('satura em 0% e 100%', () {
      expect(formatOccupancyPercent(-10), '0%');
      expect(formatOccupancyPercent(120), '100%');
    });
  });
}
