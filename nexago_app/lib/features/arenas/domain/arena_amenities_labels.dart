import 'package:flutter/material.dart';

import 'arena_amenities.dart';

class ArenaAmenityDisplay {
  const ArenaAmenityDisplay({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;
}

/// Comodidades ativas da arena para exibição na tela de detalhe.
List<ArenaAmenityDisplay> activeArenaAmenityDisplays(ArenaAmenities amenities) {
  final out = <ArenaAmenityDisplay>[];
  if (amenities.parking) {
    out.add(const ArenaAmenityDisplay(
      label: 'Estacionamento',
      icon: Icons.local_parking_rounded,
    ));
  }
  if (amenities.lockerRoom) {
    out.add(const ArenaAmenityDisplay(
      label: 'Vestiário',
      icon: Icons.shopping_bag_outlined,
    ));
  }
  if (amenities.bar) {
    out.add(const ArenaAmenityDisplay(
      label: 'Bar',
      icon: Icons.local_bar_rounded,
    ));
  }
  if (amenities.racketRental) {
    out.add(const ArenaAmenityDisplay(
      label: 'Aluguel de raquetes',
      icon: Icons.sports_tennis_rounded,
    ));
  }
  if (amenities.coveredCourt) {
    out.add(const ArenaAmenityDisplay(
      label: 'Quadra coberta',
      icon: Icons.roofing_rounded,
    ));
  }
  return out;
}
