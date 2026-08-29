import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_labels.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';

void main() {
  group('tournamentRegistrationOpensLabel', () {
    test('formata data e hora locais da abertura', () {
      expect(
        tournamentRegistrationOpensLabel(DateTime(2026, 9, 5, 10, 0)),
        'Inscrições abrem em 05/09 às 10:00',
      );
      expect(
        tournamentRegistrationOpensLabel(DateTime(2026, 12, 1, 7, 5)),
        'Inscrições abrem em 01/12 às 07:05',
      );
    });
  });

  group('tournamentDiscoveryCardCtaLabel — inscrições agendadas', () {
    test('sem abrir ainda, o card oferece só "Ver detalhes"', () {
      expect(
        tournamentDiscoveryCardCtaLabel(
          isEnrolled: false,
          status: TournamentListingStatus.open,
          registrationNotYetOpen: true,
        ),
        'Ver detalhes →',
      );
    });

    test('aberto continua oferecendo "Inscrever"', () {
      expect(
        tournamentDiscoveryCardCtaLabel(
          isEnrolled: false,
          status: TournamentListingStatus.open,
        ),
        'Inscrever →',
      );
    });

    test('inscrito ganha da agenda', () {
      expect(
        tournamentDiscoveryCardCtaLabel(
          isEnrolled: true,
          status: TournamentListingStatus.open,
          registrationNotYetOpen: true,
        ),
        'Ver inscrição',
      );
    });
  });

  group('tournamentStatusLabelFromRaw — inscrições agendadas', () {
    test('status aberto com abertura futura vira "Inscrições em breve"', () {
      expect(
        tournamentStatusLabelFromRaw(
          status: TournamentListingStatus.open,
          listingStatusRaw: 'open',
          registrationNotYetOpen: true,
        ),
        'Inscrições em breve',
      );
    });

    test('sem agenda futura mantém o rótulo normal', () {
      expect(
        tournamentStatusLabelFromRaw(
          status: TournamentListingStatus.open,
          listingStatusRaw: 'open',
        ),
        'Inscrições abertas',
      );
    });
  });
}
