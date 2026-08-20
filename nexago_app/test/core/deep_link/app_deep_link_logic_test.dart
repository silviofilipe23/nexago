import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/deep_link/app_deep_link_logic.dart';

void main() {
  group('resolveAppDeepLinkPath', () {
    test('maps tournament registration HTTPS link', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://nexago.app/torneios/abc/inscricao'),
        ),
        '/torneios/abc/inscricao',
      );
    });

    test('maps tournament detail HTTPS link', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://nexago.app/torneios/abc'),
        ),
        '/torneios/abc',
      );
    });

    test('preserves query parameters', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse(
            'https://nexago.app/torneios/abc/inscricao?categoryId=cat-1',
          ),
        ),
        '/torneios/abc/inscricao?categoryId=cat-1',
      );
    });

    test('maps convite on voleigo.com.br', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://voleigo.com.br/convite/invite-1'),
        ),
        '/convite/invite-1',
      );
    });

    test('maps tournament partner invite', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://nexago.app/torneios-convite/inv-9'),
        ),
        '/torneios-convite/inv-9',
      );
    });

    test('maps nexago custom scheme path', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('nexago:///torneios/abc/inscricao'),
        ),
        '/torneios/abc/inscricao',
      );
    });

    test('maps nexago host torneios scheme', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('nexago://torneios/abc/inscricao'),
        ),
        '/torneios/abc/inscricao',
      );
    });

    test('returns null for unsupported host', () {
      expect(
        resolveAppDeepLinkPath(Uri.parse('https://example.com/torneios/abc')),
        isNull,
      );
    });

    test('returns null for mercado pago oauth', () {
      expect(
        resolveAppDeepLinkPath(Uri.parse('nexago://mercadopago?mp=ok')),
        isNull,
      );
    });

    test('maps external partner invite on the athlete portal host', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://atleta.nexago.com.br/convite-dupla/ext-1'),
        ),
        '/convite-dupla/ext-1',
      );
    });

    test('preserves referral context on the external partner invite', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse(
            'https://atleta.nexago.com.br/convite-dupla/ext-1?ref=uid-1&de=Silvio',
          ),
        ),
        '/convite-dupla/ext-1?ref=uid-1&de=Silvio',
      );
    });

    // O host do portal é reivindicado só no prefixo do convite: reivindicar o
    // host inteiro faria toda a web do portal abrir no app.
    test('ignores other paths on the athlete portal host', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://atleta.nexago.com.br/painel'),
        ),
        isNull,
      );
    });

    test('maps external partner invite on the custom scheme', () {
      expect(
        resolveAppDeepLinkPath(Uri.parse('nexago://convite-dupla/ext-1')),
        '/convite-dupla/ext-1',
      );
    });
  });

  group('isMercadoPagoOAuthDeepLink', () {
    test('detects custom scheme', () {
      expect(
        isMercadoPagoOAuthDeepLink(Uri.parse('nexago://mercadopago?mp=ok')),
        isTrue,
      );
    });

    test('detects https arena return', () {
      expect(
        isMercadoPagoOAuthDeepLink(
          Uri.parse('https://voleigo.com.br/arena/mercadopago?mp=ok'),
        ),
        isTrue,
      );
    });
  });
}
