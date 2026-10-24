import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../../core/layout/nexa_app_bar.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../../../core/ui/app_snackbar.dart';
import '../../../../../core/ui/nexa_share.dart';
import '../../../data/booking_story_photo_picker.dart';
import '../../../domain/booking_story.dart';
import 'booking_story_card.dart';

/// Estado comum aos editores de story (reserva e pós-jogo): fundo, foto da
/// câmera ou da galeria e a captura/compartilhamento do PNG.
mixin BookingStoryEditorMixin<T extends ConsumerStatefulWidget>
    on ConsumerState<T> {
  final storyCardKey = GlobalKey();

  /// Brasa abre pronto para postar; "Foto" só entra com uma foto escolhida.
  BookingStoryTheme storyTheme = BookingStoryTheme.ember;
  Uint8List? storyPhoto;
  bool storyBusy = false;

  /// Pergunta a origem (câmera ou galeria) e aplica a foto como fundo.
  Future<void> pickStoryPhoto() async {
    final source = await showBookingStoryPhotoSourceSheet(context);
    if (!mounted || source == null) return;
    Uint8List? bytes;
    try {
      bytes = await ref.read(bookingStoryPhotoPickerProvider)(source);
    } on PlatformException {
      if (mounted) {
        showAppSnackBar(
          context,
          source == BookingStoryPhotoSource.camera
              ? 'Não foi possível abrir a câmera. Confira a permissão nos '
                  'ajustes ou escolha da galeria.'
              : 'Não foi possível carregar esta foto. Tente outra imagem.',
          isError: true,
        );
      }
      return;
    }
    if (!mounted || bytes == null) return;
    setState(() {
      storyPhoto = bytes;
      storyTheme = BookingStoryTheme.photo;
    });
  }

  void selectStoryTheme(BookingStoryTheme theme) {
    if (theme == BookingStoryTheme.photo && storyPhoto == null) {
      pickStoryPhoto();
      return;
    }
    setState(() => storyTheme = theme);
  }

  /// Sem [caption] é o "Salvar imagem": a folha nativa tem "Salvar imagem" /
  /// "Salvar na galeria" e nenhum texto vai junto.
  Future<void> shareStory({String? caption, required String fileName}) async {
    if (storyBusy) return;
    setState(() => storyBusy = true);
    try {
      final file = await captureBookingStoryPng(storyCardKey, fileName);
      if (!mounted) return;
      if (file == null) {
        showAppSnackBar(
            context, 'Não foi possível gerar a imagem. Tente de novo.');
        return;
      }
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png', name: fileName)],
        text: caption,
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } finally {
      if (mounted) setState(() => storyBusy = false);
    }
  }
}

/// Folha "Foto de fundo": Tirar foto agora · Escolher da galeria.
Future<BookingStoryPhotoSource?> showBookingStoryPhotoSourceSheet(
  BuildContext context,
) {
  return showModalBottomSheet<BookingStoryPhotoSource>(
    context: context,
    useSafeArea: true,
    backgroundColor: context.themeColors.surfaceSheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
    builder: (sheetContext) {
      final colors = sheetContext.themeColors;
      Widget tile(IconData icon, String label, BookingStoryPhotoSource source) =>
          ListTile(
            key: ValueKey('booking-story-photo-source-${source.name}'),
            leading: Icon(icon, color: AppColors.brand),
            title: Text(
              label,
              style: AppTypography.titleS.copyWith(
                fontSize: 15,
                color: colors.onSurface,
              ),
            ),
            onTap: () => Navigator.pop(sheetContext, source),
          );
      return Padding(
        padding: EdgeInsets.only(
          bottom: 16 + MediaQuery.paddingOf(sheetContext).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 10),
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.onSurfaceMuted.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 6),
              child: Text(
                'Foto de fundo',
                style: AppTypography.titleL.copyWith(color: colors.onSurface),
              ),
            ),
            tile(
              Icons.photo_camera_outlined,
              'Tirar foto agora',
              BookingStoryPhotoSource.camera,
            ),
            tile(
              Icons.photo_library_outlined,
              'Escolher da galeria',
              BookingStoryPhotoSource.gallery,
            ),
          ],
        ),
      );
    },
  );
}

/// PNG da arte sob [key]. A boundary mede 360×640 dentro do FittedBox da
/// prévia: 3× = 1080×1920, qualquer que seja o tamanho na tela.
Future<File?> captureBookingStoryPng(GlobalKey key, String fileName) async {
  final boundary = key.currentContext?.findRenderObject();
  if (boundary is! RenderRepaintBoundary) return null;
  if (boundary.debugNeedsPaint) await WidgetsBinding.instance.endOfFrame;
  final image = await boundary.toImage(pixelRatio: 3);
  try {
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return null;
    final stem = fileName.replaceAll('.png', '');
    final file = File(
      '${Directory.systemTemp.path}/${stem}_${DateTime.now().millisecondsSinceEpoch}.png',
    );
    await file.writeAsBytes(bytes.buffer.asUint8List());
    return file;
  } finally {
    image.dispose();
  }
}

/// Moldura do editor: prévia 0,6× da arte, seções extras ([header]), seletor
/// de fundo, chips de informação e a barra Salvar / Postar.
class BookingStoryEditorScaffold extends StatelessWidget {
  const BookingStoryEditorScaffold({
    super.key,
    required this.title,
    required this.cardKey,
    required this.card,
    required this.theme,
    required this.photo,
    required this.busy,
    required this.onPickPhoto,
    required this.onSelectTheme,
    required this.onSave,
    required this.onPost,
    required this.infoChips,
    this.header = const [],
    this.infoFooter,
  });

  /// Prévia em 0,6× da base 360×640, como no protótipo.
  static const double previewScale = 0.6;

  final String title;
  final GlobalKey cardKey;

  /// A arte (360×640) que vira PNG.
  final Widget card;
  final BookingStoryTheme theme;
  final Uint8List? photo;
  final bool busy;
  final VoidCallback onPickPhoto;
  final ValueChanged<BookingStoryTheme> onSelectTheme;
  final VoidCallback onSave;
  final VoidCallback onPost;
  final List<Widget> infoChips;

  /// Entre a prévia e o "Fundo" (o resultado do pós-jogo).
  final List<Widget> header;

  /// Embaixo dos chips (a nota de quem é marcado, no story do professor).
  final Widget? infoFooter;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final photoPill = theme == BookingStoryTheme.photo || photo == null;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      bottomNavigationBar:
          _ShareBar(busy: busy, onSave: onSave, onPost: onPost),
      body: ListView(
        padding: const EdgeInsets.only(top: 4, bottom: 16),
        children: [
          Center(
            child: GestureDetector(
              onTap: photoPill ? onPickPhoto : null,
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.5),
                      blurRadius: 40,
                      offset: const Offset(0, 18),
                    ),
                    BoxShadow(
                      color: Colors.white.withValues(alpha: 0.08),
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Stack(
                    children: [
                      SizedBox.fromSize(
                        size: BookingStoryCard.size * previewScale,
                        child: FittedBox(
                          child: RepaintBoundary(key: cardKey, child: card),
                        ),
                      ),
                      if (photoPill)
                        Positioned(
                          top: 12,
                          right: 12,
                          child: _PhotoPill(
                            label: photo == null
                                ? 'Adicionar foto'
                                : 'Trocar foto',
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          ...header,
          const BookingStorySectionLabel('Fundo'),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
            child: Row(
              children: [
                for (final t in BookingStoryTheme.values) ...[
                  if (t != BookingStoryTheme.values.first)
                    const SizedBox(width: 10),
                  Expanded(
                    child: _ThemeTile(
                      theme: t,
                      photo: photo,
                      selected: t == theme,
                      onTap: () => onSelectTheme(t),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const BookingStorySectionLabel('Informações no story'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Wrap(spacing: 8, runSpacing: 8, children: infoChips),
          ),
          if (infoFooter != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
              child: infoFooter,
            ),
        ],
      ),
    );
  }
}

/// Rótulo de seção em mono caixa alta, com uma ação à direita opcional.
class BookingStorySectionLabel extends StatelessWidget {
  const BookingStorySectionLabel(this.text, {super.key, this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, action == null ? 20 : 8, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text.toUpperCase(),
              style: AppTypography.mono(
                fontSize: 10,
                letterSpacing: 1.4,
                color: context.themeColors.onSurface.withValues(alpha: 0.55),
              ),
            ),
          ),
          if (action != null) action!,
        ],
      ),
    );
  }
}

/// Chip liga/desliga de uma informação da arte.
class BookingStoryChip extends StatelessWidget {
  const BookingStoryChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final accent =
        colors.isDark ? AppColors.brandHover : AppColors.brandPressed;
    return Semantics(
      button: true,
      selected: selected,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.brand.withValues(alpha: 0.12)
                : colors.onSurface.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(99),
            border: Border.all(
              color: selected
                  ? AppColors.brand
                  : colors.onSurface.withValues(alpha: 0.10),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected) ...[
                Icon(Icons.check_rounded, size: 14, color: accent),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: AppTypography.soraRegular(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: selected
                      ? accent
                      : colors.onSurface.withValues(alpha: 0.62),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShareBar extends StatelessWidget {
  const _ShareBar({
    required this.busy,
    required this.onSave,
    required this.onPost,
  });

  final bool busy;
  final VoidCallback onSave;
  final VoidCallback onPost;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: Row(
          children: [
            SizedBox(
              width: 54,
              height: 54,
              child: Material(
                color: colors.onSurface.withValues(alpha: 0.05),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: BorderSide(
                    color: colors.onSurface.withValues(alpha: 0.10),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  key: const Key('booking-story-save'),
                  onTap: busy ? null : onSave,
                  child: Semantics(
                    button: true,
                    label: 'Salvar imagem',
                    child: Icon(
                      Icons.download_rounded,
                      size: 20,
                      color: colors.onSurface,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: SizedBox(
                height: 54,
                child: FilledButton(
                  key: const Key('booking-story-post'),
                  onPressed: busy ? null : onPost,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: const Color(0xFF0A0A0A),
                    disabledBackgroundColor: AppColors.brand.withValues(
                      alpha: 0.5,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Color(0xFF0A0A0A),
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Postar no story',
                              style: AppTypography.soraRegular(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.arrow_forward_rounded, size: 18),
                          ],
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PhotoPill extends StatelessWidget {
  const _PhotoPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 30,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: const Color(0xB3050505),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.photo_camera_outlined,
            size: 14,
            color: AppColors.onSurface,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.soraRegular(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.onSurface,
            ),
          ),
        ],
      ),
    );
  }
}

class _ThemeTile extends StatelessWidget {
  const _ThemeTile({
    required this.theme,
    required this.photo,
    required this.selected,
    required this.onTap,
  });

  final BookingStoryTheme theme;
  final Uint8List? photo;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final addPhoto = theme == BookingStoryTheme.photo && photo == null;
    return GestureDetector(
      key: Key('booking-story-theme-${theme.name}'),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Column(
        children: [
          Container(
            height: 52,
            foregroundDecoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: selected
                  ? Border.all(color: AppColors.brand, width: 2)
                  : Border.all(
                      color: colors.onSurface.withValues(alpha: 0.10),
                    ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  BookingStoryBackground(theme: theme, photo: photo),
                  if (addPhoto)
                    const Icon(
                      Icons.add_rounded,
                      size: 20,
                      color: AppColors.onSurface,
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            theme.label,
            style: AppTypography.soraRegular(
              fontSize: 11.5,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color: selected
                  ? colors.onSurface
                  : colors.onSurface.withValues(alpha: 0.62),
            ),
          ),
        ],
      ),
    );
  }
}
