import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../core/router/routes.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/app_status_views.dart';
import '../data/tournament_review_service.dart';
import '../domain/tournament_review_logic.dart';
import '../domain/tournament_review_models.dart';
import '../domain/tournament_review_providers.dart';
import 'widgets/tournament_detail/tournament_detail_subpage_scaffold.dart';
import 'widgets/tournament_review/review_star_row.dart';

/// Formulário da avaliação do torneio (`/torneios/:tournamentId/avaliar`). Nota geral
/// obrigatória, 5 aspectos opcionais e comentário opcional; anônimo para o organizador.
class TournamentReviewPage extends ConsumerStatefulWidget {
  const TournamentReviewPage({super.key, required this.tournamentId});

  final String tournamentId;

  @override
  ConsumerState<TournamentReviewPage> createState() =>
      _TournamentReviewPageState();
}

class _TournamentReviewPageState extends ConsumerState<TournamentReviewPage> {
  final _comment = TextEditingController();
  int? _overall;
  final _aspects = <TournamentReviewAspect, int>{};
  bool _sending = false;
  bool _prefilled = false;

  @override
  void initState() {
    super.initState();
    // Edição: pré-preenche UMA vez com a avaliação salva. Não atropela o atleta porque, em modo
    // edição, o formulário só aparece depois disto (ver `_content`).
    ref.listenManual<AsyncValue<MyTournamentReview?>>(
      myTournamentReviewProvider(widget.tournamentId),
      (_, next) {
        final review = next.valueOrNull;
        if (review == null || _prefilled || !mounted) return;
        setState(() {
          _prefilled = true;
          _overall = review.overall;
          _aspects
            ..clear()
            ..addAll(review.aspects);
          _comment.text = review.comment ?? '';
        });
      },
      fireImmediately: true,
    );
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inviteAsync =
        ref.watch(tournamentReviewInviteProvider(widget.tournamentId));
    return TournamentDetailSubpageScaffold(
      title: 'Avaliar torneio',
      body: inviteAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const AppInlineErrorView(
            message: 'Não foi possível carregar a avaliação.'),
        data: (invite) => _content(context, invite),
      ),
    );
  }

  Widget _content(BuildContext context, TournamentReviewInvite? invite) {
    final state = tournamentReviewCtaState(invite, DateTime.now());
    if (invite == null || state == TournamentReviewCtaState.none) {
      return const AppEmptyView(
        icon: Icons.star_outline_rounded,
        title: 'Nada para avaliar aqui',
        subtitle: 'Só quem jogou o torneio recebe o convite para avaliar.',
      );
    }
    if (state == TournamentReviewCtaState.closed) {
      return AppEmptyView(
        icon: Icons.lock_clock_outlined,
        title:
            'Avaliação encerrada em ${tournamentReviewDayMonth(invite.closesAt)}',
        subtitle: 'A nota deste torneio já fechou. Obrigado por jogar!',
      );
    }

    final theme = Theme.of(context);
    final muted = context.themeColors.onSurfaceMuted;
    final isEdit = state == TournamentReviewCtaState.submitted;
    // Edição: o formulário só aparece com a avaliação salva já carregada. Antes disso ele viria
    // vazio, e salvar por cima apagaria aspectos e comentário (o servidor grava sem merge).
    if (isEdit && !_prefilled) {
      final mine = ref.watch(myTournamentReviewProvider(widget.tournamentId));
      if (mine.hasError || (mine.hasValue && mine.value == null)) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Não foi possível carregar sua avaliação.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge,
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () => ref.invalidate(
                      myTournamentReviewProvider(widget.tournamentId)),
                  child: const Text('Tentar novamente'),
                ),
              ],
            ),
          ),
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final eyebrow = theme.textTheme.labelSmall?.copyWith(
      color: muted,
      fontWeight: FontWeight.w800,
      letterSpacing: 0.8,
    );

    // Coluna rolável, não ListView: o formulário é curto e tudo precisa ficar montado — o
    // botão de enviar e o campo de comentário não podem sumir só porque saíram da tela.
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tournamentReviewQuestion(invite.tournamentName),
            style: theme.textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            isEdit
                ? 'Dá pra editar até ${tournamentReviewDayMonth(invite.closesAt)}.'
                : 'Sua nota ajuda o organizador a melhorar o próximo evento.',
            style: theme.textTheme.bodyMedium?.copyWith(color: muted),
          ),
          const SizedBox(height: 24),
          Text('NOTA GERAL', style: eyebrow),
          const SizedBox(height: 8),
          Center(
            child: ReviewStarRow(
              keyPrefix: 'overall',
              value: _overall,
              size: 40,
              enabled: !_sending,
              onChanged: (value) => setState(() => _overall = value),
            ),
          ),
          const SizedBox(height: 4),
          Center(
            child: Text(
              tournamentReviewRatingLabel(_overall),
              style: theme.textTheme.titleSmall?.copyWith(
                color: AppColors.brand,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text('QUER DETALHAR? (OPCIONAL)', style: eyebrow),
          const SizedBox(height: 8),
          for (final aspect in TournamentReviewAspect.values)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(aspect.label, style: theme.textTheme.bodyMedium),
                  ReviewStarRow(
                    keyPrefix: aspect.key,
                    value: _aspects[aspect],
                    size: 26,
                    allowClear: true,
                    enabled: !_sending,
                    onChanged: (value) => setState(() {
                      if (value == null) {
                        _aspects.remove(aspect);
                      } else {
                        _aspects[aspect] = value;
                      }
                    }),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 14),
          Text('COMENTÁRIO (OPCIONAL)', style: eyebrow),
          const SizedBox(height: 8),
          TextField(
            controller: _comment,
            enabled: !_sending,
            minLines: 3,
            maxLines: 6,
            maxLength: kTournamentReviewCommentMax,
            decoration: const InputDecoration(
              hintText: 'O que o organizador deveria manter ou mudar?',
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.lock_outline_rounded, size: 16, color: muted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'O organizador lê sem o seu nome. Evite se identificar no texto.',
                  style: theme.textTheme.bodySmall?.copyWith(color: muted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          SizedBox(
            height: 48,
            child: FilledButton(
              key: const ValueKey('review-submit'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
              onPressed:
                  _overall == null || _sending ? null : () => _submit(invite),
              child: Text(
                _sending
                    ? 'Enviando…'
                    : isEdit
                        ? 'Salvar alterações'
                        : 'Enviar avaliação',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submit(TournamentReviewInvite invite) async {
    final overall = _overall;
    if (overall == null || _sending) return;
    setState(() => _sending = true);
    try {
      final created = await ref.read(tournamentReviewServiceProvider).submit(
            tournamentId: invite.tournamentId,
            overall: overall,
            aspects: Map.of(_aspects),
            comment: _comment.text,
          );
      if (!mounted) return;
      ref.invalidate(myTournamentReviewProvider(widget.tournamentId));
      showAppSnackBar(
        context,
        created
            ? 'Obrigado! +$kTournamentReviewXp XP'
            : 'Avaliação atualizada.',
      );
      if (context.canPop()) {
        context.pop();
      } else {
        context.goNamed(
          AppRouteNames.tournamentDetail,
          pathParameters: {'tournamentId': widget.tournamentId},
        );
      }
    } on TournamentReviewException catch (e) {
      if (mounted) showAppSnackBar(context, e.message, isError: true);
    } catch (_) {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível enviar sua avaliação. Tente de novo em instantes.',
          isError: true,
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }
}
