import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/errors/friendly_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/arena_review.dart';
import '../domain/arena_review_eligibility.dart';
import '../domain/arena_review_providers.dart';
import 'widgets/arena_review/arena_review_widgets.dart';

/// "Avaliar reserva" (`/booking/:bookingId/review`) — canvas "Avaliação da arena depois
/// do horário · app do atleta" 02–03. Substitui o diálogo antigo, que só abria numa
/// tela fora da navegação.
class ArenaReviewPage extends ConsumerWidget {
  const ArenaReviewPage({super.key, required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final target = ref.watch(arenaReviewTargetProvider(bookingId));
    final status = ref.watch(arenaBookingReviewStatusProvider(bookingId));
    final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';

    Widget body;
    if (target.isLoading || status.isLoading) {
      body = const AppLoadingView(message: 'Carregando a reserva…');
    } else if (target.hasError) {
      body = const AppInlineErrorView(
          message: 'Não foi possível carregar a reserva.');
    } else {
      body = _content(context, target.value, status.valueOrNull, uid);
    }

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      appBar: const _ReviewAppBar(),
      body: SafeArea(top: false, child: body),
    );
  }

  Widget _content(
    BuildContext context,
    PendingArenaReview? target,
    ArenaBookingReviewStatus? status,
    String uid,
  ) {
    if (target == null) {
      return const AppEmptyView(
        icon: Icons.event_busy_outlined,
        title: 'Reserva não encontrada',
        subtitle: 'Ela pode ter sido removida pela arena.',
      );
    }
    if (status == ArenaBookingReviewStatus.reviewed) {
      return AppEmptyView(
        icon: Icons.star_rounded,
        title: 'Você já avaliou esta reserva',
        subtitle: 'Obrigado por contar como foi o jogo na ${target.arenaName}.',
        actionLabel: 'Ver minhas reservas',
        onAction: () => context.go(AppRoutes.myBookings),
      );
    }
    if (target.ownerUid.isNotEmpty && target.ownerUid != uid) {
      return const AppEmptyView(
        icon: Icons.person_outline_rounded,
        title: 'Só quem reservou avalia',
        subtitle: 'A avaliação da arena fica com o dono da reserva.',
      );
    }
    final reviewable = isArenaBookingReviewable(
      rawStatus: target.rawStatus,
      dateRaw: target.dateRaw,
      startTime: target.startTime,
      endTime: target.endTime,
      now: DateTime.now(),
    );
    if (!reviewable) {
      return const AppEmptyView(
        icon: Icons.schedule_rounded,
        title: 'Ainda não dá para avaliar',
        subtitle: 'A avaliação abre alguns minutos depois que o horário acaba.',
      );
    }
    return ArenaReviewForm(target: target);
  }
}

class _ReviewAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _ReviewAppBar();

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight + 8);

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return NexaAppBar(
      backgroundColor: colors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      toolbarHeight: kToolbarHeight + 8,
      leading: Padding(
        padding: const EdgeInsets.only(left: 16),
        child: Center(
          child: Material(
            color: colors.surfaceCard,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: colors.outline.withValues(alpha: 0.35)),
            ),
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => context.canPop()
                  ? context.pop()
                  : context.go(AppRoutes.myBookings),
              child: SizedBox(
                width: 40,
                height: 40,
                child: Icon(
                  Icons.chevron_left_rounded,
                  color: colors.onSurface,
                  semanticLabel: 'Voltar',
                ),
              ),
            ),
          ),
        ),
      ),
      leadingWidth: 64,
      title: Text(
        'Avaliar reserva',
        style: AppTypography.soraRegular(fontSize: 16, color: colors.onSurface),
      ),
    );
  }
}

/// Formulário: ticket da reserva, pergunta, estrelas, destaques, comentário e o CTA na
/// barra de baixo. Público para os testes de widget.
class ArenaReviewForm extends ConsumerStatefulWidget {
  const ArenaReviewForm({super.key, required this.target});

  final PendingArenaReview target;

  @override
  ConsumerState<ArenaReviewForm> createState() => _ArenaReviewFormState();
}

class _ArenaReviewFormState extends ConsumerState<ArenaReviewForm> {
  final _comment = TextEditingController();
  final _highlights = <String>{};
  int? _rating;
  bool _showComment = false;
  bool _sending = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending) return;
    final rating = _rating;
    if (rating == null) {
      showAppSnackBar(context, 'Toque nas estrelas para dar sua nota.');
      return;
    }
    final userId = ref.read(authProvider).valueOrNull?.uid ?? '';
    if (userId.isEmpty) {
      showAppSnackBar(
        context,
        'Sua sessão expirou. Entre de novo e tente outra vez.',
        isError: true,
      );
      return;
    }
    setState(() => _sending = true);
    final target = widget.target;
    try {
      await ref.read(arenaReviewServiceProvider).submitArenaReview(
            arenaId: target.arenaId,
            bookingId: target.bookingId,
            userId: userId,
            rating: rating,
            comment: composeArenaReviewComment(_highlights, _comment.text),
          );
      // XP creditado pelo gatilho de `arena_reviews` nas functions.
      ref.read(locallyReviewedBookingsProvider.notifier).update(
            (ids) => {...ids, target.bookingId},
          );
      ref.invalidate(myBookingsStreamProvider);
      if (!mounted) return;
      showAppSnackBar(
          context, 'Obrigado! +$arenaReviewXp XP no seu progresso.');
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(AppRoutes.myBookings);
      }
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(
        context,
        friendlyErrorMessage(
          e,
          action: 'Não foi possível enviar a avaliação',
          logReason: 'reserva:avaliar_arena',
        ),
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Mantém o login carregado: o envio lê o uid na hora do toque.
    ref.watch(authProvider);
    final colors = context.themeColors;
    final target = widget.target;
    final arenaName =
        target.arenaName.trim().isEmpty ? 'arena' : target.arenaName.trim();
    final label = AppTypography.mono(
      fontSize: 9.5,
      fontWeight: FontWeight.w500,
      letterSpacing: 1.5,
      color: colors.onSurfaceMuted,
    );

    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ArenaReviewBookingTicket(
                  arenaName: target.arenaName,
                  courtName: target.courtName,
                  dateRaw: target.dateRaw,
                  startTime: target.startTime,
                  endTime: target.endTime,
                ),
                const SizedBox(height: 20),
                Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(text: 'Como foi o jogo na '),
                      TextSpan(
                        text: arenaName,
                        style: const TextStyle(color: AppColors.brand),
                      ),
                      const TextSpan(text: '?'),
                    ],
                  ),
                  style: AppTypography.soraRegular(
                    fontSize: 22,
                    height: 1.25,
                    color: colors.onSurface,
                  ),
                ),
                const SizedBox(height: 20),
                ArenaReviewStarHero(
                  rating: _rating,
                  enabled: !_sending,
                  onChanged: (value) => setState(() => _rating = value),
                ),
                const SizedBox(height: 24),
                Text('O QUE SE DESTACOU? · OPCIONAL', style: label),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final tag in arenaReviewHighlights)
                      ArenaReviewChip(
                        label: tag,
                        selected: _highlights.contains(tag),
                        onTap: _sending
                            ? null
                            : () => setState(() {
                                  if (!_highlights.remove(tag))
                                    _highlights.add(tag);
                                }),
                      ),
                    ArenaReviewChip(
                      key: const ValueKey('arena-review-comment-toggle'),
                      label: _showComment ? '✓ comentário' : '+ comentário',
                      selected: _showComment,
                      onTap: _sending
                          ? null
                          : () => setState(() => _showComment = !_showComment),
                    ),
                  ],
                ),
                if (_showComment) ...[
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('arena-review-comment'),
                    controller: _comment,
                    enabled: !_sending,
                    autofocus: true,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: arenaReviewCommentMax,
                    style: TextStyle(fontSize: 14, color: colors.onSurface),
                    decoration: InputDecoration(
                      hintText: 'O que a arena deveria manter ou mudar?',
                      filled: true,
                      fillColor: colors.surfaceCard,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: colors.outline.withValues(alpha: 0.35)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: colors.outline.withValues(alpha: 0.35)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: AppColors.brand.withValues(alpha: 0.6)),
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: colors.surfaceCard,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color: colors.outline.withValues(alpha: 0.35)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline_rounded,
                          size: 16, color: colors.onSurfaceMuted),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Sua nota aparece no perfil da arena com o seu nome.',
                          style: TextStyle(
                            fontSize: 12.5,
                            height: 1.45,
                            color: colors.onSurface.withValues(alpha: 0.8),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          decoration: BoxDecoration(
            color: colors.canvas,
            border: Border(
                top: BorderSide(color: colors.outline.withValues(alpha: 0.35))),
          ),
          child: SizedBox(
            height: 52,
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('arena-review-submit'),
              onPressed: _sending ? null : _submit,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor: AppColors.brand.withValues(alpha: 0.5),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              child: _sending
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.black),
                    )
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Flexible(
                          child: Text(
                            'Enviar avaliação',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 15),
                          ),
                        ),
                        SizedBox(width: 8),
                        ArenaReviewXpChip(onBrand: true),
                      ],
                    ),
            ),
          ),
        ),
      ],
    );
  }
}
