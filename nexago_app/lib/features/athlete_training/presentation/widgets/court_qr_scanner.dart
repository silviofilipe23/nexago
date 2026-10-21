import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../professor_links/presentation/widgets/professor_links_ui.dart';

/// Abre a câmera e devolve o texto do primeiro QR lido (`null` se o aluno
/// voltou). Provider para os testes de widget trocarem a câmera por um valor.
typedef CourtQrScanLauncher = Future<String?> Function(BuildContext context);

final courtQrScanLauncherProvider = Provider<CourtQrScanLauncher>(
  (ref) => (context) => Navigator.of(context).push<String>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => const CourtQrScannerPage(),
        ),
      ),
);

/// Leitor do QR da quadra (T5 do check-in): câmera em tela cheia com a moldura
/// no centro. Fecha sozinho no primeiro QR — a validação é do servidor.
class CourtQrScannerPage extends StatefulWidget {
  const CourtQrScannerPage({super.key});

  @override
  State<CourtQrScannerPage> createState() => _CourtQrScannerPageState();
}

class _CourtQrScannerPageState extends State<CourtQrScannerPage> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_done) return;
    for (final code in capture.barcodes) {
      final value = code.rawValue;
      if (value == null || value.isEmpty) continue;
      _done = true;
      Navigator.of(context).pop(value);
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) => _ScannerError(error: error),
          ),
          const IgnorePointer(child: _Frame()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
              child: Row(
                children: [
                  IconButton(
                    key: const Key('court-qr-close'),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                    tooltip: 'Fechar',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  ValueListenableBuilder(
                    valueListenable: _controller,
                    builder: (context, state, _) => state.torchState ==
                            TorchState.unavailable
                        ? const SizedBox.shrink()
                        : IconButton(
                            icon: Icon(
                              state.torchState == TorchState.on
                                  ? Icons.flash_on_rounded
                                  : Icons.flash_off_rounded,
                              color: Colors.white,
                            ),
                            tooltip: 'Lanterna',
                            onPressed: _controller.toggleTorch,
                          ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Frame extends StatelessWidget {
  const _Frame();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 240,
          height: 240,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.brand, width: 3),
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Aponte para o QR da quadra',
          textAlign: TextAlign.center,
          style: ProfessorLinksStyle.display(16, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          'Fica com a recepção ou na própria quadra.',
          textAlign: TextAlign.center,
          style: AppTypography.bodyS.copyWith(color: Colors.white70),
        ),
      ],
    );
  }
}

class _ScannerError extends StatelessWidget {
  const _ScannerError({required this.error});

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            denied
                ? 'Libere a câmera para o nexaGO nos ajustes do aparelho e '
                    'tente de novo.'
                : 'Não foi possível abrir a câmera agora.',
            textAlign: TextAlign.center,
            style: AppTypography.bodyS.copyWith(color: Colors.white),
          ),
        ),
      ),
    );
  }
}
