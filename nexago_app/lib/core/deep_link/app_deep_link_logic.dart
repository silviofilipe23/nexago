import 'app_domains.dart';

/// Hosts HTTPS aceitos para Universal / App Links do app mobile.
///
/// `atleta.nexago.com.br` é o host do convite de dupla por link: entrou porque
/// é o único domínio do projeto que já resolve e serve os arquivos de
/// associação (`.well-known/apple-app-site-association` e `assetlinks.json`)
/// pelo Firebase Hosting. Reivindicamos só o prefixo `/convite-dupla` — ver
/// [resolveAppDeepLinkPath] e o `AndroidManifest`; o resto do portal continua
/// abrindo no navegador.
const kAppDeepLinkHosts = {
  'nexago.app',
  'www.nexago.app',
  'voleigo.com.br',
  'www.voleigo.com.br',
  'atleta.nexago.com.br',
};

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
