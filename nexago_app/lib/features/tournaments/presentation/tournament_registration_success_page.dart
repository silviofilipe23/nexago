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

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../data/tournament_inscriptions_repository.dart';
import '../domain/tournament_detail_model.dart';
import '../domain/tournament_discovery_models.dart';
import '../domain/tournament_discovery_providers.dart';
import '../domain/tournament_registration_providers.dart';
import '../domain/tournament_registration_receipt.dart';
import '../domain/tournament_registration_share_phrases.dart';
import '../domain/tournament_registration_success_args.dart';
import 'widgets/tournament_registration/tournament_registration_share_card.dart';

class TournamentRegistrationSuccessPage extends ConsumerWidget {
  const TournamentRegistrationSuccessPage({super.key, required this.args});

  final TournamentRegistrationSuccessArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tournament = ref
        .watch(tournamentDetailProvider(args.tournamentId))
        .valueOrNull;
    final receiptAsync = ref.watch(
      tournamentRegistrationReceiptProvider(args.registrationId),
    );
    final receipt = receiptAsync.valueOrNull;
    final enrollment =
        ref
            .watch(
              tournamentCategoryEnrollmentCountsProvider(args.tournamentId),
            )
            .valueOrNull ??
        const <String, int>{};

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
        : 'NEXAGO.APP ';

    return _TournamentRegistrationSuccessView(
      args: args,
      tournament: tournament,
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

class _TournamentRegistrationSuccessView extends StatefulWidget {
  const _TournamentRegistrationSuccessView({
    required this.args,
    required this.tournament,
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
  State<_TournamentRegistrationSuccessView> createState() =>
      _TournamentRegistrationSuccessViewState();
}

class _TournamentRegistrationSuccessViewState
    extends State<_TournamentRegistrationSuccessView> {
  final _shareCardKey = GlobalKey();
  bool _sharing = false;
  late final TournamentRegistrationSharePhrase _sharePhrase;

  @override
  void initState() {
    super.initState();
    _sharePhrase = pickTournamentRegistrationSharePhrase(
      widget.args.registrationId.hashCode,
    );
  }

  @override
  Widget build(BuildContext context) {
    final args = widget.args;

    return Scaffold(
      backgroundColor: context.themeColors.canvas,
      body: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 160,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    AppColors.brand.withValues(alpha: 0.18),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                  child: Row(
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Text(
                          widget.receiptCode,
                          style: AppTypography.mono(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: context.themeColors.onSurfaceMuted,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          'Confirmado',
                          textAlign: TextAlign.center,
                          style: AppTypography.soraRegular(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => _onClose(context),
                        icon: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: context.themeColors.surfaceRaised,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: context.themeColors.onSurfaceMuted.withValues(
                                alpha: 0.2,
                              ),
                            ),
                          ),
                          child: Icon(
                            Icons.close_rounded,
                            size: 20,
                            color: context.themeColors.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                    child: RepaintBoundary(
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
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: Row(
                    children: [
                      _CalendarIconButton(onTap: () => _openCalendar(context)),
                      SizedBox(width: 10),
                      Expanded(
                        child: SizedBox(
                          height: 54,
                          child: FilledButton.icon(
                            onPressed: _sharing
                                ? null
                                : () => _shareToStory(context),
                            style: FilledButton.styleFrom(
                              backgroundColor: AppColors.brand,
                              foregroundColor: AppColors.black,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            icon: _sharing
                                ? SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5,
                                      color: AppColors.black,
                                    ),
                                  )
                                : Icon(
                                    Icons.ios_share_rounded,
                                    size: 22,
                                    color: AppColors.black,
                                  ),
                            label: Text(
                              'Compartilhar no story',
                              style: AppTypography.soraRegular(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.black,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _onClose(BuildContext context) {
    context.go(AppRoutes.discover);
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

      await Share.shareXFiles([XFile(file.path, mimeType: 'image/png')]);
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

class _CalendarIconButton extends StatelessWidget {
  const _CalendarIconButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 54,
          height: 54,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.2),
            ),
          ),
          child: Icon(
            Icons.calendar_month_outlined,
            color: context.themeColors.onSurface,
            size: 22,
          ),
        ),
      ),
    );
  }
}
