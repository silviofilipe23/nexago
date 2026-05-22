import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'br_locations_data.dart';

final brLocationsDataProvider = FutureProvider<BrLocationsData>((ref) async {
  return BrLocationsData.load();
});
