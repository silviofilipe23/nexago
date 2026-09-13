import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/token_app_version.dart';

void main() {
  group('tokenAppVersionFields', () {
    test('grava buildNumber e appVersion quando o PackageInfo responde', () {
      final fields = tokenAppVersionFields(
        version: '1.0.11',
        buildNumber: '108',
      );

      expect(fields, {'buildNumber': 108, 'appVersion': '1.0.11'});
    });

    test('apara espaços em volta dos valores', () {
      final fields = tokenAppVersionFields(
        version: '  1.0.11  ',
        buildNumber: ' 108 ',
      );

      expect(fields, {'buildNumber': 108, 'appVersion': '1.0.11'});
    });

    test('omite tudo quando o build number não é numérico', () {
      expect(tokenAppVersionFields(version: '1.0.11', buildNumber: 'abc'), isEmpty);
    });

    test('omite tudo quando o build number vem vazio', () {
      expect(tokenAppVersionFields(version: '1.0.11', buildNumber: '   '), isEmpty);
    });

    // Zero e negativo não são builds reais: gravá-los sobrescreveria, via
    // merge, um valor bom já salvo e o script de contagem leria `0` como
    // "abaixo do gate". Omitir preserva o dado anterior.
    test('omite tudo quando o build number é zero ou negativo', () {
      expect(tokenAppVersionFields(version: '1.0.11', buildNumber: '0'), isEmpty);
      expect(tokenAppVersionFields(version: '1.0.11', buildNumber: '-5'), isEmpty);
    });

    test('mantém o buildNumber quando só a versão vem vazia', () {
      final fields = tokenAppVersionFields(version: '  ', buildNumber: '108');

      expect(fields, {'buildNumber': 108});
    });
  });
}
