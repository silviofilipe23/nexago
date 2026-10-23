import '../../core/router/routes.dart';

/// Papéis disponíveis no app mobile (exclui `admin` do backoffice).
enum AppMobileRole {
  athlete,
  arena,
  organizer,

  /// Professor com vínculo com alguma arena. A claim `professor` só escolhe o
  /// modo do app — quem autoriza chamada e reserva é o vínculo, no servidor.
  professor,

  /// Equipe de algum Centro de Treinamento (dono, gestão, recepção ou
  /// professor do CT). Como `professor`, a claim `center` só escolhe o modo —
  /// quem autoriza é o vínculo `centerMembers`, relido pelas rules.
  center;

  String get claimValue => name;

  String get title => switch (this) {
        AppMobileRole.athlete => 'Atleta',
        AppMobileRole.arena => 'Gestor de arena',
        AppMobileRole.organizer => 'Organizador de torneio',
        AppMobileRole.professor => 'Professor',
        AppMobileRole.center => 'Centro de treinamento',
      };

  String get categoryLabel => switch (this) {
        AppMobileRole.athlete => 'COMPETIR & JOGAR',
        AppMobileRole.arena => 'QUADRAS & AGENDA',
        AppMobileRole.organizer => 'CRIAR & GERIR EVENTOS',
        AppMobileRole.professor => 'AULAS & ARENAS',
        AppMobileRole.center => 'TURMAS & CHAMADA',
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
        AppMobileRole.center =>
          'Acompanhe a agenda do seu CT, faça a chamada e o check-in dos '
              'alunos e o dia da equipe.',
      };

  /// Label minúsculo para o CTA «Continuar como …».
  String get continueLabel => switch (this) {
        AppMobileRole.athlete => 'atleta',
        AppMobileRole.arena => 'gestor de arena',
        AppMobileRole.organizer => 'organizador de torneio',
        AppMobileRole.professor => 'professor',
        AppMobileRole.center => 'centro de treinamento',
      };

  String get homeRoute => switch (this) {
        AppMobileRole.athlete => AppRoutes.discover,
        AppMobileRole.arena => AppRoutes.arenaDashboard,
        AppMobileRole.organizer => AppRoutes.organizerHome,
        AppMobileRole.professor => AppRoutes.professorHome,
        AppMobileRole.center => AppRoutes.centerHome,
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
      case 'center':
        return AppMobileRole.center;
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
