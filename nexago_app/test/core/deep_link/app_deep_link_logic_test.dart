import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/deep_link/app_deep_link_logic.dart';

void main() {
  group('resolveAppDeepLinkPath', () {
    test('maps tournament registration HTTPS link', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://atleta.nexago.com.br/torneios/abc/inscricao'),
        ),
        '/torneios/abc/inscricao',
      );
    });

    test('maps tournament detail HTTPS link', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://atleta.nexago.com.br/torneios/abc'),
        ),
        '/torneios/abc',
      );
    });

    test('preserves query parameters', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse(
            'https://atleta.nexago.com.br/torneios/abc/inscricao?categoryId=cat-1',
          ),
        ),
        '/torneios/abc/inscricao?categoryId=cat-1',
      );
    });

    test('maps convite on athlete portal', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://atleta.nexago.com.br/convite/invite-1'),
        ),
        '/convite/invite-1',
      );
    });

    test('rejects retired domains', () {
      // nexago.app nunca foi registrado e voleigo.com.br está com o certificado
      // HTTPS expirado — nenhum dos dois pode servir o AASA/assetlinks.
      expect(
        resolveAppDeepLinkPath(Uri.parse('https://nexago.app/torneios/abc')),
        isNull,
      );
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://voleigo.com.br/convite/invite-1'),
        ),
        isNull,
      );
    });

    test('maps tournament partner invite', () {
      expect(
        resolveAppDeepLinkPath(
          Uri.parse('https://atleta.nexago.com.br/torneios-convite/inv-9'),
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

    test('maps the store on the custom scheme (nexago://loja)', () {
      expect(resolveAppDeepLinkPath(Uri.parse('nexago://loja')), '/loja');
      expect(resolveAppDeepLinkPath(Uri.parse('nexago:///loja')), '/loja');
      expect(
        resolveAppDeepLinkPath(Uri.parse('nexago://loja?categoria=bolas')),
        '/loja?categoria=bolas',
      );
      expect(
        resolveAppDeepLinkPath(Uri.parse('nexago://loja/produto/bola-pro')),
        '/loja/produto/bola-pro',
      );
      // Caminho curto do link do portal (`/loja/p/:id`).
      expect(
        resolveAppDeepLinkPath(Uri.parse('nexago://loja/p/bola-pro')),
        '/loja/produto/bola-pro',
      );
      expect(resolveAppDeepLinkPath(Uri.parse('nexago://loja/p')), '/loja');
      expect(
        resolveAppDeepLinkPath(Uri.parse('nexago://loja/carrinho')),
        '/loja/carrinho',
      );
      // Subcaminho desconhecido cai na vitrine, não na tela de erro.
      expect(resolveAppDeepLinkPath(Uri.parse('nexago://loja/xyz')), '/loja');
    });

    test('https /loja stays with the athlete portal', () {
      expect(
        resolveAppDeepLinkPath(Uri.parse('https://atleta.nexago.com.br/loja')),
        isNull,
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

  // O deep linking nativo do Flutter entrega a URL crua ao go_router (no iOS
  // com UIScene é o único caminho). Antes, `nexago://loja/produto/x` virava
  // host `loja` + path `/produto/x` e caía no "Page Not Found".
  group('externalDeepLinkLocation', () {
    String? map(String url) =>
        externalDeepLinkLocation(Uri.parse(url), fallback: '/discover');

    test('esquema próprio vira o caminho interno', () {
      expect(map('nexago://loja/produto/bola'), '/loja/produto/bola');
      expect(map('nexago://loja?categoria=bolas'), '/loja?categoria=bolas');
      expect(map('nexago://torneios/abc/inscricao'), '/torneios/abc/inscricao');
    });

    test('Universal Link do portal: o mesmo caminho do app_links', () {
      expect(
        map('https://atleta.nexago.com.br/convite-dupla/inv1?ref=ana'),
        '/convite-dupla/inv1?ref=ana',
      );
    });

    test('link do app sem destino conhecido cai no fallback', () {
      expect(map('nexago://nada/por/aqui'), '/discover');
    });

    test('rota interna e retorno do Mercado Pago passam intactos', () {
      expect(map('/loja/produto/bola'), isNull);
      expect(map('https://outro.site.com/torneios/abc'), isNull);
      expect(map('nexago://mercadopago?mp=ok'), isNull);
    });
  });

  group('deepLinkLanding', () {
    DeepLinkLanding landing({
      String path = '/loja/produto/bola',
      bool authLoading = false,
      bool signedIn = true,
      bool bootstrapPending = false,
    }) =>
        deepLinkLanding(
          path: path,
          authLoading: authLoading,
          signedIn: signedIn,
          bootstrapPending: bootstrapPending,
        );

    test('sessão pronta abre direto', () {
      expect(landing(), DeepLinkLanding.direct);
    });

    test('cold start: espera no loading (o pós-login consome o destino)', () {
      expect(landing(authLoading: true, signedIn: false),
          DeepLinkLanding.afterLoading);
      expect(landing(bootstrapPending: true), DeepLinkLanding.afterLoading);
    });

    test('sem sessão vai ao login guardando o destino', () {
      expect(landing(signedIn: false), DeepLinkLanding.afterLogin);
    });

    test('convite por link é público mesmo sem sessão', () {
      expect(landing(path: '/convite/abc', signedIn: false),
          DeepLinkLanding.direct);
    });
  });
}
