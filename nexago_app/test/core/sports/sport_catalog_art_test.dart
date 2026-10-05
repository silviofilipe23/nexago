import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/sport_art_catalog.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_draft.dart';
import 'package:nexago_app/features/organizer/domain/tournament_create/tournament_create_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_cover_art.dart';

void main() {
  test('capa de torneio aceita qualquer grafia do catálogo', () {
    expect(
      TournamentCoverArt.assetFor('beach_tennis'),
      'assets/images/sports/beach_tennis.webp',
    );
    expect(TournamentCoverArt.assetFor('other'), isNull);
    expect(TournamentCoverArt.assetFor('padel'), isNull);
  });

  test('arte do perfil aceita o id do app', () {
    expect(
      SportArtCatalog.assetFor('tennis'),
      'assets/images/sports/tenis.webp',
    );
    expect(SportArtCatalog.assetFor('OUTROS'), isNull);
  });

  test('revisão do wizard mostra o rótulo do esporte travado', () {
    expect(
      reviewSportSummary(const TournamentCreateDraft(sportRaw: 'beachTennis')),
      'Beach tennis',
    );
  });
}
