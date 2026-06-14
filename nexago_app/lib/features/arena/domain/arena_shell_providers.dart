import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ui/shell_scroll_registry.dart';

/// Controllers de scroll das abas do shell da arena.
final arenaShellScrollRegistryProvider = Provider<ShellScrollRegistry>((ref) {
  final registry = ShellScrollRegistry(5);
  ref.onDispose(registry.dispose);
  return registry;
});
