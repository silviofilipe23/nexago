import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Índice da aba ativa no [AthleteShellPage] (0 = Início … 4 = Perfil).
final athleteShellTabIndexProvider = StateProvider<int>((ref) => 0);

/// Aba Reservar — lista de arenas.
const athleteShellReservarTabIndex = 2;

/// Aba Competir / torneios.
const athleteShellCompeteTabIndex = 3;
