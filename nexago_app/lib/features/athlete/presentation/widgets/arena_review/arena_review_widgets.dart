import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/arena_review_eligibility.dart';
import '../../../domain/arena_review_providers.dart';

/// Abre "Avaliar reserva" (`/booking/:bookingId/review`).
void openArenaReview(BuildContext context, String bookingId) {
  context.pushNamed(
    AppRouteNames.bookingArenaReview,
    pathParameters: {'bookingId': bookingId},
  );
}

const _weekdays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

/// Cor do humor da nota: verde do bom pra cima, amarelo no regular, laranja abaixo.
Color arenaReviewMoodColor(BuildContext context, int? rating) {
  final colors = context.themeColors;
  if (rating == null) return colors.onSurfaceMuted;
  if (rating >= 4) return colors.win;
  if (rating == 3) return colors.pending;
  return colors.brandText;
}

/// Selo "+10 XP" em mono. [onBrand] é a versão sobre o botão laranja.
class ArenaReviewXpChip extends StatelessWidget {
  const ArenaReviewXpChip({super.key, this.onBrand = false});

  final bool onBrand;

  @override
  Widget build(BuildContext context) {
    final fg = onBrand ? AppColors.black : context.themeColors.brandText;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: onBrand
            ? AppColors.black.withValues(alpha: 0.12)
            : AppColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: onBrand
              ? AppColors.black.withValues(alpha: 0.25)
              : AppColors.brand.withValues(alpha: 0.45),
        ),
      ),
      child: Text(
        '+$arenaReviewXp XP',
        style: AppTypography.mono(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }
}

/// Ticket da reserva: bloco de data, arena · horário, quadra e selo "Jogada".
class ArenaReviewBookingTicket extends StatelessWidget {
  const ArenaReviewBookingTicket({
    super.key,
    required this.arenaName,
    required this.courtName,
    required this.dateRaw,
    required this.startTime,
    required this.endTime,
  });

  final String arenaName;
  final String courtName;
  final String dateRaw;
  final String startTime;
  final String endTime;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final day = dateRaw.length >= 10
        ? DateTime.tryParse(dateRaw.substring(0, 10))
        : null;
    final time =
        [startTime, endTime].where((t) => t.trim().isNotEmpty).join(' – ');
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 56,
            decoration: BoxDecoration(
              color: colors.surfaceRaised,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  day == null ? '—' : _weekdays[day.weekday - 1],
                  style: AppTypography.mono(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                    color: colors.brandText,
                  ),
                ),
                Text(
                  day == null ? '' : '${day.day}',
                  style: AppTypography.soraRegular(
                    fontSize: 20,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  time.isEmpty ? arenaName : '$arenaName · $time',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: colors.onSurface,
                  ),
                ),
                if (courtName.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    courtName,
                    style:
                        TextStyle(fontSize: 12.5, color: colors.onSurfaceMuted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          _Pill(label: 'JOGADA', color: colors.win),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 9.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 1.1,
          color: color,
        ),
      ),
    );
  }
}

/// Estrelas como herói: cinco alvos de 56 px, humor da nota acima e régua embaixo.
class ArenaReviewStarHero extends StatelessWidget {
  const ArenaReviewStarHero({
    super.key,
    required this.rating,
    required this.onChanged,
    this.enabled = true,
  });

  final int? rating;
  final ValueChanged<int> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final scaleStyle = AppTypography.mono(
      fontSize: 9.5,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.1,
      color: colors.onSurfaceMuted,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          arenaReviewMoodLabel(rating),
          key: const ValueKey('arena-review-mood'),
          textAlign: TextAlign.center,
          style: AppTypography.soraRegular(
            fontSize: 18,
            color: arenaReviewMoodColor(context, rating),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (index) {
            final star = index + 1;
            final filled = (rating ?? 0) >= star;
            return Padding(
              padding: EdgeInsets.only(left: index == 0 ? 0 : 8),
              child: Semantics(
                button: true,
                selected: rating == star,
                label: '$star de 5',
                child: Material(
                  color: filled
                      ? AppColors.brand.withValues(alpha: 0.10)
                      : colors.surfaceCard,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(
                      color: filled
                          ? AppColors.brand.withValues(alpha: 0.55)
                          : colors.outline.withValues(alpha: 0.35),
                    ),
                  ),
                  child: InkWell(
                    key: ValueKey('arena-review-star-$star'),
                    borderRadius: BorderRadius.circular(14),
                    onTap: enabled ? () => onChanged(star) : null,
                    child: SizedBox(
                      width: 56,
                      height: 56,
                      child: AnimatedScale(
                        scale: filled ? 1 : 0.92,
                        duration: const Duration(milliseconds: 180),
                        curve: Curves.easeOutBack,
                        child: Icon(
                          filled
                              ? Icons.star_rounded
                              : Icons.star_outline_rounded,
                          size: 30,
                          color:
                              filled ? AppColors.brand : colors.onSurfaceMuted,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('PÉSSIMO', style: scaleStyle),
              Text('EXCELENTE', style: scaleStyle),
            ],
          ),
        ),
      ],
    );
  }
}

/// Chip de destaque (pílula de 36 px; marcada vira laranja cheia).
class ArenaReviewChip extends StatelessWidget {
  const ArenaReviewChip({
    super.key,
    required this.label,
    required this.selected,
    this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Material(
      color: selected ? AppColors.brand : colors.surfaceCard,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected
              ? AppColors.brand
              : colors.outline.withValues(alpha: 0.45),
        ),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: selected
                  ? AppColors.black
                  : colors.onSurface.withValues(alpha: 0.8),
            ),
          ),
        ),
      ),
    );
  }
}

/// Entrada da avaliação no detalhe da reserva: "Avaliar experiência" enquanto não
/// avaliou; depois, o selo "Avaliada". Some quando a reserva não é avaliável.
class ArenaReviewEntryCard extends ConsumerWidget {
  const ArenaReviewEntryCard({super.key, required this.bookingId, this.onOpen});

  final String bookingId;

  /// Quem abre a tela de avaliar; padrão: empurra a rota. A folha de Minhas reservas
  /// fecha antes de navegar.
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final status =
        ref.watch(arenaBookingReviewStatusProvider(bookingId)).valueOrNull;
    if (status == null) return const SizedBox.shrink();
    if (status == ArenaBookingReviewStatus.reviewed) {
      return Container(
        key: const ValueKey('arena-review-done'),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: colors.win.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: colors.win.withValues(alpha: 0.35)),
        ),
        child: Row(
          children: [
            Icon(Icons.star_rounded, size: 18, color: colors.win),
            const SizedBox(width: 10),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: 'Avaliada. ',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: colors.win),
                    ),
                    const TextSpan(
                        text: 'Obrigado por contar como foi o jogo.'),
                  ],
                ),
                style: TextStyle(
                    fontSize: 13,
                    color: colors.onSurface.withValues(alpha: 0.8)),
              ),
            ),
          ],
        ),
      );
    }
    return SizedBox(
      height: 52,
      child: FilledButton(
        key: const ValueKey('arena-review-open'),
        onPressed: onOpen ?? () => openArenaReview(context, bookingId),
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.brand,
          foregroundColor: AppColors.black,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.star_rounded, size: 18),
            SizedBox(width: 8),
            Flexible(
              child: Text(
                'Avaliar experiência',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
              ),
            ),
            SizedBox(width: 8),
            ArenaReviewXpChip(onBrand: true),
          ],
        ),
      ),
    );
  }
}
