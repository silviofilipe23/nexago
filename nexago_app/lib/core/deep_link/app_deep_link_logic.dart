/// Hosts HTTPS aceitos para Universal / App Links do app mobile.
const kAppDeepLinkHosts = {
  'nexago.app',
  'www.nexago.app',
  'voleigo.com.br',
  'www.voleigo.com.br',
};

/// Resolve uma URI externa para um path interno do GoRouter.
///
/// Ex.: `https://nexago.app/torneios/abc/inscricao` → `/torneios/abc/inscricao`
String? resolveAppDeepLinkPath(Uri uri) {
  final segments = _deepLinkPathSegments(uri);
  if (segments == null || segments.isEmpty) return null;

  if (segments.first == 'convite' && segments.length >= 2) {
    return _withQuery('/convite/${segments[1]}', uri);
  }

  if (segments.first == 'torneios-convite' && segments.length >= 2) {
    return _withQuery('/torneios-convite/${segments[1]}', uri);
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
