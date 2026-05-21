import 'package:flutter/foundation.dart';

/// Usa Firestore (`tournaments`, `leagues`) em vez do mock estático.
const bool kUseFirestoreTournamentDiscovery = true;

/// Em debug, se Firestore retornar vazio, volta ao mock para desenvolvimento local.
bool get kFallbackToMockIfEmpty => kDebugMode;
