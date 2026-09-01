import 'dart:io';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/brand/nexa_hashtag.dart';
import '../../../core/review/app_review_providers.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../../core/ui/nexa_share.dart';
import '../../../core/ui/nexa_skeleton.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_registration_receipt.dart';
import '../domain/tournament_registration_share_phrases.dart';
import '../domain/tournament_registration_success_args.dart';
import 'widgets/registration_wizard/registration_wizard_scaffold.dart';
import 'widgets/tournament_registration/tournament_registration_share_card.dart';

/// Ainda sem valor e sem erro — vale a silhueta. Com erro, renderiza o que
/// houver em vez de travar no skeleton.
bool _stillLoading(AsyncValue<Object?> value) =>
    value.valueOrNull == null && !value.hasError;

class TournamentRegistrationSuccessPage extends ConsumerWidget {
  const TournamentRegistrationSuccessPage({super.key, required this.args});

  final TournamentRegistrationSuccessArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournamentAsync = ref.watch(
      tournamentDetailProvider(args.tournamentId),
    );
    final tournament = tournamentAsync.valueOrNull;
    final receiptAsync = ref.watch(
      tournamentRegistrationReceiptProvider(args.registrationId),
    );
    final receipt = receiptAsync.valueOrNull;
    final enrollmentAsync = ref.watch(
      tournamentCategoryEnrollmentCountsProvider(args.tournamentId),
    );
    final enrollment = enrollmentAsync.valueOrNull ?? const <String, int>{};

    // Sem comprovante/torneio/vagas o card sairia com '—' no lugar dos nomes
    // e da vaga: enquanto carrega, mostra a silhueta do card. Em erro o card
    // sai como der — skeleton eterno prenderia o atleta sem compartilhar.
    final contentLoading =
        _stillLoading(tournamentAsync) ||
        _stillLoading(receiptAsync) ||
        _stillLoading(enrollmentAsync);

    TournamentCategoryOffer? offer;
    if (tournament != null) {
      final targetId = receipt?.categoryId.trim() ?? '';
      for (final c in tournament.categoryOffers) {
        if ((targetId.isNotEmpty && c.id == targetId) ||
            c.name == args.categoryName) {
          offer = c;
          break;
        }
      }
    }

    final categoryId = offer?.id ?? receipt?.categoryId ?? args.categoryName;
    final slotLabel = formatRegistrationSlotLabel(
      offer: offer,
      enrollmentByCategoryId: enrollment,
      categoryId: categoryId,
    );

    final receiptCode = formatRegistrationReceiptCode(args.registrationId);
    final player1 = receipt?.player1Name ?? '—';
    final player2 = receipt?.player2Name ?? '—';
    final dateLabel = tournament != null
        ? tournamentShareCardDateLabel(tournament)
        : '';
    final locationLine = tournament != null
        ? tournamentShareCardLocationLine(tournament)
        : '';
    final footerLabel = tournament != null
        ? tournamentShareCardFooter(tournament)
        : 'NEXAGO';

    return _TournamentRegistrationSuccessView(
      args: args,
      tournament: tournament,
      contentLoading: contentLoading,
      receiptCode: receiptCode,
      slotLabel: slotLabel,
      player1: player1,
      player2: player2,
      player1AvatarUrl: receipt?.player1AvatarUrl,
      player2AvatarUrl: receipt?.player2AvatarUrl,
      dateLabel: dateLabel,
      locationLine: locationLine,
      footerLabel: footerLabel,
    );
  }
}

class _TournamentRegistrationSuccessView extends ConsumerStatefulWidget {
  const _TournamentRegistrationSuccessView({
    required this.args,
    required this.tournament,
    required this.contentLoading,
    required this.receiptCode,
    required this.slotLabel,
    required this.player1,
    required this.player2,
    this.player1AvatarUrl,
    this.player2AvatarUrl,
    required this.dateLabel,
    required this.locationLine,
    required this.footerLabel,
  });

  final TournamentRegistrationSuccessArgs args;
  final TournamentDetail? tournament;

  /// Comprovante/torneio/vagas ainda carregando — o card sai como skeleton.
  final bool contentLoading;
  final String receiptCode;
  final String slotLabel;
  final String player1;
  final String player2;
  final String? player1AvatarUrl;
  final String? player2AvatarUrl;
  final String dateLabel;
  final String locationLine;
  final String footerLabel;

  @override
  ConsumerState<_TournamentRegistrationSuccessView> createState() =>
      _TournamentRegistrationSuccessViewState();
}

class _TournamentRegistrationSuccessViewState
    extends ConsumerState<_TournamentRegistrationSuccessView> {
  final _shareCardKey = GlobalKey();
  bool _sharing = false;
  late final TournamentRegistrationSharePhrase _sharePhrase;

  @override
  void initState() {
    super.initState();
    _sharePhrase = pickTournamentRegistrationSharePhrase(
      widget.args.registrationId.hashCode,
    );

    // Pico positivo do app — vaga garantida — é a hora de pedir a avaliação
    // na loja. O delay deixa o atleta ver a conquista antes do diálogo; o
    // cooldown do serviço evita repetir o pedido a cada inscrição.
    Future.delayed(const Duration(seconds: 3), () {
      if (!mounted) return;
      ref.read(appReviewServiceProvider).maybeRequestReview();
    });
  }

  @override
  Widget build(BuildContext context) {
    final args = widget.args;

    return RegistrationWizardScaffold(
      title: 'Confirmado',
      onBack: () => _onClose(context),
      // Tela terminal: `onBack` não desfaz o pagamento que acabou de
      // acontecer, sai para o detalhe do torneio. A seta padrão prometeria
      // "voltar" e entregaria outra coisa — o "X" comunica "fechar" certo.
      closeIcon: true,
      stickyBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenH,
            0,
            AppSpacing.screenH,
            AppSpacing.xl,
          ),
          child: Row(
            children: [
              NexaIconSquareButton(
                size: 54,
                icon: Icons.calendar_month_outlined,
                tooltip: 'Adicionar ao calendário',
                onTap: () => _openCalendar(context),
              ),
              SizedBox(width: 10),
              Expanded(
                child: SizedBox(
                  height: 54,
                  child: FilledButton.icon(
                    onPressed: _sharing || widget.contentLoading
                        ? null
                        : () => _shareToStory(context),
                    style: FilledButton.styleFrom(
                      shape: RoundedRectangleBorder(
                        borderRadius: AppRadii.lgAll,
                      ),
                    ),
                    icon: _sharing
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            // O indicador não herda o foreground do
                            // botão: sem cor fixa cairia no primary
                            // (laranja sobre laranja).
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: AppColors.black,
                            ),
                          )
                        : Icon(Icons.ios_share_rounded, size: 22),
                    label: Text(
                      'Compartilhar no story',
                      style: AppTypography.soraRegular(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      children: [
        // O código do comprovante morava na toolbar antiga
        // (`_RegistrationSuccessAppBar`) — a casca do wizard não tem slot de
        // ação à direita do título, então ele migra para cá. Mesmo texto,
        // mesma fonte mono, só de lugar novo.
        Align(
          alignment: Alignment.centerRight,
          child: Text(
            widget.receiptCode,
            style: AppTypography.monoMeta.copyWith(
              color: context.themeColors.onSurfaceMuted,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        widget.contentLoading
            ? const NexaSkeleton(height: 420, radius: AppRadii.xlAll)
            : RepaintBoundary(
                key: _shareCardKey,
                child: TournamentRegistrationShareCard(
                  headlineLine1: _sharePhrase.line1,
                  headlineLine2: _sharePhrase.line2,
                  tournamentName: args.tournamentName,
                  dateLabel: widget.dateLabel,
                  categoryName: args.categoryName,
                  slotLabel: widget.slotLabel,
                  player1Name: widget.player1,
                  player2Name: widget.player2,
                  player1AvatarUrl: widget.player1AvatarUrl,
                  player2AvatarUrl: widget.player2AvatarUrl,
                  locationLine: widget.locationLine,
                  footerLabel: widget.footerLabel,
                ),
              ),
      ],
    );
  }

  void _onClose(BuildContext context) {
    ref
        .read(tournamentRegistrationSuccessHandledIdsProvider.notifier)
        .markHandled(widget.args.registrationId);
    context.goNamed(
      AppRouteNames.tournamentDetail,
      pathParameters: {'tournamentId': widget.args.tournamentId},
    );
  }

  Future<void> _shareToStory(BuildContext context) async {
    setState(() => _sharing = true);
    try {
      for (final url in [widget.player1AvatarUrl, widget.player2AvatarUrl]) {
        final trimmed = url?.trim();
        if (trimmed == null || trimmed.isEmpty) continue;
        if (!context.mounted) return;
        await precacheImage(CachedNetworkImageProvider(trimmed), context);
      }

      if (!context.mounted) return;
      await WidgetsBinding.instance.endOfFrame;

      final file = await _captureShareCardPng(_shareCardKey);
      if (!context.mounted) return;
      if (file == null) {
        showAppSnackBar(context, 'Não foi possível gerar a imagem.');
        return;
      }

      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        text: withNexaHashtag(
          'Inscrição confirmada no ${widget.args.tournamentName}',
        ),
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } catch (_) {
      if (context.mounted) {
        showAppSnackBar(context, 'Não foi possível compartilhar.');
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<File?> _captureShareCardPng(GlobalKey boundaryKey) async {
    final renderObject = boundaryKey.currentContext?.findRenderObject();
    if (renderObject is! RenderRepaintBoundary) return null;

    final image = await renderObject.toImage(pixelRatio: 3);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    if (byteData == null) return null;

    final file = File(
      '${Directory.systemTemp.path}/nexago_inscricao_'
      '${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(byteData.buffer.asUint8List());
    return file;
  }

  Future<void> _openCalendar(BuildContext context) async {
    final tournament = widget.tournament;
    if (tournament == null) {
      showAppSnackBar(context, 'Datas do torneio indisponíveis.');
      return;
    }
    final start = tournament.startDate;
    final end = tournament.endDate ?? start;
    final fmt = DateFormat("yyyyMMdd'T'HHmmss'Z'");
    final startStr = fmt.format(
      DateTime.utc(start.year, start.month, start.day),
    );
    final endStr = fmt.format(
      DateTime.utc(end.year, end.month, end.day, 23, 59, 59),
    );
    final title = Uri.encodeComponent(
      'Torneio · ${widget.args.tournamentName}',
    );
    final details = Uri.encodeComponent(
      '${widget.args.categoryName} · Dupla: ${formatShareCardPlayerLine(widget.player1, widget.player2)}',
    );
    final location = Uri.encodeComponent(tournament.location);
    final url = Uri.parse(
      'https://calendar.google.com/calendar/render?action=TEMPLATE'
      '&text=$title&dates=$startStr/$endStr&details=$details&location=$location',
    );
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      if (!context.mounted) return;
      showAppSnackBar(context, 'Não foi possível abrir o calendário.');
    }
  }
}
