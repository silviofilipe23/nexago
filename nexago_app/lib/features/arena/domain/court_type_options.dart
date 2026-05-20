import 'package:flutter/material.dart';

/// Rótulos sugeridos para o tipo de quadra (`arenas/{arenaId}/courts/{id}.type`).
const List<String> kCourtTypeOptions = [
  'Futevôlei',
  'Beach tennis',
  'Vôlei de praia',
  'Vôlei indoor',
  'Tênis',
  'Pickleball',
  'Outro',
];

/// Tipos em destaque no formulário de quadra (cards horizontais).
class FeaturedCourtType {
  const FeaturedCourtType({
    required this.value,
    required this.label,
    required this.icon,
  });

  /// Valor persistido em `type`.
  final String value;

  /// Rótulo no card (ex.: Beach Volley).
  final String label;
  final IconData icon;
}

/// Cards do formulário de quadra (todos os esportes de [kCourtTypeOptions]).
const List<FeaturedCourtType> kCourtTypeCards = [
  FeaturedCourtType(
    value: 'Futevôlei',
    label: 'Futevôlei',
    icon: Icons.sports_soccer_outlined,
  ),
  FeaturedCourtType(
    value: 'Beach tennis',
    label: 'Beach tennis',
    icon: Icons.sports_tennis_outlined,
  ),
  FeaturedCourtType(
    value: 'Vôlei de praia',
    label: 'Vôlei de praia',
    icon: Icons.sports_volleyball_outlined,
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
    value: 'Pickleball',
    label: 'Pickleball',
    icon: Icons.sports_baseball_outlined,
  ),
  FeaturedCourtType(
    value: 'Outro',
    label: 'Outro',
    icon: Icons.grid_view_rounded,
  ),
];

const List<int> kCourtBasePricePresets = [60, 80, 100];
