import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../domain/match_history/match_share_poster_data.dart';
import 'match_detail_section_header.dart';
import 'match_share_poster_capture.dart';
import 'match_share_poster_painter.dart';

enum MatchDetailSharePresentation { page, sheet }

/// Compartilhar a partida como imagem. A arte é a mesma do portal do atleta
/// (ver [drawMatchSharePoster]); aqui ficam só o preview e a folha nativa.
class MatchDetailShareSection extends StatefulWidget {
  const MatchDetailShareSection({
    super.key,
    required this.poster,
    this.compact = false,
    this.presentation = MatchDetailSharePresentation.page,
    this.snackBarMessenger,
  });

  final MatchSharePosterData poster;
  final bool compact;
  final MatchDetailSharePresentation presentation;
  final ScaffoldMessengerState? snackBarMessenger;

  @override
  State<MatchDetailShareSection> createState() =>
      _MatchDetailShareSectionState();
}

class _MatchDetailShareSectionState extends State<MatchDetailShareSection> {
  Map<String, ui.Image> _photos = const {};
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _loadPhotos();
  }

  @override
  void didUpdateWidget(covariant MatchDetailShareSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Partida ao vivo reemite o pôster a cada ponto: só recarrega quando as
    // fotos mudam de verdade.
    final before = oldWidget.poster.photoUrls;
    final now = widget.poster.photoUrls;
    if (before.length != now.length ||
        !now.every((url) => before.contains(url))) {
      _loadPhotos();
    }
  }

  Future<void> _loadPhotos() async {
    final photos = await loadMatchSharePosterPhotos(widget.poster);
    if (!mounted) return;
    setState(() => _photos = photos);
  }

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

    final shareOrigin = matchSharePosterOrigin(context);
    final closingSheet =
        widget.presentation == MatchDetailSharePresentation.sheet;
    final sheetNavigator = closingSheet ? Navigator.of(context) : null;

    try {
      final photos = _photos.isEmpty && widget.poster.photoUrls.isNotEmpty
          ? await loadMatchSharePosterPhotos(widget.poster)
          : _photos;

      final file = await captureMatchSharePosterPng(widget.poster, photos);
      if (!mounted) return;
      if (file == null) {
        _showShareMessage('Não foi possível gerar a imagem.');
        return;
      }

      if (closingSheet && sheetNavigator != null && sheetNavigator.mounted) {
        sheetNavigator.pop();
        await Future<void>.delayed(const Duration(milliseconds: 280));
      }

      final result = await shareMatchSharePosterPng(
        file,
        widget.poster,
        sharePositionOrigin: shareOrigin,
      );

      if (result.status == ShareResultStatus.unavailable) {
        _showShareMessage('Não foi possível compartilhar.');
      }
    } catch (error, stackTrace) {
      debugPrint('match share poster failed: $error\n$stackTrace');
      _showShareMessage('Não foi possível compartilhar.');
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  double _previewWidth(BuildContext context) {
    final screenW = MediaQuery.sizeOf(context).width;
    final horizontalPad =
        widget.presentation == MatchDetailSharePresentation.sheet ? 48.0 : 40.0;
    final maxW = widget.presentation == MatchDetailSharePresentation.sheet
        ? 240.0
        : 280.0;
    return (screenW - horizontalPad).clamp(200.0, maxW);
  }

  @override
  Widget build(BuildContext context) {
    final preview = MatchSharePosterPreview(
      data: widget.poster,
      photos: _photos,
      width: _previewWidth(context),
    );

    if (widget.compact) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: preview,
      );
    }

    final horizontalPad =
        widget.presentation == MatchDetailSharePresentation.sheet ? 20.0 : 0.0;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: horizontalPad),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          MatchDetailSectionHeader(
            eyebrow: 'COMPARTILHAR',
            title: shareSectionTitle(widget.poster),
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
                disabledBackgroundColor: AppColors.brand.withValues(
                  alpha: 0.55,
                ),
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

/// Pôster escalado para caber na tela; o artboard segue em 1080×1920.
class MatchSharePosterPreview extends StatelessWidget {
  const MatchSharePosterPreview({
    super.key,
    required this.data,
    required this.photos,
    required this.width,
  });

  final MatchSharePosterData data;
  final Map<String, ui.Image> photos;
  final double width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: width * (matchSharePosterHeight / matchSharePosterWidth),
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
            child: SizedBox(
              width: matchSharePosterWidth,
              height: matchSharePosterHeight,
              child: CustomPaint(
                painter: MatchSharePosterPainter(data: data, photos: photos),
                isComplex: true,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String shareSectionTitle(MatchSharePosterData poster) {
  if (poster.finished) return 'Mostre o resultado';
  if (poster.live) return 'Está rolando';
  return 'Convide pro jogo';
}

void showMatchDetailShareSheet(
  BuildContext context,
  MatchSharePosterData poster,
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
                color: context.themeColors.onSurfaceMuted.withValues(
                  alpha: 0.35,
                ),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            MatchDetailShareSection(
              poster: poster,
              presentation: MatchDetailSharePresentation.sheet,
              snackBarMessenger: snackBarMessenger,
            ),
          ],
        ),
      );
    },
  );
}
