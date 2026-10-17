import 'app_domains.dart';

/// Hosts HTTPS aceitos para Universal / App Links do app mobile.
///
/// Só vale host que sirva de fato `/.well-known/apple-app-site-association` e
/// `assetlinks.json` — sem esses arquivos o sistema operacional nunca entrega
/// o link pro app. Hoje isso é o portal do atleta, que também é quem serve o
/// convite de dupla por link (prefixo `/convite-dupla` — ver
/// [resolveAppDeepLinkPath] e o `AndroidManifest`; o resto do portal continua
/// abrindo no navegador).
const kAppDeepLinkHosts = {AppDomains.athletePortalHost};

/// Resolve uma URI externa para um path interno do GoRouter.
///
/// Ex.: `https://atleta.nexago.com.br/torneios/abc/inscricao` → `/torneios/abc/inscricao`
String? resolveAppDeepLinkPath(Uri uri) {
  final segments = _deepLinkPathSegments(uri);
  if (segments == null || segments.isEmpty) return null;

  if (segments.first == 'convite' && segments.length >= 2) {
    return _withQuery('/convite/${segments[1]}', uri);
  }

  if (segments.first == 'torneios-convite' && segments.length >= 2) {
    return _withQuery('/torneios-convite/${segments[1]}', uri);
  }

  // Convite de dupla por link (parceiro ainda sem conta). A query carrega o
  // contexto (`ref`, `de`) que o cadastro/onboarding consome, então preservá-la
  // não é detalhe: é o que liga a indicação a quem convidou.
  if (segments.first == 'convite-dupla' && segments.length >= 2) {
    return _withQuery('/convite-dupla/${segments[1]}', uri);
  }

  if (segments.first == 'torneios' && segments.length >= 2) {
    return _withQuery('/${segments.join('/')}', uri);
  }

  // Loja: só pelo esquema do app (`nexago://loja`). O `/loja` HTTPS é do
  // portal e segue abrindo no navegador. Produto: `produto/:id` ou `p/:id`
  // (o caminho curto do link do portal). Subcaminho desconhecido cai na
  // vitrine em vez da tela de erro do router.
  if (segments.first == 'loja' && uri.scheme == 'nexago') {
    if (segments.length >= 3 &&
        (segments[1] == 'produto' || segments[1] == 'p')) {
      return '/loja/produto/${Uri.encodeComponent(segments[2])}';
    }
    if (segments.length >= 2 && segments[1] == 'carrinho') {
      return '/loja/carrinho';
    }
    return _withQuery('/loja', uri);
  }

  return null;
}

List<String>? _deepLinkPathSegments(Uri uri) {
  if (uri.scheme == 'nexago') {
    if (uri.host == 'mercadopago') return null;
    if (uri.host == 'torneios') {
      return ['torneios', ...uri.pathSegments.where((s) => s.isNotEmpty)];
    }
    if (uri.host == 'convite-dupla') {
      return ['convite-dupla', ...uri.pathSegments.where((s) => s.isNotEmpty)];
    }
    if (uri.host == 'loja') {
      return ['loja', ...uri.pathSegments.where((s) => s.isNotEmpty)];
    }
    return uri.pathSegments.where((s) => s.isNotEmpty).toList();
  }

  if (uri.scheme == 'https' || uri.scheme == 'http') {
    final host = uri.host.toLowerCase();
    if (!kAppDeepLinkHosts.contains(host)) return null;
    return uri.pathSegments.where((s) => s.isNotEmpty).toList();
  }

  return null;
}

String _withQuery(String path, Uri uri) {
  if (uri.query.isEmpty) return path;
  return '$path?${uri.query}';
}

/// O retorno OAuth do Mercado Pago é o único lugar que ainda conhece
/// `voleigo.com.br`: quem escolhe o destino é a Cloud Function
/// `mercadoPagoOAuthReturnBase`, não o app. Trocar aqui sem trocar lá (e sem
/// reconfigurar as URLs no painel do Mercado Pago) derruba a conexão de conta
/// do gestor de arena — por isso fica como está até a CF migrar.
bool isMercadoPagoOAuthDeepLink(Uri uri) {
  if (uri.scheme == 'nexago' && uri.host == 'mercadopago') return true;
  if (uri.scheme == 'https' || uri.scheme == 'http') {
    final segments = uri.pathSegments;
    return (uri.host == 'voleigo.com.br' || uri.host == 'www.voleigo.com.br') &&
        segments.length >= 2 &&
        segments[0] == 'arena' &&
        segments[1] == 'mercadopago';
  }
  return false;
}

// ── Deep link entregue ao go_router pelo próprio Flutter ──────────────────

/// O deep linking nativo do Flutter (ligado por padrão desde o 3.27) repassa a
/// URL inteira ao go_router. No iOS ele é o ÚNICO caminho que entrega o link:
/// o app roda com UIScene e o `app_links` 6.x só escuta o AppDelegate. Crua,
/// `nexago://loja/produto/x` vira host `loja` + path `/produto/x`, não casa com
/// rota nenhuma e cai no "Page Not Found".
///
/// Link externo do app (esquema `nexago` ou host de [kAppDeepLinkHosts]) →
/// o caminho interno de [resolveAppDeepLinkPath], ou [fallback] quando o link
/// não tem destino conhecido. `null` = não é link externo (rota interna comum)
/// ou é o retorno OAuth do Mercado Pago, que segue o tratamento próprio.
String? externalDeepLinkLocation(Uri uri, {required String fallback}) {
  final appScheme = uri.scheme == 'nexago';
  final appHost = (uri.scheme == 'https' || uri.scheme == 'http') &&
      kAppDeepLinkHosts.contains(uri.host.toLowerCase());
  if (!appScheme && !appHost) return null;
  if (isMercadoPagoOAuthDeepLink(uri)) return null;
  return resolveAppDeepLinkPath(uri) ?? fallback;
}

/// Para onde vai um deep link já traduzido, conforme a sessão.
enum DeepLinkLanding {
  /// Sessão pronta (ou rota pública): abre o destino.
  direct,

  /// Sessão ainda assentando: guarda o destino e espera no loading — é o
  /// pós-login (`resolvePostLoginDestination`) que o consome. Abrir direto
  /// perderia o destino no desvio para `/auth/loading`.
  afterLoading,

  /// Sem sessão: guarda o destino e vai ao login (igual a
  /// `navigateFromDeepLink`).
  afterLogin,
}

DeepLinkLanding deepLinkLanding({
  required String path,
  required bool authLoading,
  required bool signedIn,
  required bool bootstrapPending,
}) {
  if (path.startsWith('/convite/')) return DeepLinkLanding.direct;
  if (authLoading) return DeepLinkLanding.afterLoading;
  if (!signedIn) return DeepLinkLanding.afterLogin;
  return bootstrapPending
      ? DeepLinkLanding.afterLoading
      : DeepLinkLanding.direct;
}
