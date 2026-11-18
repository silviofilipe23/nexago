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

  group('formatDashboardCompactCurrency', () {
    test('abaixo de 10 mil mostra o valor inteiro', () {
      expect(formatDashboardCompactCurrency(9870), contains('9.870'));
    });

    test('milhares e milhões viram "mil" e "mi" com uma casa', () {
      // Espaço que não quebra (\u00a0): o valor não parte entre linhas.
      expect(formatDashboardCompactCurrency(38200), 'R\$\u00a038,2\u00a0mil');
      expect(formatDashboardCompactCurrency(38000), 'R\$\u00a038\u00a0mil');
      expect(formatDashboardCompactCurrency(1250000), 'R\$\u00a01,3\u00a0mi');
    });
  });
}
