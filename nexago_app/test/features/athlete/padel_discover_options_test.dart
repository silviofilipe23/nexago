import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_discover_logic.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_logic.dart';

/// Padel virou esporte de perfil (multiesporte 3c2): a descoberta de atletas
/// e de equipes precisa filtrar por ele.
void main() {
  test('descoberta de atletas filtra por padel', () {
    expect(discoverSportFilterOptions(), contains('Padel'));
    expect(sportFirestoreIdForLabel('Padel'), 'PADEL');
  });

  test('descoberta de equipes filtra por padel', () {
    expect(teamDiscoverSportFilterOptions(), contains('Padel'));
    expect(teamSportFirestoreIdForLabel('Padel'), 'PADEL');
  });
}
