import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/arena_access_providers.dart';
import '../../domain/arena_bookings_day_providers.dart';
import '../../domain/arena_date_utils.dart';
import '../../domain/arena_staff_role.dart';

/// Altura do botão no header: a mesma dos botões redondos ao lado.
const double _headerHeight = 44;

/// Abaixo desta largura de tela o botão mostra só o "+".
const double arenaNewBookingCompactBelow = 380;

/// Botão "Nova reserva" dos headers (aba Reservas e Painel).
///
/// Mesma ação e mesmo visual do antigo botão flutuante da aba Reservas:
/// pílula laranja, "+" e "Nova reserva" em preto, e abre a agenda no dia
/// [day] (hoje quando `null`), onde o gestor escolhe quadra e horário. Só
/// aparece para quem escreve na agenda.
class ArenaNewBookingButton extends ConsumerWidget {
  const ArenaNewBookingButton({super.key, this.day});

  /// Dia em que a agenda abre; `null` = hoje.
  final DateTime? day;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(arenaCanWriteProvider(ArenaArea.agenda))) {
      return const SizedBox.shrink();
    }
    void open() {
      openArenaScheduleOn(ref, day ?? arenaTodayDateOnly());
      context.go(AppRoutes.arenaSchedule);
    }

    final style = FilledButton.styleFrom(
      backgroundColor: AppColors.brand,
      foregroundColor: AppColors.black,
      elevation: 2,
      shape: const StadiumBorder(),
      padding: const EdgeInsets.fromLTRB(10, 0, 14, 0),
      textStyle: const TextStyle(
        fontFamily: AppTypography.fontFamily,
        fontSize: 13,
        fontWeight: FontWeight.w800,
      ),
    );

    // Celular estreito: a mesma pílula só com o "+", para o título e o nome
    // da arena não espremerem. O rótulo segue no tooltip e no leitor de tela.
    if (MediaQuery.sizeOf(context).width < arenaNewBookingCompactBelow) {
      return Tooltip(
        message: 'Nova reserva',
        child: SizedBox(
          width: _headerHeight,
          height: _headerHeight,
          child: FilledButton(
            onPressed: open,
            style: style.copyWith(
              padding: const WidgetStatePropertyAll(EdgeInsets.zero),
              minimumSize: const WidgetStatePropertyAll(
                Size(_headerHeight, _headerHeight),
              ),
            ),
            child: const Icon(
              Icons.add_rounded,
              size: 22,
              semanticLabel: 'Nova reserva',
            ),
          ),
        ),
      );
    }

    return SizedBox(
      height: _headerHeight,
      child: FilledButton.icon(
        onPressed: open,
        style: style,
        icon: const Icon(Icons.add_rounded, size: 18),
        label: const Text('Nova reserva', maxLines: 1),
      ),
    );
  }
}
