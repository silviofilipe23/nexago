import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/app_update/app_update_config.dart';

void main() {
  group('AppUpdateConfig.fromDoc', () {
    test('lê o bloco da plataforma atual', () {
      final config = AppUpdateConfig.fromDoc(
        {
          'android': {
            'minBuildNumber': 101,
            'storeUrl': 'https://play.google.com/x',
            'title': 'Atualize',
            'message': 'Versão antiga',
          },
          'ios': {'minBuildNumber': 999},
        },
        platform: TargetPlatform.android,
      );

      expect(config.minBuildNumber, 101);
      expect(config.storeUrl, 'https://play.google.com/x');
      expect(config.title, 'Atualize');
      expect(config.message, 'Versão antiga');
    });

    test('não mistura plataformas', () {
      final config = AppUpdateConfig.fromDoc(
        {
          'android': {'minBuildNumber': 101},
          'ios': {'minBuildNumber': 55},
        },
        platform: TargetPlatform.iOS,
      );

      expect(config.minBuildNumber, 55);
    });

    test('aceita minBuildNumber como string numérica', () {
      final config = AppUpdateConfig.fromDoc(
        {
          'android': {'minBuildNumber': '101'}
        },
        platform: TargetPlatform.android,
      );

      expect(config.minBuildNumber, 101);
    });

    group('fail-open', () {
      test('doc ausente não bloqueia', () {
        expect(
          AppUpdateConfig.fromDoc(null, platform: TargetPlatform.android)
              .minBuildNumber,
          0,
        );
      });

      test('plataforma sem bloco não bloqueia', () {
        expect(
          AppUpdateConfig.fromDoc(
            {'ios': {'minBuildNumber': 999}},
            platform: TargetPlatform.android,
          ).minBuildNumber,
          0,
        );
      });

      test('plataforma não suportada não bloqueia', () {
        expect(
          AppUpdateConfig.fromDoc(
            {'android': {'minBuildNumber': 999}},
            platform: TargetPlatform.macOS,
          ).minBuildNumber,
          0,
        );
      });

      test('bloco malformado não bloqueia', () {
        expect(
          AppUpdateConfig.fromDoc(
            {'android': 'sim'},
            platform: TargetPlatform.android,
          ).minBuildNumber,
          0,
        );
      });

      test('minBuildNumber inválido cai para 0', () {
        for (final invalid in <Object?>[null, 'abc', -5, double.nan, {}]) {
          expect(
            AppUpdateConfig.fromDoc(
              {
                'android': {'minBuildNumber': invalid}
              },
              platform: TargetPlatform.android,
            ).minBuildNumber,
            0,
            reason: 'valor inválido: $invalid',
          );
        }
      });

      test('strings vazias viram null', () {
        final config = AppUpdateConfig.fromDoc(
          {
            'android': {
              'minBuildNumber': 101,
              'storeUrl': '   ',
              'title': '',
            }
          },
          platform: TargetPlatform.android,
        );

        expect(config.storeUrl, isNull);
        expect(config.title, isNull);
      });
    });
  });

  group('blocks', () {
    test('bloqueia build abaixo da mínima', () {
      expect(const AppUpdateConfig(minBuildNumber: 101).blocks(100), isTrue);
    });

    test('libera build igual ou acima da mínima', () {
      const config = AppUpdateConfig(minBuildNumber: 101);
      expect(config.blocks(101), isFalse);
      expect(config.blocks(102), isFalse);
    });

    test('config default nunca bloqueia', () {
      expect(AppUpdateConfig.none.blocks(1), isFalse);
      expect(AppUpdateConfig.none.blocks(999), isFalse);
    });

    test('build desconhecida (0) não bloqueia', () {
      expect(const AppUpdateConfig(minBuildNumber: 101).blocks(0), isFalse);
    });
  });
}
