import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/deep_link/app_deep_link_logic.dart';
import 'package:nexago_app/core/deep_link/app_domains.dart';

void main() {
  group('AppShareLinks.arenaBooking', () {
    test('aponta para a página de reserva da arena no portal do atleta', () {
      expect(
        AppShareLinks.arenaBooking('arena-1'),
        'https://atleta.nexago.com.br/reservar/arena-1',
      );
    });

    test('codifica o id da arena', () {
      expect(
        AppShareLinks.arenaBooking('arena cfc'),
        'https://atleta.nexago.com.br/reservar/arena%20cfc',
      );
    });

    // O link gerado e o mapa do deep link têm de concordar: senão quem tem o
    // app recebe um link que o próprio app não sabe abrir.
    test('o link gerado abre o detalhe da arena no app', () {
      expect(
        resolveAppDeepLinkPath(Uri.parse(AppShareLinks.arenaBooking('a b'))),
        '/arena/a%20b',
      );
    });
  });
}
