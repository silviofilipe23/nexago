import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/location/br_locations_data.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('parseLegacyLocation splits city and UF', () {
    final parsed = BrLocationsData.parseLegacyLocation(
      'Aparecida de Goiânia · GO',
    );
    expect(parsed.city, 'Aparecida de Goiânia');
    expect(parsed.state, 'GO');
  });

  test('formatLocationLabel builds display string', () {
    expect(
      BrLocationsData.formatLocationLabel(city: 'Goiânia', state: 'GO'),
      'Goiânia · GO',
    );
  });

  test('searchCities is accent-insensitive', () async {
    final data = await BrLocationsData.load();
    final hits = data.searchCities(uf: 'GO', query: 'goiania');
    expect(hits.any((c) => c.toLowerCase().contains('goiânia')), isTrue);
  });
}
