import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/layout/nexa_app_bar.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/errors/friendly_error_message.dart';
import '../../../core/formatting/app_date_format.dart';
import '../../../core/observability/analytics_log.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../../arenas/domain/my_bookings_providers.dart';
import '../domain/arena_review.dart';
import '../domain/arena_review_eligibility.dart';
import '../domain/arena_review_form_logic.dart';
import '../domain/arena_review_providers.dart';
import 'widgets/arena_review/arena_review_form_sections.dart';
import 'widgets/arena_review/arena_review_success_view.dart';
import 'widgets/arena_review/arena_review_widgets.dart';
import '../../arenas/presentation/arena_booking_navigation.dart';

/// "Avaliar a arena" (`/booking/:bookingId/review`) — canvas "Avaliação da arena depois
/// do horário · app do atleta" 02–03, com as opções que mudam com a nota e o fim com
/// "Jogar de novo". [initialRating] chega da estrela tocada no cartão da Agenda.
class ArenaReviewPage extends ConsumerStatefulWidget {
  const ArenaReviewPage({
    super.key,
    required this.bookingId,
    this.initialRating,
  });

  final String bookingId;
  final int? initialRating;

  @override
  ConsumerState<ArenaReviewPage> createState() => _ArenaReviewPageState();
}

class _ArenaReviewPageState extends ConsumerState<ArenaReviewPage> {
  /// Depois de aberto, o formulário fica: ao enviar, a reserva vira "avaliada" e a
  /// tela trocaria o "Avaliação enviada" pelo "Você já avaliou".
  PendingArenaReview? _formTarget;

  @override
  Widget build(BuildContext context) {
    final target = ref.watch(arenaReviewTargetProvider(widget.bookingId));
    final status =
        ref.watch(arenaBookingReviewStatusProvider(widget.bookingId));
    final uid = ref.watch(authProvider).valueOrNull?.uid ?? '';

    Widget body;
    final formTarget = _formTarget;
    if (formTarget != null) {
      body = _form(formTarget);
    } else if (target.isLoading || status.isLoading) {
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

  Widget _form(PendingArenaReview target) => ArenaReviewForm(
        key: ValueKey('arena-review-form-${target.bookingId}'),
        target: target,
        initialRating: widget.initialRating,
      );

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
        subtitle: 'Obrigado por contar como foi jogar na ${target.arenaName}.',
        actionLabel: 'Ver agenda',
        onAction: () => openDiscoverAgendaTab(context),
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
    _formTarget = target;
    return _form(target);
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
                  : openDiscoverAgendaTab(context),
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
        'Avaliar a arena',
        style: AppTypography.soraRegular(fontSize: 16, color: colors.onSurface),
      ),
    );
  }
}

/// Formulário: ticket da reserva, pergunta, estrelas, opções da nota, pontualidade,
/// comentário e o CTA na barra de baixo; ao enviar, vira o "Avaliação enviada".
/// Público para os testes de widget.
class ArenaReviewForm extends ConsumerStatefulWidget {
  const ArenaReviewForm({super.key, required this.target, this.initialRating});

  final PendingArenaReview target;
  final int? initialRating;

  @override
  ConsumerState<ArenaReviewForm> createState() => _ArenaReviewFormState();
}

class _ArenaReviewFormState extends ConsumerState<ArenaReviewForm> {
  final _comment = TextEditingController();
  Set<String> _tags = const {};
  late int? _rating = widget.initialRating;
  bool? _onTime;
  bool _showComment = false;
  bool _sending = false;
  bool _sent = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  void _setRating(int value) => setState(() {
        _tags = keepArenaReviewTags(_tags, from: _rating, to: value);
        _rating = value;
      });

  void _toggleTag(String tag) => setState(() {
        _tags = _tags.contains(tag)
            ? (_tags.where((t) => t != tag).toSet())
            : {..._tags, tag};
      });

  Future<void> _submit() async {
    final rating = _rating;
    if (_sending || rating == null) return;
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
    final tags = _tags.toList(growable: false);
    final comment = composeArenaReviewComment(
      tags,
      _comment.text,
      tone: arenaReviewToneFor(rating),
    );
    final onTime = _onTime;
    final hasComment = _comment.text.trim().isNotEmpty;
    // O atleta pode sair durante o envio: o container sobrevive ao widget, o `ref` não.
    final container = ProviderScope.containerOf(context, listen: false);
    try {
      await container.read(arenaReviewServiceProvider).submitArenaReview(
            arenaId: target.arenaId,
            bookingId: target.bookingId,
            userId: userId,
            rating: rating,
            comment: comment,
            tags: tags,
            onTime: onTime,
          );
      // XP creditado pelo gatilho de `arena_reviews` nas functions.
      container.read(locallyReviewedBookingsProvider.notifier).update(
            (ids) => {...ids, target.bookingId},
          );
      container.invalidate(myBookingsStreamProvider);
      logAnalyticsIn(
        container,
        (a) => a.logArenaReviewSubmitted(
          rating: rating,
          tagCount: tags.length,
          hasComment: hasComment,
          onTime: onTime,
          source: widget.initialRating == null ? 'screen' : 'agenda_card',
        ),
      );
      if (!mounted) return;
      setState(() => _sent = true);
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

  void _leave() {
    if (context.canPop()) {
      context.pop();
    } else {
      openDiscoverAgendaTab(context);
    }
  }

  ArenaReviewRebookSuggestion? _rebookSuggestion(int rating) {
    final target = widget.target;
    if (arenaReviewToneFor(rating) != ArenaReviewTone.praise) return null;
    final played = target.dateRaw.length >= 10
        ? DateTime.tryParse(target.dateRaw.substring(0, 10))
        : null;
    if (played == null || target.startTime.trim().isEmpty) return null;
    return ArenaReviewRebookSuggestion(
      date: arenaReviewRebookDate(playedOn: played, now: DateTime.now()),
      startTime: target.startTime.trim(),
      courtName: target.courtName,
    );
  }

  void _openRebook(int rating, ArenaReviewRebookSuggestion suggestion) {
    final target = widget.target;
    logAnalytics(ref, (a) => a.logArenaReviewRebookTapped(rating: rating));
    context.pushNamed(
      AppRouteNames.arenaSlots,
      pathParameters: {'arenaId': target.arenaId},
      queryParameters: {
        'date': calendarDateKey(suggestion.date),
        'startTime': suggestion.startTime,
        if (target.courtId.trim().isNotEmpty) 'courtId': target.courtId.trim(),
        if (target.sport.trim().isNotEmpty) 'esporte': target.sport.trim(),
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // Mantém o login carregado: o envio lê o uid na hora do toque.
    ref.watch(authProvider);
    final target = widget.target;
    final rating = _rating;
    if (_sent && rating != null) {
      final rebook = _rebookSuggestion(rating);
      return ArenaReviewSuccessView(
        arenaName: target.arenaName,
        rating: rating,
        onBack: _leave,
        rebook: rebook,
        onRebook: rebook == null ? null : () => _openRebook(rating, rebook),
      );
    }
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            child: _formBody(context, rating),
          ),
        ),
        _SubmitBar(
          rating: rating,
          sending: _sending,
          onSubmit: _submit,
        ),
      ],
    );
  }

  Widget _formBody(BuildContext context, int? rating) {
    final colors = context.themeColors;
    final target = widget.target;
    final arenaName =
        target.arenaName.trim().isEmpty ? 'arena' : target.arenaName.trim();
    return Column(
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
              const TextSpan(text: 'Como foi jogar na '),
              TextSpan(
                text: arenaName,
                style: TextStyle(color: colors.brandText),
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
          rating: rating,
          enabled: !_sending,
          onChanged: _setRating,
        ),
        if (rating != null) ...[
          const SizedBox(height: 24),
          ArenaReviewTagsSection(
            rating: rating,
            selected: _tags,
            enabled: !_sending,
            onToggle: _toggleTag,
          ),
          const SizedBox(height: 22),
          ArenaReviewOnTimeQuestion(
            value: _onTime,
            enabled: !_sending,
            onChanged: (value) => setState(() => _onTime = value),
          ),
          const SizedBox(height: 14),
          ArenaReviewCommentField(
            controller: _comment,
            open: _showComment,
            enabled: !_sending,
            maxLength: arenaReviewCommentMax,
            onOpen: () => setState(() => _showComment = true),
          ),
          const SizedBox(height: 12),
          const _PublicNotice(),
        ],
      ],
    );
  }
}

class _PublicNotice extends StatelessWidget {
  const _PublicNotice();

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: colors.surfaceCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: colors.outline.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline_rounded,
              size: 16, color: colors.onSurfaceMuted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Sua nota, as opções marcadas e o comentário aparecem no perfil '
              'da arena com o seu nome.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.45,
                color: colors.onSurface.withValues(alpha: 0.8),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// CTA fixo: sem nota fica desligado e diz o que falta, em vez de avisar depois.
class _SubmitBar extends StatelessWidget {
  const _SubmitBar({
    required this.rating,
    required this.sending,
    required this.onSubmit,
  });

  final int? rating;
  final bool sending;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final ready = rating != null;
    Widget label;
    if (sending) {
      label = const SizedBox(
        width: 22,
        height: 22,
        child:
            CircularProgressIndicator(strokeWidth: 2, color: AppColors.black),
      );
    } else if (!ready) {
      label = const Text(
        'Escolha uma nota',
        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      );
    } else {
      label = const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Flexible(
            child: Text(
              'Enviar avaliação',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
          ),
          SizedBox(width: 8),
          ArenaReviewXpChip(onBrand: true),
        ],
      );
    }
    return Container(
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
          onPressed: ready && !sending ? onSubmit : null,
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.brand,
            foregroundColor: AppColors.black,
            disabledBackgroundColor: sending
                ? AppColors.brand.withValues(alpha: 0.5)
                : colors.surfaceRaised,
            disabledForegroundColor:
                sending ? AppColors.black : colors.onSurfaceMuted,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: label,
        ),
      ),
    );
  }
}
