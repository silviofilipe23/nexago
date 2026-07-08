import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/presentation/arena_dashboard_formatters.dart';

void main() {
  group('formatDashboardOccupancyPercent', () {
    test('arredonda para inteiro quando está bem próximo de um inteiro', () {
      expect(formatDashboardOccupancyPercent(75.0), '75%');
      expect(formatDashboardOccupancyPercent(75.00001), '75%');
    });

    test('mantém 1 casa decimal com vírgula quando não é um inteiro', () {
      expect(formatDashboardOccupancyPercent(66.66), '66,7%');
    });

    test('satura em 0% e 100% mesmo com valores fora da faixa', () {
      expect(formatDashboardOccupancyPercent(-15), '0%');
      expect(formatDashboardOccupancyPercent(140), '100%');
    });
  });

  group('formatDashboardPeakHour', () {
    test('formata hora com sufixo "h"', () {
      expect(formatDashboardPeakHour(19), '19h');
    });

    test('mostra travessão quando não há horário de pico', () {
      expect(formatDashboardPeakHour(null), '—');
    });
  });

  group('formatDashboardChartAxis', () {
    test('valores abaixo de 1000 mostram o inteiro sem sufixo', () {
      expect(formatDashboardChartAxis(850), '850');
    });

    test('valores a partir de 1000 usam sufixo "k" compacto', () {
      expect(formatDashboardChartAxis(1200), '1,2k');
    });

    test('valor fracionário abaixo de 1000 arredonda sem casas decimais', () {
      expect(formatDashboardChartAxis(849.6), '850');
    });
  });
}
