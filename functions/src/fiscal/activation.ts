/**
 * Ativação real: a arena emite uma nota de verdade em homologação usando o
 * próprio cadastro. Autorizada promove `status` para `active`; rejeitada vira
 * `error` com o motivo. O mesmo pedido serve de "reemitir" quando a nota de
 * teste já existe e falhou — não cria uma segunda, reprocessa a mesma.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {
  createInvoiceRequest,
  invoiceIdFor,
  readArenaFiscalConfig,
  type CreateInvoiceRequestInput,
} from "./invoice-repository";
import {buildIdempotencyKey} from "./invoice-emitter";
import {reprocessFiscalInvoice} from "./invoice-retry";
import {assertManagesArena} from "./arena-fiscal-config";
import {buildDefaultIssuer} from "./focus-nfe-client";
import {readIssuerTokenFromSecretManager, type ReadIssuerToken} from "./invoice-processor";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice, FiscalInvoiceStatus} from "./types";

/** Tomador sintético — sem cliente real, sem consequência fiscal fora de homologação. */
const ACTIVATION_TOMADOR = {
  nome: "Cliente de Teste NexaGO",
  cpfCnpj: "39053344705",
};
const ACTIVATION_VALOR_REAIS = 1;

export interface EmitActivationTestInvoiceInput {
  arenaId: string;
  callerUid: string;
}

export async function emitActivationTestInvoiceCore(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  input: EmitActivationTestInvoiceInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);

  const config = await readArenaFiscalConfig(db, input.arenaId);
  if (!config) {
    throw new HttpsError("failed-precondition", "NO_CONFIG: configure os dados fiscais antes.");
  }

  const idempotencyKey = buildIdempotencyKey({origin: "activation_test", arenaId: input.arenaId});
  const invoiceId = invoiceIdFor(input.arenaId, idempotencyKey);
  const ref = db.doc(`fiscalInvoices/${invoiceId}`);
  const snap = await ref.get();

  if (snap.exists) {
    // A nota de ativação já existe: reconciliar, reemitir (se rejected) ou não
    // fazer nada. NUNCA revalida `config.status` para BARRAR o reprocessamento
    // aqui — quem faz isso é o `shouldProcess` dentro do reprocessamento, do
    // mesmo jeito que `retryFiscalInvoiceCore` (Task 3) também não revalida
    // antes de chamar `reprocessFiscalInvoice`.
    const existing = snap.data() as FiscalInvoice;
    if (existing.status === "authorized" && config.status !== "active") {
      // A config foi resetada por um re-save do wizard (ex.: renovação anual
      // do certificado A1) depois que a nota de ativação já tinha sido
      // autorizada. A nota antiga continua provando que o cadastro funciona —
      // reconcilia em vez de deixar o botão não fazer nada para sempre.
      await applyActivationOutcome(db, input.arenaId, {status: "authorized"});
      return;
    }
    if (existing.status === "rejected") {
      // "Tentar novamente" depois de corrigir o cadastro só faz sentido se a
      // nota reenviada usar o serviço ATUAL da config, não o congelado na
      // criação — senão o dono corrige o catálogo e a mesma nota errada sai
      // de novo. Só vale para a nota de ativação: uma nota real (reserva/
      // clubinho) nunca deve ter seu valor/serviço trocado depois do fato.
      const freshService = config.services.find((s) => s.id === config.defaultServiceIdBooking);
      if (freshService) {
        await ref.set(
          {
            serviceId: freshService.id,
            codigoMunicipal: freshService.codigoMunicipal,
            aliquotaIss: freshService.aliquotaIss,
          },
          {merge: true},
        );
      }
      await reprocessFiscalInvoice(db, issuer, readToken, invoiceId);
    }
    // authorized (com a config já active) / requested / processing: nada a
    // fazer, o estado já reflete o que a tela precisa mostrar via o listener
    // ao vivo da config/nota.
    return;
  }

  // Ainda não existe nota de ativação — só chega aqui na primeira emissão da
  // arena. Valida o cadastro antes de criar o pedido.
  if (config.status !== "testing" && config.status !== "error") {
    throw new HttpsError(
      "failed-precondition",
      config.status === "draft"
        ? "DRAFT: conclua o cadastro fiscal antes de emitir a nota de teste."
        : "ALREADY_ACTIVE: a emissão já está ativa — não há nota de teste para emitir de novo.",
    );
  }
  if (!config.defaultServiceIdBooking) {
    throw new HttpsError(
      "failed-precondition",
      "Defina um serviço padrão de reserva antes de emitir a nota de teste.",
    );
  }
  const service = config.services.find((s) => s.id === config.defaultServiceIdBooking);
  if (!service) {
    throw new HttpsError("failed-precondition", "O serviço padrão de reserva não está no catálogo.");
  }

  // Só cria — NÃO chama `reprocessFiscalInvoice` aqui. `createInvoiceRequest`
  // já é uma criação de documento de verdade, e o trigger
  // `onFiscalInvoiceRequested` (Fatia A) processa sozinho, exatamente como
  // processa qualquer nota de reserva ou clubinho. Chamar o reprocessamento
  // direto neste ramo enviaria a nota à Focus duas vezes em paralelo.
  const createInput: CreateInvoiceRequestInput = {
    arenaId: input.arenaId,
    origin: "activation_test",
    originId: null,
    idempotencyKey,
    serviceId: service.id,
    codigoMunicipal: service.codigoMunicipal,
    aliquotaIss: service.aliquotaIss,
    descricao: "Nota de teste — ativação",
    tomador: ACTIVATION_TOMADOR,
    tomadorUid: null,
    valorBrutoReais: ACTIVATION_VALOR_REAIS,
  };
  await createInvoiceRequest(db, createInput);
}

export const emitActivationTestInvoice = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const arenaId = String((request.data as {arenaId?: string})?.arenaId ?? "");
  if (!arenaId) {
    throw new HttpsError("invalid-argument", "arenaId é obrigatório.");
  }
  await emitActivationTestInvoiceCore(
    getFirestore(),
    buildDefaultIssuer(),
    readIssuerTokenFromSecretManager,
    {arenaId, callerUid},
  );
  return {ok: true};
});

/** Núcleo testável da promoção — separado do trigger para não depender do Firestore real. */
export async function applyActivationOutcome(
  db: Firestore,
  arenaId: string,
  invoice: {status: FiscalInvoiceStatus; errorMessage?: string | null},
): Promise<void> {
  if (invoice.status === "authorized") {
    await db.doc(`arenas/${arenaId}/fiscal/config`).set(
      {status: "active", statusMessage: null, updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
    return;
  }
  if (invoice.status === "rejected") {
    await db.doc(`arenas/${arenaId}/fiscal/config`).set(
      {
        status: "error",
        statusMessage: invoice.errorMessage ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }
  // processing/requested/cancelled/cancellation_failed: sem promoção — só
  // authorized e rejected são terminais para efeito de ativação.
}

/**
 * Dispara em toda atualização de qualquer nota fiscal — o Firestore não
 * filtra triggers por valor de campo. Sai de imediato se não for a nota de
 * ativação. Custo extra por nota real: uma leitura de campo e um retorno.
 *
 * `retry: true` como no irmão `onFiscalInvoiceRequested`: sem ele, uma falha
 * transitória de escrita deixaria a nota autorizada e a arena presa em
 * `testing` para sempre. `applyActivationOutcome` é idempotente (grava sempre
 * os mesmos valores fixos com `merge: true`), então repetir é inofensivo.
 */
export const onActivationTestInvoiceResolved = onDocumentUpdated(
  {document: "fiscalInvoices/{invoiceId}", retry: true},
  async (event) => {
    const before = event.data?.before.data() as FiscalInvoice | undefined;
    const after = event.data?.after.data() as FiscalInvoice | undefined;
    if (!after || after.origin !== "activation_test") return;
    if (before?.status === after.status) return;
    await applyActivationOutcome(getFirestore(), after.arenaId, {
      status: after.status,
      errorMessage: after.errorMessage,
    });
  },
);
