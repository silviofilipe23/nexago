import '../../core/router/routes.dart';

/// Papéis disponíveis no app mobile (exclui `admin` do backoffice).
enum AppMobileRole {
  athlete,
  arena,
  organizer;

  String get claimValue => name;

  String get title => switch (this) {
        AppMobileRole.athlete => 'Atleta',
        AppMobileRole.arena => 'Gestor de arena',
        AppMobileRole.organizer => 'Organizador de torneio',
      };

  String get categoryLabel => switch (this) {
        AppMobileRole.athlete => 'COMPETIR & JOGAR',
        AppMobileRole.arena => 'QUADRAS & AGENDA',
        AppMobileRole.organizer => 'CRIAR & GERIR EVENTOS',
      };

  String get description => switch (this) {
        AppMobileRole.athlete =>
          'Entre em torneios, reserve quadras e acompanhe seu ranking.',
        AppMobileRole.arena =>
          'Administre quadras, horários, aluguéis e a agenda da sua arena.',
        AppMobileRole.organizer =>
          'Crie ligas e torneios, gerencie inscrições, chaves e premiação.',
      };

  /// Label minúsculo para o CTA «Continuar como …».
  String get continueLabel => switch (this) {
        AppMobileRole.athlete => 'atleta',
        AppMobileRole.arena => 'gestor de arena',
        AppMobileRole.organizer => 'organizador de torneio',
      };

  String get homeRoute => switch (this) {
        AppMobileRole.athlete => AppRoutes.discover,
        AppMobileRole.arena => AppRoutes.arenaDashboard,
        AppMobileRole.organizer => AppRoutes.organizerHome,
      };

  static AppMobileRole? fromClaim(String claim) {
    switch (claim) {
      case 'athlete':
        return AppMobileRole.athlete;
      case 'arena':
        return AppMobileRole.arena;
      case 'organizer':
        return AppMobileRole.organizer;
      default:
        return null;
    }
  }

  static AppMobileRole? fromStorage(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    for (final role in AppMobileRole.values) {
      if (role.name == raw.trim()) return role;
    }
    return null;
  }
}
