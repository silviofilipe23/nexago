import 'br_locations_data.dart';

enum UserLocationSource { gps, profile, none }

/// Localização usada para filtrar/ordenar arenas próximas.
class UserLocationSnapshot {
  const UserLocationSnapshot({
    required this.source,
    this.latitude,
    this.longitude,
    this.city = '',
    this.state = '',
  });

  final UserLocationSource source;
  final double? latitude;
  final double? longitude;
  final String city;
  final String state;

  bool get hasCoordinates =>
      latitude != null &&
      longitude != null &&
      latitude!.isFinite &&
      longitude!.isFinite;

  bool get hasProfilePlace => city.trim().isNotEmpty || state.trim().isNotEmpty;

  /// Frase para copy ("perto de você", "em Goiânia · GO").
  String get proximityPhrase {
    return switch (source) {
      UserLocationSource.gps => 'perto de você',
      UserLocationSource.profile => () {
          final label = BrLocationsData.formatLocationLabel(
            city: city,
            state: state,
          );
          if (label.isEmpty) return 'na sua região';
          return 'em $label';
        }(),
      UserLocationSource.none => 'com horário aberto',
    };
  }

  String get sectionTitlePrefix {
    return switch (source) {
      UserLocationSource.gps => 'Perto de você',
      UserLocationSource.profile => () {
          final label = BrLocationsData.formatLocationLabel(
            city: city,
            state: state,
          );
          if (label.isEmpty) return 'Na sua região';
          return 'Em $label';
        }(),
      UserLocationSource.none => 'Arenas disponíveis',
    };
  }
}
