import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/validation/cpf_cnpj.dart';

void main() {
  test('CPF 03588477101 is valid', () {
    expect(CpfCnpjValidator.isValid('03588477101'), isTrue);
  });

  test('rejects known invalid CPF', () {
    expect(CpfCnpjValidator.isValid('11111111111'), isFalse);
  });
}
