
import '../../arenas/domain/arena_search_metadata.dart';

/// Esportes da quadra: ver `kCourtSportOptions` em `arenas/domain/arena_sport_codes.dart`
/// (código do catálogo desde a fase 5b do multiesporte).

const List<int> kCourtBasePricePresets = [60, 80, 100];

/// Superfícies no perfil da arena (mesmas do filtro do atleta).
const List<String> kArenaSurfaceOptions = ArenaSearchMetadata.surfaceOptions;
