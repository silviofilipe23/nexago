import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/formatting/app_currency_format.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
    Intl.defaultLocale = 'pt_BR';
  });

  // Espaço não separável usado pelo intl entre símbolo e valor.
  String nbsp(String s) => s.replaceAll(' ', ' ');

  group('formatBRL', () {
    test('formata valor com duas casas e separadores pt_BR', () {
      expect(nbsp(formatBRL(1234.5)), 'R\$ 1.234,50');
    });

    test('formata zero', () {
      expect(nbsp(formatBRL(0)), 'R\$ 0,00');
    });

    test('arredonda para duas casas', () {
      expect(nbsp(formatBRL(9.999)), 'R\$ 10,00');
    });
  });

  group('formatBRLFromCents', () {
    test('converte centavos inteiros em reais', () {
      expect(nbsp(formatBRLFromCents(1234)), 'R\$ 12,34');
    });

    test('zero centavos', () {
      expect(nbsp(formatBRLFromCents(0)), 'R\$ 0,00');
    });
  });

  group('formatBRLWhole', () {
    test('formata sem casas decimais', () {
      expect(nbsp(formatBRLWhole(120)), 'R\$ 120');
    });

    test('arredonda para inteiro', () {
      expect(nbsp(formatBRLWhole(120.6)), 'R\$ 121');
    });
  });
}
