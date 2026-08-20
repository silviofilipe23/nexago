/// Domínios oficiais do nexaGO — fonte única dos links que o app abre,
/// compartilha e aceita como Universal / App Link.
///
/// Histórico: `nexago.app` nunca foi registrado (NXDOMAIN) e `voleigo.com.br`
/// ficou com o certificado HTTPS expirado. Ambos foram aposentados; qualquer
/// link novo sai daqui, nunca escrito à mão na feature.
abstract final class AppDomains {
  AppDomains._();

  /// Portal do atleta. É o destino dos links compartilháveis porque serve as
  /// rotas `torneios/:id`, `torneios/:id/inscricao` e `ligas/:id` lendo o
  /// Firestore ao vivo — torneio recém-publicado abre na hora. Também é quem
  /// serve `/.well-known/apple-app-site-association` e `assetlinks.json`, então
  /// é o único host que o sistema operacional entrega pro app.
  static const String athletePortalHost = 'atleta.nexago.com.br';
  static const String athletePortal = 'https://$athletePortalHost';

  /// Site institucional. Export estático (conteúdo congela no build), então
  /// serve só páginas fixas: legais e download do app.
  static const String siteHost = 'nexago.com.br';
  static const String site = 'https://$siteHost';
}

/// Links compartilháveis pelo app.
///
/// Toda rota daqui precisa existir nos dois lados: no portal do atleta (que
/// atende quem não tem o app) e no GoRouter do app (que atende o Universal
/// Link). Ver `resolveAppDeepLinkPath`.
abstract final class AppShareLinks {
  AppShareLinks._();

  static String tournament(String tournamentId) =>
      '${AppDomains.athletePortal}/torneios/$tournamentId';

  static String league(String leagueId) =>
      '${AppDomains.athletePortal}/ligas/$leagueId';

  /// Convite genérico pra conhecer/baixar o app (indicação, Sand Rank).
  static const String appDownload = AppDomains.site;
}
