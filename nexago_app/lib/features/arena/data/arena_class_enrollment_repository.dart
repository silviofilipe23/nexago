import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/aulas/arena_class_enrollment.dart';
import '../domain/aulas/arena_class_session.dart';
import 'arena_class_repository.dart';

/// Prévia da primeira cobrança (`previewArenaClassEnrollment`).
class ArenaClassEnrollmentPreview {
  const ArenaClassEnrollmentPreview({
    required this.charges,
    required this.totalReais,
    required this.enrollmentFeeReais,
  });

  final List<({String description, double amountReais, String dueDate})>
      charges;
  final double totalReais;

  /// Taxa da regra da arena (mostrada mesmo quando dispensada).
  final double enrollmentFeeReais;

  factory ArenaClassEnrollmentPreview.fromMap(Map<String, dynamic> map) {
    final raw = map['charges'];
    return ArenaClassEnrollmentPreview(
      charges: [
        if (raw is List)
          for (final c in raw)
            if (c is Map)
              (
                description: (c['description'] as String?) ?? 'Cobrança',
                amountReais: (c['amountReais'] as num?)?.toDouble() ?? 0,
                dueDate: (c['dueDate'] as String?) ?? '',
              ),
      ],
      totalReais: (map['totalReais'] as num?)?.toDouble() ?? 0,
      enrollmentFeeReais: (map['enrollmentFeeReais'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// Resultado de `createArenaClassEnrollment`.
class ArenaClassEnrollmentCreated {
  const ArenaClassEnrollmentCreated({
    required this.enrollmentId,
    required this.studentId,
    required this.chargeIds,
    this.asaasGroupId,
    this.phone,
  });

  final String enrollmentId;
  final String studentId;
  final List<String> chargeIds;

  /// Grupo da 1ª fatura online (`null` = cobrança manual ou nada a cobrar).
  /// O link chega depois, no espelho `asaas` das mensalidades.
  final String? asaasGroupId;

  /// Telefone gravado na matrícula: o do cadastro do atleta quando o campo
  /// foi em branco. `null` em servidor anterior ao campo — vale o digitado.
  final String? phone;
}

/// Pedido de matrícula — o mesmo payload vale para a prévia e para gravar.
class ArenaClassEnrollmentRequest {
  const ArenaClassEnrollmentRequest({
    required this.arenaId,
    required this.planId,
    required this.slots,
    required this.dueDay,
    required this.paymentMethod,
    this.billingMode = ArenaClassBillingMode.manual,
    this.cpfCnpj,
    this.waiveFee = false,
    this.athleteId,
    this.studentId,
    this.name,
    this.phone,
  });

  final String arenaId;
  final String planId;
  final List<ArenaClassEnrollmentSlot> slots;
  final int dueDay;
  final ArenaClassPaymentMethod paymentMethod;

  /// `asaas` = mensalidade online (o backend exige a regra ligada e CPF).
  final ArenaClassBillingMode billingMode;

  /// CPF/CNPJ de quem paga, normalizado. Fica no servidor (perfil de
  /// cobrança), nunca no cadastro do atleta. Omitido = o servidor usa o já
  /// salvo ou o do cadastro NexaGO.
  final String? cpfCnpj;
  final bool waiveFee;

  /// Atleta NexaGO (o backend resolve nome e foto).
  final String? athleteId;

  /// Aluno sem conta que já existe na turma (reaproveita o doc).
  final String? studentId;
  final String? name;
  final String? phone;

  Map<String, Object> toPayload() {
    final trimmedName = name?.trim() ?? '';
    final trimmedPhone = phone?.trim() ?? '';
    return {
      'arenaId': arenaId,
      'planId': planId,
      'slots': [for (final s in slots) s.toPayload()],
      'dueDay': dueDay,
      'paymentMethod': paymentMethod.id,
      'billingMode': billingMode.id,
      if (cpfCnpj != null) 'cpfCnpj': cpfCnpj!,
      'waiveFee': waiveFee,
      if (athleteId != null) 'athleteId': athleteId!,
      if (studentId != null) 'studentId': studentId!,
      if (trimmedName.isNotEmpty) 'name': trimmedName,
      if (trimmedPhone.isNotEmpty) 'phone': trimmedPhone,
    };
  }
}

/// Aulas fase 2 (lado arena): planos, regras, matrículas, mensalidades e
/// créditos de reposição. Leitura direta do Firestore e escrita via callables
/// — na cobrança manual nada passa pela plataforma; na online, a fatura e a
/// baixa são do servidor (o app só lê o espelho).
///
/// Toda query de coleção raiz filtra `arenaId`: a rule lê
/// `resource.data.arenaId` para checar a área (`agenda`, e `financeiro` em
/// matrícula e mensalidade). Sem o filtro a query inteira é negada.
class ArenaClassEnrollmentRepository {
  ArenaClassEnrollmentRepository(
    this._firestore, {
    FirebaseFunctions? functions,
  }) : _functions = functions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions? _functions;

  FirebaseFunctions get _callables => _functions ?? nexagoFunctions;

  static const String enrollmentsCollection = 'arenaClassEnrollments';
  static const String chargesCollection = 'arenaClassCharges';
  static const String creditsCollection = 'arenaClassCredits';

  CollectionReference<Map<String, dynamic>> _arenaSub(
    String arenaId,
    String name,
  ) =>
      _firestore.collection('arenas').doc(arenaId).collection(name);

  /// Planos da arena (todas as situações).
  Stream<List<ArenaClassPlan>> watchPlans(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _arenaSub(id, 'classPlans').snapshots().map(
          (snap) => snap.docs.map(ArenaClassPlan.fromFirestore).toList(),
        );
  }

  /// Regras da arena; doc ausente = padrão.
  Stream<ArenaClassRules> watchRules(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(ArenaClassRules.defaults);
    return _arenaSub(id, 'classSettings')
        .doc('rules')
        .snapshots()
        .map((doc) => ArenaClassRules.fromMap(doc.data()));
  }

  /// Matrículas da arena (todas as situações).
  Stream<List<ArenaClassEnrollment>> watchEnrollments(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(enrollmentsCollection)
        .where('arenaId', isEqualTo: id)
        .snapshots()
        .map((snap) =>
            snap.docs.map(ArenaClassEnrollment.fromFirestore).toList());
  }

  /// Matrículas de um aluno (igualdades: dispensa índice composto).
  Stream<List<ArenaClassEnrollment>> watchStudentEnrollments({
    required String arenaId,
    required String studentId,
  }) {
    final arena = arenaId.trim();
    final student = studentId.trim();
    if (arena.isEmpty || student.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(enrollmentsCollection)
        .where('arenaId', isEqualTo: arena)
        .where('studentId', isEqualTo: student)
        .snapshots()
        .map((snap) =>
            snap.docs.map(ArenaClassEnrollment.fromFirestore).toList());
  }

  /// Cobranças em aberto da arena (índice `arenaId, status`).
  Stream<List<ArenaClassCharge>> watchOpenCharges(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(chargesCollection)
        .where('arenaId', isEqualTo: id)
        .where('status', isEqualTo: 'open')
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassCharge.fromFirestore).toList());
  }

  /// Cobranças pagas a partir de [fromKey] (índice `arenaId, status, paidOn`).
  Stream<List<ArenaClassCharge>> watchPaidChargesSince(
    String arenaId,
    String fromKey,
  ) {
    final id = arenaId.trim();
    if (id.isEmpty || fromKey.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(chargesCollection)
        .where('arenaId', isEqualTo: id)
        .where('status', isEqualTo: 'paid')
        .where('paidOn', isGreaterThanOrEqualTo: fromKey)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassCharge.fromFirestore).toList());
  }

  /// Cobranças de um aluno (índice `arenaId, studentId`).
  Stream<List<ArenaClassCharge>> watchStudentCharges({
    required String arenaId,
    required String studentId,
  }) {
    final arena = arenaId.trim();
    final student = studentId.trim();
    if (arena.isEmpty || student.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(chargesCollection)
        .where('arenaId', isEqualTo: arena)
        .where('studentId', isEqualTo: student)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassCharge.fromFirestore).toList());
  }

  /// Créditos de reposição disponíveis da arena (índice `arenaId, status`).
  Stream<List<ArenaClassCredit>> watchAvailableCredits(String arenaId) {
    final id = arenaId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(creditsCollection)
        .where('arenaId', isEqualTo: id)
        .where('status', isEqualTo: 'available')
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassCredit.fromFirestore).toList());
  }

  /// Créditos de um aluno, todas as situações (índice `arenaId, studentId`).
  Stream<List<ArenaClassCredit>> watchStudentCredits({
    required String arenaId,
    required String studentId,
  }) {
    final arena = arenaId.trim();
    final student = studentId.trim();
    if (arena.isEmpty || student.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(creditsCollection)
        .where('arenaId', isEqualTo: arena)
        .where('studentId', isEqualTo: student)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassCredit.fromFirestore).toList());
  }

  /// Aulas de uma turma a partir de [fromKey] (índice `arenaId, classId,
  /// date`) — histórico de frequência do aluno.
  Stream<List<ArenaClassSession>> watchClassSessionsSince({
    required String arenaId,
    required String classId,
    required String fromKey,
  }) {
    final arena = arenaId.trim();
    final cls = classId.trim();
    if (arena.isEmpty || cls.isEmpty || fromKey.isEmpty) {
      return Stream.value(const []);
    }
    return _firestore
        .collection(ArenaClassRepository.sessionsCollection)
        .where('arenaId', isEqualTo: arena)
        .where('classId', isEqualTo: cls)
        .where('date', isGreaterThanOrEqualTo: fromKey)
        .snapshots()
        .map((snap) => snap.docs.map(ArenaClassSession.fromFirestore).toList());
  }

  /// Confere horários e vagas e calcula a primeira cobrança, sem gravar.
  Future<ArenaClassEnrollmentPreview> previewEnrollment(
    ArenaClassEnrollmentRequest request,
  ) async {
    final map = await _call('previewArenaClassEnrollment', request.toPayload());
    return ArenaClassEnrollmentPreview.fromMap(map);
  }

  /// Matricula: aluno nas turmas (vaga conferida por dia) + primeiras cobranças.
  Future<ArenaClassEnrollmentCreated> createEnrollment(
    ArenaClassEnrollmentRequest request,
  ) async {
    final map = await _call('createArenaClassEnrollment', request.toPayload());
    final ids = map['chargeIds'];
    final groupId = map['asaasGroupId'];
    final phone = map['phone'];
    return ArenaClassEnrollmentCreated(
      enrollmentId: (map['enrollmentId'] as String?) ?? '',
      studentId: (map['studentId'] as String?) ?? '',
      chargeIds: [
        if (ids is List)
          for (final id in ids)
            if (id is String) id,
      ],
      asaasGroupId: groupId is String && groupId.isNotEmpty ? groupId : null,
      phone: phone is String && phone.trim().isNotEmpty ? phone.trim() : null,
    );
  }

  /// Telefone do cadastro do atleta NexaGO (`users.phoneNumber`, texto livre)
  /// para pré-preencher a matrícula; `null` = cadastro sem telefone.
  Future<String?> fetchAthleteContactPhone({
    required String arenaId,
    required String athleteId,
  }) async {
    final map = await _call('getArenaClassAthleteContact', {
      'arenaId': arenaId,
      'athleteId': athleteId,
    });
    final phone = map['phone'];
    return phone is String && phone.trim().isNotEmpty ? phone.trim() : null;
  }

  /// Pausar (`paused`), reativar (`active`) ou cancelar (`canceled`).
  /// Devolve quantas cobranças futuras foram canceladas.
  Future<int> setEnrollmentStatus({
    required String enrollmentId,
    required String status,
  }) async {
    final map = await _call('setArenaClassEnrollmentStatus', {
      'enrollmentId': enrollmentId,
      'status': status,
    });
    return (map['canceledCharges'] as num?)?.toInt() ?? 0;
  }

  /// Registra o pagamento recebido direto pela arena. Em mensalidade online,
  /// o servidor também anula a fatura (o link deixa de valer).
  Future<void> markChargePaid({
    required String chargeId,
    required ArenaClassPaymentMethod method,
  }) async {
    await _call('setArenaClassChargeStatus', {
      'chargeId': chargeId,
      'status': 'paid',
      'paymentMethod': method.id,
    });
  }

  Future<Map<String, dynamic>> _call(
    String name,
    Map<String, Object> payload,
  ) async {
    try {
      final result = await _callables.httpsCallable(name).call(payload);
      final data = result.data;
      return data is Map ? Map<String, dynamic>.from(data) : const {};
    } on FirebaseFunctionsException catch (e) {
      throw ArenaClassException(ArenaClassRepository.message(e), code: e.code);
    }
  }
}
