import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/ui/shell_scroll_registry.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Controllers de scroll das abas do shell da arena.
final arenaShellScrollRegistryProvider = Provider<ShellScrollRegistry>((ref) {
  final registry = ShellScrollRegistry(5);
  ref.onDispose(registry.dispose);
  return registry;
});

/// Enquanto > 0, headers flutuantes do shell arena ficam ocultos (ex.: bottom sheet).
final arenaShellFloatingHeaderSuppressedProvider = StateProvider<int>((ref) => 0);

Future<T?> showArenaShellModalBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final notifier =
      container.read(arenaShellFloatingHeaderSuppressedProvider.notifier);
  notifier.update((count) => count + 1);
  try {
    return await showModalBottomSheet<T>(
      context: context,
      isScrollControlled: isScrollControlled,
      useRootNavigator: true,
      backgroundColor: context.themeColors.surfaceSheet,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: builder,
    );
  } finally {
    notifier.update((count) => (count - 1).clamp(0, 999999));
  }
}
