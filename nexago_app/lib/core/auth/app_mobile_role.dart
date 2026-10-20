import '../../core/router/routes.dart';

/// Papéis disponíveis no app mobile (exclui `admin` do backoffice).
enum AppMobileRole {
  athlete,
  arena,
  organizer,

  /// Professor com vínculo com alguma arena. A claim `professor` só escolhe o
  /// modo do app — quem autoriza chamada e reserva é o vínculo, no servidor.
  professor;

  String get claimValue => name;

  String get title => switch (this) {
        AppMobileRole.athlete => 'Atleta',
        AppMobileRole.arena => 'Gestor de arena',
        AppMobileRole.organizer => 'Organizador de torneio',
        AppMobileRole.professor => 'Professor',
      };

  String get categoryLabel => switch (this) {
        AppMobileRole.athlete => 'COMPETIR & JOGAR',
        AppMobileRole.arena => 'QUADRAS & AGENDA',
        AppMobileRole.organizer => 'CRIAR & GERIR EVENTOS',
        AppMobileRole.professor => 'AULAS & ARENAS',
      };

  String get description => switch (this) {
        AppMobileRole.athlete =>
          'Entre em torneios, reserve quadras e acompanhe seu ranking.',
        AppMobileRole.arena =>
          'Administre quadras, horários, aluguéis e a agenda da sua arena.',
        AppMobileRole.organizer =>
          'Crie ligas e torneios, gerencie inscrições, chaves e premiação.',
        AppMobileRole.professor =>
          'Faça a chamada das suas aulas, reserve quadras como professor e '
              'cuide dos vínculos com as arenas.',
      };

  /// Label minúsculo para o CTA «Continuar como …».
  String get continueLabel => switch (this) {
        AppMobileRole.athlete => 'atleta',
        AppMobileRole.arena => 'gestor de arena',
        AppMobileRole.organizer => 'organizador de torneio',
        AppMobileRole.professor => 'professor',
      };

  String get homeRoute => switch (this) {
        AppMobileRole.athlete => AppRoutes.discover,
        AppMobileRole.arena => AppRoutes.arenaDashboard,
        AppMobileRole.organizer => AppRoutes.organizerHome,
        AppMobileRole.professor => AppRoutes.professorHome,
      };

  static AppMobileRole? fromClaim(String claim) {
    switch (claim) {
      case 'athlete':
        return AppMobileRole.athlete;
      case 'arena':
        return AppMobileRole.arena;
      case 'organizer':
        return AppMobileRole.organizer;
      case 'professor':
        return AppMobileRole.professor;
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
