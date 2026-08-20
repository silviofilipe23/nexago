import '../../core/deep_link/app_domains.dart';

/// URLs públicas das páginas legais — todas no site institucional, que é o
/// domínio que Google Play e App Store esperam nas fichas das lojas.
abstract final class AuthLegalUrls {
  AuthLegalUrls._();

  static const String termsUrl = '${AppDomains.site}/termos';
  static const String privacyUrl = '${AppDomains.site}/privacidade';

  /// Exigida pelas lojas. ATENÇÃO: a página ainda não existe em
  /// `frontend/projects/site` — criar antes de submeter.
  static const String accountDeletionUrl = '${AppDomains.site}/excluir-conta';
}
