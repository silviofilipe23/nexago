import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../../core/theme/app_colors.dart';

class BookingPixQrCard extends StatefulWidget {
  const BookingPixQrCard({
    super.key,
    required this.base64,
    required this.payload,
  });

  final String base64;
  final String payload;

  @override
  State<BookingPixQrCard> createState() => _BookingPixQrCardState();
}

class _BookingPixQrCardState extends State<BookingPixQrCard> {
  Widget? _cachedQr;

  @override
  void initState() {
    super.initState();
    _cachedQr = _buildQr(widget.base64, widget.payload);
  }

  @override
  void didUpdateWidget(covariant BookingPixQrCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.base64 != widget.base64 ||
        oldWidget.payload != widget.payload) {
      _cachedQr = _buildQr(widget.base64, widget.payload);
    }
  }

  static Widget _buildQr(String base64, String payload) {
    if (base64.isNotEmpty) {
      try {
        final bytes = base64Decode(base64);
        return Image.memory(bytes, fit: BoxFit.contain, gaplessPlayback: true);
      } catch (_) {}
    }
    if (payload.trim().length > 20) {
      return QrImageView(
        data: payload.trim(),
        backgroundColor: Colors.white,
        eyeStyle: const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color: Colors.black,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color: Colors.black,
        ),
      );
    }
    return const Center(
      child: Icon(Icons.qr_code_2_rounded, size: 120, color: Colors.black26),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Positioned.fill(child: _cachedQr ?? const SizedBox.shrink()),
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.brand,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Center(
                child: Text(
                  'N',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        color: AppColors.black,
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
