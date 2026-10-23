import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_logic.dart';
import 'package:nexago_app/features/athlete/domain/agenda/athlete_agenda_models.dart';
import 'package:nexago_app/features/athlete_training/domain/athlete_training.dart';
import 'package:nexago_app/features/athlete_training/domain/training_center.dart';

CenterTrial _trial(String status, {String date = '2026-10-29'}) =>
    CenterTrial.fromMap({
      'bookingId': 'k1_${date}_uMe',
      'centerId': 'ct1',
      'centerName': 'CT Elevate',
      'sessionId': 'k1_$date',
      'className': 'Kids',
      'date': date,
      'startTime': '18:00',
      'endTime': '19:30',
      'coachName': 'Juliana Rocha',
      'locationName': 'Sede',
      'status': status,
    });

void main() {
  // Quarta 21/10/2026, 12:00 em São Paulo.
  final now = DateTime.utc(2026, 10, 21, 15);

  test('resposta de getMyTrainingCenters traz as experimentais', () {
    final data = MyTrainingCentersData.fromResponse({
      'centers': const [],
      'trials': [
        {
          'bookingId': 'b1',
          'centerId': 'ct1',
          'sessionId': 's1',
          'date': '2026-10-29',
          'startTime': '18:00'
        },
      ],
    });
    expect(data.trials.single.centerName, 'Centro de treinamento');
    expect(data.trials.single.isPending, isTrue);
    expect(MyTrainingCentersData.fromResponse({}).trials, isEmpty);
  });

  test(
      'pendente = aguardando o centro; confirmada = agendada; recusada = cancelada',
      () {
    final pending = trainingFromCenterTrial(_trial('pending'), now)!;
    expect(pending.state, TrainingState.awaitingCenter);
    expect(pending.isTrial, isTrue);
    expect(pending.isCenter, isTrue);
    expect(pending.centerName, 'CT Elevate');
    expect(
        pending.endAt.difference(pending.startAt), const Duration(minutes: 90));
    expect(trainingStateLabel(pending), 'AGUARDANDO');
    expect(trainingTypeLabel(pending), 'Experimental');

    final confirmed = trainingFromCenterTrial(_trial('confirmed'), now)!;
    expect(confirmed.state, TrainingState.scheduled);
    expect(trainingStateLabel(confirmed), 'CONFIRMADA');

    expect(trainingFromCenterTrial(_trial('declined'), now)!.state,
        TrainingState.canceled);
    // Passou: confirmada vira realizada; pendente sem resposta não aconteceu.
    expect(
        trainingFromCenterTrial(_trial('confirmed', date: '2026-10-15'), now)!
            .state,
        TrainingState.done);
    expect(
        trainingFromCenterTrial(_trial('pending', date: '2026-10-15'), now)!
            .state,
        TrainingState.canceled);
  });

  test('entra na linha do tempo; a aula da matrícula substitui o pedido', () {
    final list = buildTrainings(
        classes: const [],
        privateLessons: const [],
        centerTrials: [_trial('pending')],
        now: now);
    expect(list.single.centerTrial?.bookingId, 'k1_2026-10-29_uMe');

    final center = TrainingCenterLink.fromMap({
      'centerId': 'ct1',
      'name': 'CT Elevate',
      'sessions': [
        {
          'sessionId': 'k1_2026-10-29',
          'classId': 'k1',
          'className': 'Kids',
          'date': '2026-10-29',
          'startTime': '18:00',
          'durationMin': 90
        },
      ],
    });
    final both = buildTrainings(
      classes: const [],
      privateLessons: const [],
      centers: [center],
      centerTrials: [_trial('confirmed')],
      now: now,
    );
    expect(both.length, 1);
    expect(both.single.centerTrial, isNull);
    expect(both.single.centerSession, isNotNull);
  });

  test('aba Agenda: card de experimental com o status do centro', () {
    AthleteAgendaItem? item(String status, {String date = '2026-10-29'}) =>
        mapCenterTrialToAgendaItem(
          centerId: 'ct1',
          centerName: 'CT Elevate',
          sessionId: 'k1_$date',
          className: 'Kids',
          date: date,
          startTime: '18:00',
          endTime: '19:30',
          coachName: 'Juliana Rocha',
          locationName: 'Sede',
          status: status,
          now: now,
        );
    final p = item('pending')!;
    expect(p.statusLabel, 'AGUARDANDO O CENTRO');
    expect(p.subtitle, 'CT Elevate · Sede · Prof. Juliana');
    expect(p.classSession?.kind, 'trial');
    expect(p.classSession?.trialCenterId, 'ct1');
    expect(p.isCanceled, isFalse);
    expect(item('confirmed')!.statusLabel, 'EXPERIMENTAL');
    expect(item('declined')!.statusLabel, 'RECUSADA');
    expect(item('declined')!.isCanceled, isTrue);
    expect(item('pending', date: '2026-10-15')!.statusLabel, 'NÃO CONFIRMADA');
  });
}
