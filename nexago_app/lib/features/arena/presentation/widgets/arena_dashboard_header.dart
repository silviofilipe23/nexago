import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_schedule_providers.dart';
import '../../domain/arena_selection_providers.dart';

/// Cabeçalho do Painel: logo, nome da arena (com troca quando o usuário
/// alcança mais de uma), saudação e data.
///
/// Não tem sino: enquanto não existe central de notificações, um ponto de
/// "não lida" fixo só ensinava o gestor a ignorá-lo. As pendências reais
/// estão na caixa "Precisa de você" da aba Agora.
class ArenaDashboardHeader extends ConsumerWidget {
  const ArenaDashboardHeader({super.key, this.now});

  /// Relógio injetável (teste); `null` usa a hora atual.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final arena = ref.watch(managedArenaDetailProvider).valueOrNull;
    final access = ref.watch(arenaAccessProvider).valueOrNull;
    final memberships =
        ref.watch(arenaMembershipsProvider).valueOrNull ?? const [];
    final name = (arena?.name.trim().isNotEmpty ?? false)
        ? arena!.name.trim()
        : (access?.arenaName.trim().isNotEmpty ?? false)
            ? access!.arenaName.trim()
            : 'Arena';
    final canSwitch = memberships.length > 1;
    final today = now ?? DateTime.now();

    final title = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
              color: colors.onSurface,
            ),
          ),
        ),
        if (canSwitch) ...[
          const SizedBox(width: 2),
          Icon(Icons.expand_more_rounded, color: colors.onSurfaceMuted),
        ],
      ],
    );

    return Row(
      children: [
        _ArenaLogo(name: name, logoUrl: arena?.logoUrl),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (canSwitch)
                Semantics(
                  button: true,
                  label: 'Trocar de arena',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => _pickArena(context, ref, memberships),
                    child: title,
                  ),
                )
              else
                title,
              const SizedBox(height: 2),
              Text(
                '${arenaGreeting(today)} · ${_formatDay(today)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: colors.onSurfaceMuted,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _formatDay(DateTime d) {
    final raw = DateFormat("EEE, d 'de' MMM", 'pt_BR').format(d);
    return raw.replaceAll('.', '');
  }

  Future<void> _pickArena(
    BuildContext context,
    WidgetRef ref,
    List<ArenaMembership> memberships,
  ) async {
    final current = ref.read(arenaAccessProvider).valueOrNull?.arenaId;
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: context.themeColors.surfaceSheet,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final m in memberships)
              ListTile(
                title: Text(m.name.isEmpty ? 'Arena' : m.name),
                subtitle: Text(m.isOwner ? 'Dono' : 'Equipe'),
                trailing: m.arenaId == current
                    ? const Icon(Icons.check_rounded, color: AppColors.brand)
                    : null,
                onTap: () => Navigator.of(sheetContext).pop(m.arenaId),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (picked == null || picked == current) return;
    ref.read(currentArenaIdProvider.notifier).selectArena(picked);
  }
}

/// "Bom dia" / "Boa tarde" / "Boa noite" pela hora local.
String arenaGreeting(DateTime now) {
  if (now.hour < 5) return 'Boa noite';
  if (now.hour < 12) return 'Bom dia';
  if (now.hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

class _ArenaLogo extends StatelessWidget {
  const _ArenaLogo({required this.name, this.logoUrl});

  final String name;
  final String? logoUrl;

  static const double _size = 44;

  @override
  Widget build(BuildContext context) {
    final url = logoUrl?.trim() ?? '';
    final initial = name.isEmpty ? 'A' : name.characters.first.toUpperCase();
    final fallback = Container(
      width: _size,
      height: _size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.brand,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        initial,
        style: const TextStyle(
          color: AppColors.black,
          fontWeight: FontWeight.w800,
          fontSize: 18,
        ),
      ),
    );
    if (url.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: CachedNetworkImage(
        imageUrl: url,
        width: _size,
        height: _size,
        fit: BoxFit.cover,
        placeholder: (_, __) => fallback,
        errorWidget: (_, __, ___) => fallback,
      ),
    );
  }
}
