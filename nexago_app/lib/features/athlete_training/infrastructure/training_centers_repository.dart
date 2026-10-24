import 'dart:typed_data';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/center_enrollment_request.dart';
import '../domain/training_center.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// Centros de treinamento do aluno, pelas callables do aluno (as coleções do
/// centro são só da equipe — o servidor monta a visão e age em nome do
/// próprio aluno): `getMyTrainingCenters`, `respondTrainingCenterSession`,
/// `answerTrainingCenterInvite`, `getMyTrainingCenterInvoicePix`,
/// `checkMyTrainingCenterInvoice` e os contratos
/// (`openMyTrainingCenterContract`, `signMyTrainingCenterContract`) e os
/// pedidos de trancar/pausa por lesão/cancelar
/// (`requestTrainingCenterEnrollmentChange`,
/// `withdrawTrainingCenterEnrollmentRequest`,
/// `submitTrainingCenterMedicalClearance`; atestado e alta no Storage).
class TrainingCentersRepository {
  TrainingCentersRepository({
    FirebaseFunctions? functions,
    FirebaseStorage? storage,
  }) : _functions = functions ?? nexagoFunctions,
       _storageOverride = storage;

  final FirebaseFunctions _functions;
  final FirebaseStorage? _storageOverride;

  FirebaseStorage get _storage => _storageOverride ?? FirebaseStorage.instance;

  Future<Object?> _call(
    String name,
    Map<String, Object?> data,
    String fallback,
  ) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(data);
      return result.data;
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(e.code, e.message, fallback),
        code: e.code,
      );
    }
  }

  Future<MyTrainingCentersData> fetch() async =>
      MyTrainingCentersData.fromResponse(
        await _call(
          'getMyTrainingCenters',
          const {},
          'Não foi possível carregar seus centros de treinamento.',
        ),
      );

  /// "Vou" / "Não vou". Devolve se o aviso virou falta justificada (dentro
  /// do prazo do centro).
  Future<bool> respond({
    required String centerId,
    required String sessionId,
    required bool going,
  }) async {
    final raw = await _call('respondTrainingCenterSession', {
      'centerId': centerId,
      'sessionId': sessionId,
      'response': going ? 'going' : 'not_going',
    }, 'Não foi possível enviar sua resposta. Tente de novo.');
    return raw is Map && raw['excused'] == true;
  }

  Future<void> answerInvite({
    required String centerId,
    required String studentId,
    required bool accept,
  }) => _call('answerTrainingCenterInvite', {
    'centerId': centerId,
    'studentId': studentId,
    'accept': accept,
  }, 'Não foi possível responder ao convite. Tente de novo.');

  Future<CenterInvoicePix> invoicePix({
    required String centerId,
    required String invoiceId,
  }) async {
    final raw = await _call('getMyTrainingCenterInvoicePix', {
      'centerId': centerId,
      'invoiceId': invoiceId,
    }, 'Não foi possível gerar o Pix agora. Tente de novo.');
    return raw is Map
        ? CenterInvoicePix.fromMap(raw.map((k, v) => MapEntry('$k', v)))
        : const CenterInvoicePix(status: 'pending');
  }

  /// "Tenho um código": entra no centro pelo código de entrada. Devolve o
  /// centro e se já era aluno.
  Future<({String centerId, String centerName, bool already})> joinByCode(
    String code,
  ) async {
    final raw = await _call('joinTrainingCenterByCode', {
      'code': code,
    }, 'Não foi possível entrar com este código. Tente de novo.');
    final m = raw is Map ? raw : const {};
    return (
      centerId: '${m['centerId'] ?? ''}',
      centerName: '${m['centerName'] ?? 'Centro de treinamento'}',
      already: m['already'] == true,
    );
  }

  /// Marca o contrato como aberto (K7). Devolve o status atual.
  Future<String> openContract({
    required String centerId,
    required String contractId,
  }) async {
    final raw = await _call('openMyTrainingCenterContract', {
      'centerId': centerId,
      'contractId': contractId,
    }, 'Não foi possível abrir o contrato agora.');
    return raw is Map && raw['status'] is String
        ? raw['status'] as String
        : 'viewed';
  }

  /// Assina (ou recusa, só no termo opcional) o contrato com o [sha256] do
  /// texto lido (K8). O servidor grava IP e user-agent.
  Future<CenterContractSignResult> signContract({
    required String centerId,
    required String contractId,
    required bool accept,
    required String sha256,
    required int readSeconds,
    required String platform,
    required String appVersion,
  }) async {
    final raw = await _call('signMyTrainingCenterContract', {
      'centerId': centerId,
      'contractId': contractId,
      'decision': accept ? 'accept' : 'decline',
      'agreed': true,
      'sha256': sha256,
      'readSeconds': readSeconds,
      'platform': platform,
      'appVersion': appVersion,
    }, 'Não foi possível assinar agora. Tente de novo.');
    final m = raw is Map ? raw : const {};
    return (
      status: m['status'] is String
          ? m['status'] as String
          : (accept ? 'signed' : 'declined'),
      number: '${m['number'] ?? ''}',
      signedAt: DateTime.tryParse('${m['signedAt'] ?? ''}'),
    );
  }

  /// "Já paguei · verificar": consulta o provedor; devolve o status da fatura.
  Future<String> checkInvoice({
    required String centerId,
    required String invoiceId,
  }) async {
    final raw = await _call('checkMyTrainingCenterInvoice', {
      'centerId': centerId,
      'invoiceId': invoiceId,
    }, 'Não foi possível verificar agora. Tente de novo.');
    return raw is Map && raw['status'] is String
        ? raw['status'] as String
        : 'pending';
  }

  /// Trancar (`pause`), pausa por lesão (`injury`) ou cancelar (`cancel`).
  /// Regra violada volta como [ClassPresenceException] com a mensagem pronta
  /// do servidor (`failed-precondition`). No cancelamento, [retainPlanId]
  /// (troca de plano) ou [retainDiscount] (desconto de 1 mês) seguram o aluno
  /// e o pedido volta `retained`.
  Future<CenterRequestResult> requestEnrollmentChange({
    required String centerId,
    required String enrollmentId,
    required String type,
    String? startsOn,
    int? days,
    String reason = '',
    String comment = '',
    CenterCertificateUpload? certificate,
    List<String> retentionOffered = const [],
    String? retainPlanId,
    bool retainDiscount = false,
  }) async {
    final raw = await _call('requestTrainingCenterEnrollmentChange', {
      'centerId': centerId,
      'enrollmentId': enrollmentId,
      'type': type,
      'startsOn': ?startsOn,
      'days': ?days,
      'reason': reason,
      'comment': comment,
      if (certificate != null) 'certificate': certificate.toMap(),
      'retentionOffered': retentionOffered,
      'retainPlanId': ?retainPlanId,
      if (retainDiscount) 'retainDiscount': true,
    }, 'Não foi possível enviar o pedido. Tente de novo.');
    final m = raw is Map ? raw : const {};
    String? s(String k) => m[k] is String && (m[k] as String).isNotEmpty
        ? m[k] as String
        : null;
    return (
      requestId: s('requestId') ?? '',
      status: s('status') ?? 'pending',
      startsOn: s('startsOn'),
      endsOn: s('endsOn'),
      lastDay: s('lastDay'),
    );
  }

  /// Desistir do pedido (cancelamento em aviso, pausa ainda não começada ou
  /// atestado em análise).
  Future<void> withdrawEnrollmentRequest({
    required String centerId,
    required String requestId,
  }) => _call('withdrawTrainingCenterEnrollmentRequest', {
    'centerId': centerId,
    'requestId': requestId,
  }, 'Não foi possível desfazer o pedido. Tente de novo.');

  /// Alta médica da pausa por lesão em curso (o arquivo já no Storage, no
  /// mesmo lugar do atestado). Devolve a situação nova (`submitted`).
  Future<String> submitMedicalClearance({
    required String centerId,
    required String requestId,
    required CenterCertificateUpload clearance,
  }) async {
    final raw = await _call('submitTrainingCenterMedicalClearance', {
      'centerId': centerId,
      'requestId': requestId,
      'clearance': clearance.toMap()..remove('daysOff'),
    }, 'Não foi possível enviar a alta. Tente de novo.');
    final m = raw is Map ? raw : const {};
    final status = m['clearanceStatus'];
    return status is String && status.isNotEmpty ? status : 'submitted';
  }

  /// Sobe o atestado (ou a alta médica) em `trainingCenterCertificates/{centerId}/{uid}/…`
  /// (a rule só deixa o próprio aluno criar, sem sobrescrever). Devolve o
  /// caminho para mandar no pedido.
  Future<String> uploadCertificate({
    required String centerId,
    required String uid,
    required Uint8List bytes,
    required String fileName,
    required String contentType,
  }) async {
    final path =
        'trainingCenterCertificates/$centerId/$uid/'
        '${DateTime.now().millisecondsSinceEpoch}-'
        '${centerCertificateFileSlug(fileName)}';
    try {
      await _storage
          .ref(path)
          .putData(bytes, SettableMetadata(contentType: contentType))
          .timeout(const Duration(minutes: 2));
      return path;
    } catch (_) {
      throw const ClassPresenceException(
        'Não foi possível enviar o atestado. Confira a conexão e tente de '
        'novo.',
      );
    }
  }
}

/// Resposta de `requestTrainingCenterEnrollmentChange`.
typedef CenterRequestResult = ({
  String requestId,
  String status,
  String? startsOn,
  String? endsOn,
  String? lastDay,
});

/// Atestado (ou alta médica, que ignora `daysOff`) já no Storage, como o
/// pedido manda.
class CenterCertificateUpload {
  const CenterCertificateUpload({
    required this.path,
    required this.fileName,
    required this.contentType,
    required this.sizeBytes,
    required this.issuedOn,
    required this.daysOff,
    this.doctor = '',
    this.description = '',
  });

  final String path;
  final String fileName;
  final String contentType;
  final int sizeBytes;

  /// `YYYY-MM-DD`.
  final String issuedOn;
  final int daysOff;
  final String doctor;
  final String description;

  Map<String, Object?> toMap() => {
    'path': path,
    'fileName': fileName,
    'contentType': contentType,
    'sizeBytes': sizeBytes,
    'issuedOn': issuedOn,
    'daysOff': daysOff,
    'doctor': doctor,
    'description': description,
  };
}

/// Resposta de `signMyTrainingCenterContract`.
typedef CenterContractSignResult = ({
  String status,
  String number,
  DateTime? signedAt,
});

final trainingCentersRepositoryProvider = Provider<TrainingCentersRepository>(
  (ref) => TrainingCentersRepository(),
);
