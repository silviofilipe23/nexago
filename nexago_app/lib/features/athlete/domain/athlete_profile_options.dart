/// Opções de esporte e nível para o perfil do atleta (UI + Firestore como string).
abstract final class AthleteProfileOptions {
  AthleteProfileOptions._();

  static const List<String> sports = [
    'Vôlei de praia',
    'Vôlei de quadra',
    'Futevôlei',
    'Beach tênis',
    'Outro',
  ];

  static const List<String> levels = [
    'Iniciante',
    'Intermediário',
    'Avançado',
    'Competitivo / federado',
  ];
}
