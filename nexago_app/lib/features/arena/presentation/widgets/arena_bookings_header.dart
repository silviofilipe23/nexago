import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_staff_role.dart';
import 'arena_bookings_filter_sheet.dart';
import 'arena_new_booking_button.dart';

/// Topo da aba Reservas: título, busca, filtro e "Nova reserva" (para quem
/// escreve na agenda; abre a agenda no dia aberto aqui).
///
/// O eyebrow "GESTOR · ARENA" e a linha de resumo saíram: o resumo do dia
/// virou a faixa de ocupação/em quadra/a receber dentro da lista.
class ArenaBookingsHeader extends ConsumerWidget {
  const ArenaBookingsHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final searching = ref.watch(arenaBookingsSearchProvider) != null;
    final activeFilters = ref.watch(arenaBookingsFilterProvider).activeGroups;
    final canWrite = ref.watch(arenaCanWriteProvider(ArenaArea.agenda));

    return Row(
      children: [
        Expanded(
          // Em tela estreita o título encolhe um pouco para caber a
          // "Nova reserva" ao lado da busca e do filtro.
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              'Reservas',
              maxLines: 1,
              style: theme.textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.5,
                color: context.themeColors.onSurface,
                fontSize: 26,
                height: 1.05,
              ),
            ),
          ),
        ),
        _HeaderButton(
          key: const Key('arena-bookings-search-toggle'),
          tooltip: searching ? 'Fechar busca' : 'Buscar reserva',
          icon: searching ? Icons.close_rounded : Icons.search_rounded,
          onPressed: () => ref
              .read(arenaBookingsSearchProvider.notifier)
              .state = searching ? null : '',
        ),
        const SizedBox(width: 8),
        Badge(
          isLabelVisible: activeFilters > 0,
          label: Text('$activeFilters'),
          backgroundColor: AppColors.brand,
          textColor: AppColors.black,
          child: _HeaderButton(
            key: const Key('arena-bookings-filter'),
            tooltip: 'Filtrar reservas',
            icon: Icons.tune_rounded,
            onPressed: () => showArenaBookingsFilterSheet(context),
          ),
        ),
        if (canWrite) ...[
          const SizedBox(width: 8),
          ArenaNewBookingButton(
            key: const Key('arena-bookings-new'),
            day: ref.watch(arenaBookingsSelectedDayProvider),
          ),
        ],
      ],
    );
  }
}

class _HeaderButton extends StatelessWidget {
  const _HeaderButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return IconButton.filledTonal(
      tooltip: tooltip,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: colors.surfaceRaised,
        foregroundColor: colors.onSurface,
        minimumSize: const Size(44, 44),
      ),
      icon: Icon(icon, size: 20),
    );
  }
}

/// Campo da busca (aparece sob o título com a busca aberta).
class ArenaBookingsSearchField extends ConsumerStatefulWidget {
  const ArenaBookingsSearchField({super.key});

  @override
  ConsumerState<ArenaBookingsSearchField> createState() =>
      _ArenaBookingsSearchFieldState();
}

class _ArenaBookingsSearchFieldState
    extends ConsumerState<ArenaBookingsSearchField> {
  late final TextEditingController _controller = TextEditingController(
    text: ref.read(arenaBookingsSearchProvider) ?? '',
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return TextField(
      key: const Key('arena-bookings-search-field'),
      controller: _controller,
      autofocus: true,
      textInputAction: TextInputAction.search,
      onChanged: (v) =>
          ref.read(arenaBookingsSearchProvider.notifier).state = v,
      decoration: InputDecoration(
        hintText: 'Atleta, cliente, quadra ou #NXG',
        prefixIcon: Icon(Icons.search_rounded, color: colors.onSurfaceMuted),
        filled: true,
        fillColor: colors.surfaceRaised,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
      ),
    );
  }
}
