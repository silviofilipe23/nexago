import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/match_history/athlete_match_detail_models.dart';
import 'match_detail_share_capture.dart';
import 'match_detail_share_card.dart';
import 'match_detail_section_header.dart';

enum MatchDetailSharePresentation { page, sheet }

class MatchDetailShareSection extends StatefulWidget {
  const MatchDetailShareSection({
    super.key,
    required this.share,
    this.compact = false,
    this.presentation = MatchDetailSharePresentation.page,
    this.snackBarMessenger,
  });

  final MatchDetailShareInfo share;
  final bool compact;
  final MatchDetailSharePresentation presentation;
  final ScaffoldMessengerState? snackBarMessenger;

  @override
  State<MatchDetailShareSection> createState() =>
      _MatchDetailShareSectionState();
}

class _MatchDetailShareSectionState extends State<MatchDetailShareSection> {
  final _captureKey = GlobalKey();
  bool _exporting = false;

  void _showShareMessage(String message) {
    final messenger = widget.snackBarMessenger;
    if (messenger != null) {
      showAppSnackBar(messenger.context, message);
      return;
    }
    if (mounted) {
      showAppSnackBar(context, message);
    }
  }

  Future<void> _exportAndShare() async {
    if (_exporting) return;
    setState(() => _exporting = true);

    final shareOrigin = matchDetailSharePositionOrigin(context);
    final closingSheet =
        widget.presentation == MatchDetailSharePresentation.sheet;
    final sheetNavigator = closingSheet ? Navigator.of(context) : null;

    try {
      await _precacheShareAvatars(context);
      if (!mounted) return;
      await WidgetsBinding.instance.endOfFrame;
      await Future<void>.delayed(const Duration(milliseconds: 32));
      if (!mounted) return;

      final file = await captureMatchDetailShareCardPng(_captureKey);
      if (!mounted) return;
      if (file == null) {
        _showShareMessage('Não foi possível gerar a imagem.');
        return;
      }

      if (closingSheet && sheetNavigator != null && sheetNavigator.mounted) {
        sheetNavigator.pop();
        await Future<void>.delayed(const Duration(milliseconds: 280));
      }

      final result = await shareMatchDetailShareCardPng(
        file,
        variant: widget.share.variant,
        sharePositionOrigin: shareOrigin,
      );

      if (result.status == ShareResultStatus.unavailable) {
        _showShareMessage('Não foi possível compartilhar.');
      }
    } catch (error, stackTrace) {
      debugPrint('match detail share failed: $error\n$stackTrace');
      _showShareMessage('Não foi possível compartilhar.');
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _precacheShareAvatars(BuildContext context) async {
    final urls = <String>{
      for (final player in [
        ...widget.share.winnersPlayers,
        ...widget.share.opponentsPlayers,
      ])
        player.avatarUrl?.trim() ?? '',
    }..removeWhere((url) => url.isEmpty);

    await Future.wait(
      urls.map((url) async {
        try {
          await precacheImage(CachedNetworkImageProvider(url), context);
        } catch (error) {
          debugPrint('share avatar precache skipped ($url): $error');
        }
      }),
    );
  }

  double _previewWidth(BuildContext context) {
    final screenW = MediaQuery.sizeOf(context).width;
    final horizontalPad = widget.presentation == MatchDetailSharePresentation.sheet
        ? 48.0
        : 40.0;
    final maxW = widget.presentation == MatchDetailSharePresentation.sheet
        ? 260.0
        : 300.0;
    return (screenW - horizontalPad).clamp(200.0, maxW);
  }

  @override
  Widget build(BuildContext context) {
    final preview = _ShareCardPreview(
      captureKey: _captureKey,
      share: widget.share,
      previewWidth: _previewWidth(context),
    );

    if (widget.compact) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: preview,
      );
    }

    final horizontalPad = widget.presentation == MatchDetailSharePresentation.sheet
        ? 20.0
        : 0.0;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: horizontalPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MatchDetailSectionHeader(
            eyebrow: 'COMPARTILHAR',
            title: shareSectionTitle(widget.share.variant),
          ),
          SizedBox(height: 20),
          Center(child: preview),
          SizedBox(height: 24),
          SizedBox(
            height: 54,
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _exporting ? null : _exportAndShare,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.brand,
                foregroundColor: AppColors.black,
                disabledBackgroundColor:
                    AppColors.brand.withValues(alpha: 0.55),
                disabledForegroundColor: AppColors.black.withValues(alpha: 0.6),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              icon: _exporting
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: AppColors.black,
                      ),
                    )
                  : Icon(Icons.ios_share_rounded, size: 22),
              label: Text(
                'Compartilhar',
                style: AppTypography.soraRegular(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                ),
              ),
            ),
          ),
          if (widget.presentation == MatchDetailSharePresentation.sheet)
            SizedBox(height: 4),
        ],
      ),
    );
  }
}

/// Preview escalado; o [RepaintBoundary] mantém o artboard em [MatchDetailShareCard.designWidth].
class _ShareCardPreview extends StatelessWidget {
  const _ShareCardPreview({
    required this.captureKey,
    required this.share,
    required this.previewWidth,
  });

  final GlobalKey captureKey;
  final MatchDetailShareInfo share;
  final double previewWidth;

  @override
  Widget build(BuildContext context) {
    final previewHeight = previewWidth *
        (MatchDetailShareCard.designHeight / MatchDetailShareCard.designWidth);

    return SizedBox(
      width: previewWidth,
      height: previewHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: AppColors.brand.withValues(alpha: 0.2),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.4),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: FittedBox(
            fit: BoxFit.contain,
            alignment: Alignment.topCenter,
            child: RepaintBoundary(
              key: captureKey,
              child: MatchDetailShareCard(share: share),
            ),
          ),
        ),
      ),
    );
  }
}

String shareSectionTitle(MatchDetailShareVariant variant) {
  return switch (variant) {
    MatchDetailShareVariant.victory => 'Mostre a vitória',
    MatchDetailShareVariant.defeat => 'Compartilhe o resultado',
    MatchDetailShareVariant.live => 'Está rolando',
    MatchDetailShareVariant.scheduled => 'Convide pro jogo',
    MatchDetailShareVariant.spectator => 'Compartilhe a partida',
  };
}

void showMatchDetailShareSheet(
  BuildContext context,
  MatchDetailShareInfo share,
) {
  final snackBarMessenger = ScaffoldMessenger.of(context);
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: context.themeColors.surfaceSheet,
    isScrollControlled: true,
    useSafeArea: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            MatchDetailShareSection(
              share: share,
              presentation: MatchDetailSharePresentation.sheet,
              snackBarMessenger: snackBarMessenger,
            ),
          ],
        ),
      );
    },
  );
}
