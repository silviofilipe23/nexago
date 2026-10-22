/**
 * Oferta automática da lista de espera do Centro de Treinamento.
 *
 * Abriu vaga na turma (cancelamento, conclusão, reserva vencida liberada pela varredura da
 * cobrança, capacidade aumentada) ou entrou alguém na fila de uma turma com vaga → oferece ao 1º da
 * fila, na MESMA transação que relê a turma: matrícula vira pendente com o contrato do dia e
 * `waitlistAcceptHours` (padrão 24h) para pagar, a vaga é ocupada e a cobrança é emitida. Se não
 * pagar, a varredura (`sweepTrainingCenterBilling`) libera a reserva, a vaga reabre e este gatilho
 * oferece ao próximo — a cadeia "o 1º tem 24h, depois passa ao próximo" do protótipo.
 *
 * A oferta manual do portal ("Oferecer vaga") continua existindo; as duas usam transação sobre
 * `seatsTaken`, então nunca oferecem a mesma vaga duas vezes.
 */
import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {Timestamp, getFirestore, type Firestore} from "firebase-admin/firestore";
import {deliverNotificationToUser, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_SUBJECT} from "./notification-delivery";
import {SYSTEM_ACTOR, TRAINING_CENTERS, brlFromCents} from "./training-center-billing-model";
import {firstInvoiceCents, readBilling} from "./training-center-subscription-model";
import {
  acceptHours,
  buildContract,
  classSeatInputChanged,
  dayKeyIn,
  invoiceReference,
  payerName,
  planOfferable,
  seatsToOffer,
  waitlistQueue,
} from "./training-center-waitlist-model";
import {CENTER_SEAT_OFFER_TYPE, seatOfferNotice} from "./training-center-notifications-model";
import {deliverCenterNotice} from "./training-center-notify";

export {CENTER_SEAT_OFFER_TYPE};

type Data = Record<string, unknown>;

export interface SeatOffer {
  enrollmentId: string;
  studentId: string;
  studentUid: string | null;
  className: string;
  centerName: string;
  priceCents: number;
  holdHours: number;
}

export interface WaitlistDeps {
  now: () => Date;
  notify: (input: {userId: string; title: string; body: string; type: string; data: Record<string, string>}) => Promise<void>;
}

export const defaultWaitlistDeps: WaitlistDeps = {
  now: () => new Date(),
  notify: async (input) => {
    await deliverNotificationToUser({...input, requireInteraction: false});
  },
};

/** Oferece as vagas livres da turma aos primeiros da fila. Devolve as ofertas feitas. */
export async function offerOpenSeats(db: Firestore, centerId: string, classId: string, now: Date): Promise<SeatOffer[]> {
  const centerRef = db.doc(`${TRAINING_CENTERS}/${centerId}`);
  const classRef = db.doc(`${TRAINING_CENTERS}/${centerId}/classes/${classId}`);
  return db.runTransaction(async (tx) => {
    const [cSnap, kSnap] = [await tx.get(centerRef), await tx.get(classRef)];
    const center = cSnap.data() as Data | undefined;
    const cls = kSnap.data() as Data | undefined;
    let free = seatsToOffer(center, cls);
    if (free <= 0 || !center || !cls) return [];

    const qSnap = await tx.get(db.collection(`${TRAINING_CENTERS}/${centerId}/enrollments`).where("classId", "==", classId));
    const queue = waitlistQueue(qSnap.docs.map((d) => ({id: d.id, data: d.data() as Data})), classId);
    if (queue.length === 0) return [];

    // Leituras (planos e alunos dos candidatos) antes de qualquer escrita.
    const candidates = queue.slice(0, Math.max(free, 0) + 5);
    const plans = new Map<string, Data | undefined>();
    for (const id of new Set(candidates.map((c) => c.planId).filter((x): x is string => !!x))) {
      plans.set(id, (await tx.get(db.doc(`${TRAINING_CENTERS}/${centerId}/plans/${id}`))).data() as Data | undefined);
    }
    const students = new Map<string, Data | undefined>();
    for (const c of candidates) {
      students.set(c.studentId, (await tx.get(db.doc(`${TRAINING_CENTERS}/${centerId}/students/${c.studentId}`))).data() as Data | undefined);
    }

    const tz = String(center["timezone"] ?? "America/Sao_Paulo");
    const day = dayKeyIn(now, tz);
    const holdHours = acceptHours(center);
    const policies = (center["policies"] ?? {}) as Data;
    const className = String(cls["name"] ?? "Turma");
    let taken = Number(cls["seatsTaken"] ?? 0);
    let roster = Array.isArray(cls["rosterStudentIds"]) ? (cls["rosterStudentIds"] as string[]) : [];
    const offers: SeatOffer[] = [];

    for (const entry of candidates) {
      if (free <= 0) break;
      const plan = entry.planId ? plans.get(entry.planId) : undefined;
      if (!planOfferable(plan)) {
        // Sem plano válido não dá para congelar contrato: a pessoa fica na fila e o gestor resolve.
        logger.warn("waitlist: plano indisponível, pulando", {centerId, classId, enrollmentId: entry.id, planId: entry.planId});
        continue;
      }
      const contract = buildContract(plan!, policies, day);
      const enrRef = db.doc(`${TRAINING_CENTERS}/${centerId}/enrollments/${entry.id}`);
      tx.update(enrRef, {
        status: "pending",
        contract,
        holdUntil: Timestamp.fromMillis(now.getTime() + holdHours * 3600_000),
        creditsLeft: contract["planType"] === "class_pack" ? contract["credits"] : null,
        offeredAt: Timestamp.fromDate(now),
        offeredBy: "auto",
      });
      taken += 1;
      roster = [...roster.filter((id) => id !== entry.studentId), entry.studentId];
      free -= 1;

      const student = students.get(entry.studentId);
      const reference = invoiceReference(contract, day);
      // Mensal com vencimento fixo: o 1º mês cobra só os dias até o 1º vencimento (política do centro).
      const first = contract["planType"] === "monthly" ?
        firstInvoiceCents(Number(contract["priceCents"] ?? 0), readBilling(center["billing"]), day) : null;
      const priceCents = first ? first.cents : Number(contract["priceCents"] ?? 0);
      tx.set(db.collection(`${TRAINING_CENTERS}/${centerId}/invoices`).doc(), {
        studentId: entry.studentId,
        enrollmentId: entry.id,
        payerName: payerName(student, "Aluno"),
        reference,
        amountCents: priceCents,
        dueDate: day,
        status: "pending",
        method: null,
        providerRef: "",
        // Mesmo formato do evento que o portal grava ao criar cobrança (`type: created`).
        events: [{
          at: Timestamp.fromDate(now),
          type: "created",
          title: "Cobrança criada",
          detail: `${brlFromCents(priceCents)} · ${reference}` +
            (first?.prorated ? ` · proporcional ${first.days}/${first.cycleDays} dias` : "") + " · vaga oferecida da lista de espera",
          byName: SYSTEM_ACTOR,
        }],
        approvedAt: null,
        refundedCents: 0,
        createdAt: Timestamp.fromDate(now),
      });
      tx.set(db.collection(`${TRAINING_CENTERS}/${centerId}/auditLogs`).doc(), {
        at: Timestamp.fromDate(now),
        actorUid: "system",
        actorName: SYSTEM_ACTOR,
        action: "enrollment.seat_offered",
        entity: "enrollment",
        entityId: entry.id,
        detail: `Vaga em ${className} oferecida automaticamente a ${String(student?.["name"] ?? "aluno")} · ${holdHours}h para pagar`,
        reason: "",
      });
      offers.push({
        enrollmentId: entry.id,
        studentId: entry.studentId,
        studentUid: typeof student?.["uid"] === "string" && student["uid"] ? (student["uid"] as string) : null,
        className,
        centerName: String(center["name"] ?? ""),
        priceCents,
        holdHours,
      });
    }
    if (offers.length) {
      tx.update(classRef, {seatsTaken: taken, rosterStudentIds: roster});
    }
    return offers;
  });
}

async function notifyOffers(db: Firestore, deps: WaitlistDeps, centerId: string, offers: SeatOffer[]): Promise<void> {
  for (const o of offers) {
    if (!o.studentUid) continue;
    try {
      const notice = seatOfferNotice(o.className, o.centerName, o.holdHours, brlFromCents(o.priceCents));
      await deliverCenterNotice(db, deps, {
        centerId, event: "seat_offered", uids: [o.studentUid], title: notice.title, body: notice.body,
        type: CENTER_SEAT_OFFER_TYPE, data: {centerId, enrollmentId: o.enrollmentId},
      });
    } catch (e) {
      logger.warn("waitlist: push da oferta falhou", {centerId, enrollmentId: o.enrollmentId, e});
    }
  }
}

export async function handleSeatChange(db: Firestore, deps: WaitlistDeps, centerId: string, classId: string): Promise<SeatOffer[]> {
  const offers = await offerOpenSeats(db, centerId, classId, deps.now());
  if (offers.length) {
    logger.info("waitlist: vagas oferecidas", {centerId, classId, n: offers.length});
    await notifyOffers(db, deps, centerId, offers);
  }
  return offers;
}

const PUSH_SECRETS = [WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT];

/** Vaga abriu (contador, capacidade ou turma reativada). */
export const onTrainingCenterClassSeatsWritten = onDocumentWritten({
  document: `${TRAINING_CENTERS}/{centerId}/classes/{classId}`,
  secrets: PUSH_SECRETS,
}, async (event) => {
  const before = event.data?.before?.data() as Data | undefined;
  const after = event.data?.after?.data() as Data | undefined;
  if (!classSeatInputChanged(before, after)) return;
  await handleSeatChange(getFirestore(), defaultWaitlistDeps, event.params.centerId, event.params.classId);
});

/** Alguém entrou na fila de uma turma que já tinha vaga (corrida com uma saída). */
export const onTrainingCenterWaitlistJoined = onDocumentWritten({
  document: `${TRAINING_CENTERS}/{centerId}/enrollments/{enrollmentId}`,
  secrets: PUSH_SECRETS,
}, async (event) => {
  const before = event.data?.before?.data() as Data | undefined;
  const after = event.data?.after?.data() as Data | undefined;
  if (after?.["status"] !== "waitlisted" || before?.["status"] === "waitlisted") return;
  const classId = typeof after["classId"] === "string" ? after["classId"] : "";
  if (!classId) return;
  await handleSeatChange(getFirestore(), defaultWaitlistDeps, event.params.centerId, classId);
});
