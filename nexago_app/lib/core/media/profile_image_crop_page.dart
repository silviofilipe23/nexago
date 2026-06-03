import 'dart:typed_data';

import 'package:crop_your_image/crop_your_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'profile_image_crop_config.dart';
import 'profile_image_post_process.dart';

/// Editor de recorte (pan/zoom) estilo Instagram para avatar ou capa.
class ProfileImageCropPage extends StatefulWidget {
  const ProfileImageCropPage({
    super.key,
    required this.imageBytes,
    required this.target,
  });

  final Uint8List imageBytes;
  final ProfileImageCropTarget target;

  @override
  State<ProfileImageCropPage> createState() => _ProfileImageCropPageState();
}

class _ProfileImageCropPageState extends State<ProfileImageCropPage> {
  final _cropController = CropController();
  bool _cropping = false;
  bool _ready = false;

  void _onConfirm() {
    if (!_ready || _cropping) return;
    setState(() => _cropping = true);
    if (widget.target.useCircleCrop) {
      _cropController.cropCircle();
    } else {
      _cropController.crop();
    }
  }

  void _onCropped(CropResult result) {
    if (!mounted) return;
    setState(() => _cropping = false);

    switch (result) {
      case CropSuccess(:final croppedImage):
        final processed = postProcessCroppedImage(
          croppedBytes: croppedImage,
          target: widget.target,
        );
        Navigator.of(context).pop(processed);
      case CropFailure(:final cause):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Não foi possível recortar: $cause')),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final target = widget.target;

    return PopScope(
      canPop: !_cropping,
      child: Scaffold(
        backgroundColor: context.themeColors.canvas,
        appBar: AppBar(
          backgroundColor: context.themeColors.canvas,
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
          leading: TextButton(
            onPressed: _cropping ? null : () => Navigator.of(context).pop(),
            child: Text(
              'Cancelar',
              style: theme.textTheme.labelLarge?.copyWith(
                color: context.themeColors.onSurface,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          leadingWidth: 88,
          title: Text(
            target.title,
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              color: context.themeColors.onSurface,
            ),
          ),
        ),
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'Pinça para zoom · arraste para posicionar',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                  ),
                ),
              ),
              SizedBox(height: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Crop(
                    image: widget.imageBytes,
                    controller: _cropController,
                    onCropped: _onCropped,
                    aspectRatio: target.aspectRatio,
                    withCircleUi: target.withCircleUi,
                    interactive: true,
                    fixCropRect: true,
                    baseColor: context.themeColors.canvas,
                    maskColor: Colors.black.withValues(alpha: 0.65),
                    radius: target.withCircleUi ? 0 : 4,
                    onStatusChanged: (status) {
                      if (status == CropStatus.ready && mounted) {
                        setState(() => _ready = true);
                      }
                    },
                    progressIndicator: Center(
                      child: CircularProgressIndicator(
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                child: FilledButton(
                  onPressed: _ready && !_cropping ? _onConfirm : null,
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.brand,
                    foregroundColor: context.themeColors.canvas,
                    disabledBackgroundColor:
                        AppColors.brand.withValues(alpha: 0.4),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _cropping
                      ? SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: context.themeColors.canvas,
                          ),
                        )
                      : Text(
                          'Concluir',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
