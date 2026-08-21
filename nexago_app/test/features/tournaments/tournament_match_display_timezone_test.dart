import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_mapper.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_display.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// Reprodução do relato: partida agendada às 14:30 (parede SP) e iniciada às
/// 14:42 aparece com 3 horas a mais no card.
///
/// O doc do Firestore guarda INSTANTE (UTC): 14:30 SP == 17:30Z. O mapper
/// devolve DateTime marcado como UTC, e é ISSO que a tela formata.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  Map<String, dynamic> doc({
    required String status,
    DateTime? startedAtUtc,
  }) =>
      {
        'tournamentId': 't1',
        'categoryId': 'cat-a',
        'status': status,
        'matchNumber': 1,
        'teamAId': 'a',
        'teamBId': 'b',
        'scheduleTime': Timestamp.fromDate(DateTime.utc(2026, 5, 31, 17, 30)),
        if (startedAtUtc != null)
          'matchStartedAt': Timestamp.fromDate(startedAtUtc),
      };

  test('partida agendada mostra a hora de parede SP', () {
    final match = TournamentMatchMapper.fromMap(
      'm1',
      doc(status: TournamentMatchStatus.scheduled),
    );

    expect(
      matchTimeLabelForCard(match, reference: DateTime(2026, 5, 31, 9)),
      '14:30',
    );
  });

  test('partida em andamento mostra o início na parede SP', () {
    final match = TournamentMatchMapper.fromMap(
      'm1',
      doc(
        status: TournamentMatchStatus.inProgress,
        startedAtUtc: DateTime.utc(2026, 5, 31, 17, 42),
      ),
    );

    expect(
      matchTimeLabelForCard(match, reference: DateTime(2026, 5, 31, 9)),
      '14:42',
    );
  });

  test('rodapé da chave usa o dia e a hora da parede SP', () {
    final match = TournamentMatchMapper.fromMap(
      'm1',
      doc(status: TournamentMatchStatus.scheduled)..['courtName'] = '1',
    );

    expect(
      matchScheduleFooterLabelPt(match),
      'Dom 31/05 · 14:30 · Quadra 1',
    );
  });

  test('partida da noite não escorrega para o dia seguinte', () {
    // 22:30 SP == 01:30Z do dia seguinte: formatar o instante cru trocaria
    // o dia (e o rótulo curto viraria data completa).
    final match = TournamentMatchMapper.fromMap('m1', {
      'tournamentId': 't1',
      'categoryId': 'cat-a',
      'status': TournamentMatchStatus.scheduled,
      'matchNumber': 1,
      'teamAId': 'a',
      'teamBId': 'b',
      'scheduleTime': Timestamp.fromDate(DateTime.utc(2026, 6, 1, 1, 30)),
    });

    expect(
      matchTimeLabelForCard(match, reference: DateTime(2026, 5, 31, 9)),
      '22:30',
    );
  });
}
