import 'package:flutter/material.dart';

import '../../arenas/domain/arena_search_metadata.dart';

/// Esportes por quadra (`courts.types` — lista; `type` mantém o primeiro por legado).
/// Alinhado a [ArenaSearchMetadata.sportLabels].
const List<String> kCourtTypeOptions = [
  'Vôlei de praia',
  'Beach tennis',
  'Vôlei indoor',
  'Tênis',
  'Padel',
  'Futebol',
  'Futevôlei',
  'Pickleball',
];

/// Cards do formulário de quadra.
class FeaturedCourtType {
  const FeaturedCourtType({
    required this.value,
    required this.label,
    required this.icon,
  });

  final String value;
  final String label;
  final IconData icon;
}

const List<FeaturedCourtType> kCourtTypeCards = [
  FeaturedCourtType(
    value: 'Vôlei de praia',
    label: 'Vôlei de praia',
    icon: Icons.sports_volleyball_outlined,
  ),
  FeaturedCourtType(
    value: 'Beach tennis',
    label: 'Beach tennis',
    icon: Icons.sports_tennis_outlined,
  ),
  FeaturedCourtType(
    value: 'Vôlei indoor',
    label: 'Vôlei indoor',
    icon: Icons.sports_volleyball,
  ),
  FeaturedCourtType(
    value: 'Tênis',
    label: 'Tênis',
    icon: Icons.sports_tennis,
  ),
  FeaturedCourtType(
    value: 'Padel',
    label: 'Padel',
    icon: Icons.sports_handball_outlined,
  ),
  FeaturedCourtType(
    value: 'Futebol',
    label: 'Futebol',
    icon: Icons.sports_soccer_outlined,
  ),
  FeaturedCourtType(
    value: 'Futevôlei',
    label: 'Futevôlei',
    icon: Icons.sports_soccer_outlined,
  ),
  FeaturedCourtType(
    value: 'Pickleball',
    label: 'Pickleball',
    icon: Icons.sports_baseball_outlined,
  ),
];

const List<int> kCourtBasePricePresets = [60, 80, 100];

/// Superfícies no perfil da arena (mesmas do filtro do atleta).
const List<String> kArenaSurfaceOptions = ArenaSearchMetadata.surfaceOptions;
