import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_model.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_registration_receipt.dart';

TournamentDetail _detail({required DateTime startDate}) {
  return TournamentDetail(
    id: 't1',
    name: 'Torneio Rápido',
    location: 'Arena Beach GYN',
    city: 'Goiânia, GO',
    dateLabel: '',
    startDate: startDate,
    endDate: null,
    categories: const [],
    format: TournamentFormat.dupla,
    priceLabel: r'R$ 180',
    priceValue: 180,
    spotsLeft: 8,
    spotsTotal: 16,
    status: TournamentListingStatus.open,
    featured: false,
    enrolledCount: 4,
    liveMatchesNow: 0,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  // O card de inscrição é desenhado à mão no app e no portal do atleta, então a
  // marca do rodapé tem de sair idêntica nas duas pontas — senão o mesmo atleta
  // vê rodapés diferentes conforme compartilhe pelo app ou pelo portal. O par
  // web destes casos está em
  // `frontend/projects/athlete/src/app/tournaments/registration/registration-share.spec.ts`.
  group('tournamentShareCardFooter', () {
    test('marca é NEXAGO seguida do mês/ano do torneio', () {
      expect(
        tournamentShareCardFooter(_detail(startDate: DateTime(2026, 5, 18))),
        'NEXAGO · MAI 2026',
      );
    });

    test('mês abreviado sai sem ponto, como no portal web', () {
      // `DateFormat('MMM yyyy', 'pt_BR')` abrevia com ponto ("mai."); o portal
      // web remove esse ponto. Sem o mesmo corte aqui, o app emitiria
      // `NEXAGO · MAI. 2026` e os rodapés voltariam a divergir.
      final footer = tournamentShareCardFooter(
        _detail(startDate: DateTime(2026, 5, 18)),
      );
      expect(footer.contains('.'), isFalse);
    });

    test('setembro (abreviação mais longa) também sai sem ponto', () {
      expect(
        tournamentShareCardFooter(_detail(startDate: DateTime(2026, 9, 3))),
        'NEXAGO · SET 2026',
      );
    });
  });
}
