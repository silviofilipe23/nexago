import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_labels.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  group('tournamentEnrolledEntriesLabel', () {
    test('conta duplas no torneio de duplas', () {
      expect(
        tournamentEnrolledEntriesLabel(12, TournamentFormat.dupla),
        '12 duplas inscritas',
      );
    });

    test('concorda no singular', () {
      expect(
        tournamentEnrolledEntriesLabel(1, TournamentFormat.dupla),
        '1 dupla inscrita',
      );
    });

    test('conta atletas no torneio individual', () {
      // Cada inscrição é uma dupla no torneio de duplas e um atleta no individual — chamar
      // tudo de "dupla" mentiria na metade dos cards.
      expect(
        tournamentEnrolledEntriesLabel(12, TournamentFormat.individual),
        '12 atletas inscritos',
      );
      expect(
        tournamentEnrolledEntriesLabel(1, TournamentFormat.individual),
        '1 atleta inscrito',
      );
    });

    test('diz que ninguém se inscreveu em vez de mostrar zero', () {
      expect(
        tournamentEnrolledEntriesLabel(0, TournamentFormat.dupla),
        'Nenhuma dupla inscrita',
      );
      expect(
        tournamentEnrolledEntriesLabel(0, TournamentFormat.individual),
        'Nenhum atleta inscrito',
      );
    });
  });
}
