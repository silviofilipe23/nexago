import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/layout/nexa_app_bar.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/app_snackbar.dart';
import '../../../core/ui/nexa_share.dart';
import '../../athlete/domain/athlete_display_name.dart';
import '../../athlete/domain/athlete_profile_providers.dart';
import '../data/booking_story_photo_picker.dart';
import '../domain/arena_booking_success_args.dart';
import '../domain/booking_story.dart';
import '../domain/booking_story_providers.dart';
import 'widgets/booking_story/booking_story_card.dart';

/// Reservar · 11 — editor do story 9:16 depois da reserva confirmada: o atleta
/// escolhe o fundo (foto da galeria ou um tema) e o que aparece na arte, e
/// compartilha o PNG 1080×1920 pela folha nativa (Instagram → Story).
class BookingStoryPage extends ConsumerStatefulWidget {
  const BookingStoryPage({super.key, required this.args});

  final BookingSuccessArgs args;

  @override
  ConsumerState<BookingStoryPage> createState() => _BookingStoryPageState();
}

class _BookingStoryPageState extends ConsumerState<BookingStoryPage> {
  /// Prévia em 0,6× da base 360×640, como no protótipo.
  static const double _previewScale = 0.6;

  final _cardKey = GlobalKey();

  /// Brasa abre pronto para postar; "Foto" só entra com uma foto escolhida.
  BookingStoryTheme _theme = BookingStoryTheme.ember;
  Uint8List? _photo;

  /// Guarda o que foi DESLIGADO: informação que chega depois (o esporte vem do
  /// doc da reserva) nasce ligada.
  final Set<BookingStoryInfo> _hidden = {};
  bool _busy = false;

  Future<void> _pickPhoto() async {
    Uint8List? bytes;
    try {
      bytes = await ref.read(bookingStoryPhotoPickerProvider)();
    } on PlatformException {
      if (mounted) {
        showAppSnackBar(
          context,
          'Não foi possível carregar esta foto. Tente outra imagem.',
          isError: true,
        );
      }
      return;
    }
    if (!mounted || bytes == null) return;
    setState(() {
      _photo = bytes;
      _theme = BookingStoryTheme.photo;
    });
  }

  void _selectTheme(BookingStoryTheme theme) {
    if (theme == BookingStoryTheme.photo && _photo == null) {
      _pickPhoto();
      return;
    }
    setState(() => _theme = theme);
  }

  void _toggleInfo(BookingStoryInfo info) {
    setState(() {
      if (!_hidden.remove(info)) _hidden.add(info);
    });
  }

  Future<File?> _capture() async {
    final boundary = _cardKey.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary) return null;
    if (boundary.debugNeedsPaint) await WidgetsBinding.instance.endOfFrame;
    // A boundary mede 360×640 dentro do FittedBox da prévia: 3× = 1080×1920.
    final image = await boundary.toImage(pixelRatio: 3);
    try {
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) return null;
      final file = File(
        '${Directory.systemTemp.path}/nexago_reserva_${DateTime.now().millisecondsSinceEpoch}.png',
      );
      await file.writeAsBytes(bytes.buffer.asUint8List());
      return file;
    } finally {
      image.dispose();
    }
  }

  /// Sem [caption] é o "Salvar imagem": a folha nativa tem "Salvar imagem" /
  /// "Salvar na galeria" e nenhum texto vai junto.
  Future<void> _share({String? caption}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final file = await _capture();
      if (!mounted) return;
      if (file == null) {
        showAppSnackBar(
            context, 'Não foi possível gerar a imagem. Tente de novo.');
        return;
      }
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png', name: 'nexago_reserva.png')],
        text: caption,
        sharePositionOrigin: nexaSharePositionOrigin(context),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final args = widget.args;
    final profile = ref.watch(athleteProfileProvider).valueOrNull;
    final source = ref.watch(
      bookingStorySourceProvider(args.primaryBookingId ?? ''),
    );
    final data = bookingStoryDataFrom(
      arenaName: args.arenaName,
      courtName: args.courtName,
      dateKey: args.dateKey,
      startTime: args.startTime,
      endTime: args.endTime,
      sport: source?.sport,
      crew: bookingStoryCrew(
        ownerUid: profile?.id ?? source?.ownerUid,
        ownerName:
            profile == null ? null : athleteDisplayName(profile, fallback: ''),
        ownerAvatarUrl: profile?.avatarUrl,
        confirmed: source?.confirmed ?? const [],
      ),
    );
    final available = data.availableInfos;
    final infos = {
      for (final info in available)
        if (!_hidden.contains(info)) info,
    };
    final photoPill = _theme == BookingStoryTheme.photo || _photo == null;

    return Scaffold(
      backgroundColor: colors.canvas,
      appBar: NexaAppBar(
        backgroundColor: colors.canvas,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        title: Text(
          'Postar no story',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: colors.onSurface,
              ),
        ),
      ),
      bottomNavigationBar: SafeArea(
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
                    onTap: _busy ? null : () => _share(),
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
                    onPressed: _busy
                        ? null
                        : () => _share(caption: bookingStoryShareText(data)),
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
                    child: _busy
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
      ),
      body: ListView(
        padding: const EdgeInsets.only(top: 4, bottom: 16),
        children: [
          Center(
            child: GestureDetector(
              onTap: photoPill ? _pickPhoto : null,
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
                        size: BookingStoryCard.size * _previewScale,
                        child: FittedBox(
                          child: RepaintBoundary(
                            key: _cardKey,
                            child: BookingStoryCard(
                              data: data,
                              theme: _theme,
                              infos: infos,
                              photo: _photo,
                            ),
                          ),
                        ),
                      ),
                      if (photoPill)
                        Positioned(
                          top: 12,
                          right: 12,
                          child: _PhotoPill(
                            label: _photo == null
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
          const _SectionLabel('Fundo'),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
            child: Row(
              children: [
                for (final theme in BookingStoryTheme.values) ...[
                  if (theme != BookingStoryTheme.values.first)
                    const SizedBox(width: 10),
                  Expanded(
                    child: _ThemeTile(
                      theme: theme,
                      photo: _photo,
                      selected: theme == _theme,
                      onTap: () => _selectTheme(theme),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const _SectionLabel('Informações no story'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final info in available)
                  _InfoChip(
                    info: info,
                    selected: infos.contains(info),
                    onTap: () => _toggleInfo(info),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      child: Text(
        text.toUpperCase(),
        style: AppTypography.mono(
          fontSize: 10,
          letterSpacing: 1.4,
          color: context.themeColors.onSurface.withValues(alpha: 0.55),
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

class _InfoChip extends StatelessWidget {
  const _InfoChip({
    required this.info,
    required this.selected,
    required this.onTap,
  });

  final BookingStoryInfo info;
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
        key: Key('booking-story-info-${info.name}'),
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
                info.label,
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
