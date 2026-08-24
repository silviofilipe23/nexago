/**
 * Processa um pedido de nota: revalida, chama o emissor e grava o resultado.
 * Roda fora da transação da carteira de propósito — prefeitura fora do ar não
 * pode derrubar a confirmação de um pagamento.
 */
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import {shouldProcess, type ShouldProcessReason} from "./invoice-emitter";
import {readArenaFiscalConfig} from "./invoice-repository";
import {
  FocusNfeIssuer,
  FOCUS_API_URL_PRODUCTION,
  FOCUS_API_URL_SANDBOX,
  FOCUS_ENV,
  focusFiscalSecrets,
} from "./focus-nfe-client";
import type {FiscalIssuer} from "./issuer-port";
import type {FiscalInvoice} from "./types";

export type ReadIssuerToken = (secretName: string) => Promise<string>;

/**
 * Quem o gestor da arena lê na tela: o motivo interno é um enum em inglês, e
 * a mensagem que sobra no documento é a que aparece na lista de notas.
 */
const REJECTION_MESSAGE: Record<ShouldProcessReason, string> = {
  CONFIG_NOT_EMITTING: "Emissão automática desligada para esta arena.",
  ORIGIN_NOT_PAID: "Pagamento ainda não confirmado.",
  INVALID_AMOUNT: "Valor inválido para emissão.",
  INVALID_TOMADOR_DOCUMENT: "CPF/CNPJ do cliente inválido ou ausente.",
  ALREADY_AUTHORIZED: "Já existe uma nota autorizada para este pagamento.",
};

/** Uma origem só é "paga" se o documento de origem disser isso. */
async function isOriginPaid(db: Firestore, invoice: FiscalInvoice): Promise<boolean> {
  if (invoice.origin === "manual") return true;
  if (!invoice.originId) return false;
  if (invoice.origin === "booking") {
    // Pagamento dividido: a fatia paga é o que confirma ESTE pedido. O
    // `paymentStatus` da reserva só vira paid/partial quando a ÚLTIMA fatia
    // se resolve — olhar para ele rejeitaria as N-1 primeiras notas.
    if (invoice.shareId) {
      const shareSnap = await db
        .doc(`arenaBookings/${invoice.originId}/paymentShares/${invoice.shareId}`)
        .get();
      return shareSnap.data()?.status === "paid";
    }
    const snap = await db.doc(`arenaBookings/${invoice.originId}`).get();
    const status = snap.data()?.paymentStatus;
    return status === "paid" || status === "partial";
  }
  // clubinho: o pedido só é criado no webhook de pagamento confirmado
  return true;
}

export async function processInvoiceRequest(
  db: Firestore,
  issuer: FiscalIssuer,
  readToken: ReadIssuerToken,
  invoiceId: string,
): Promise<void> {
  const ref = db.doc(`fiscalInvoices/${invoiceId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const invoice = snap.data() as FiscalInvoice;
  if (invoice.status !== "requested") return;

  const config = await readArenaFiscalConfig(db, invoice.arenaId);
  const verdict = shouldProcess({
    config,
    origin: invoice.origin,
    originPaid: await isOriginPaid(db, invoice),
    valorBrutoReais: invoice.valorBrutoReais,
    tomadorCpfCnpj: invoice.tomador.cpfCnpj,
    hasAuthorizedTwin: false,
  });

  if (!verdict.ok) {
    await ref.set(
      {
        status: "rejected",
        errorMessage: REJECTION_MESSAGE[verdict.reason],
        processedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return;
  }

  const token = await readToken(config!.credentialSecretName!);
  const result = await issuer.issueServiceInvoice(token, {
    reference: invoiceId,
    prestador: {
      cnpj: config!.cnpj,
      inscricaoMunicipal: config!.inscricaoMunicipal,
      codigoIbge: config!.enderecoFiscal.codigoIbge,
    },
    tomador: invoice.tomador,
    servico: {
      valorServicos: invoice.valorBrutoReais,
      itemListaServico: invoice.codigoMunicipal,
      discriminacao: invoice.descricao,
      codigoIbge: config!.enderecoFiscal.codigoIbge,
      aliquota: invoice.aliquotaIss,
      issRetido: false,
    },
    optanteSimplesNacional: config!.regimeTributario === "simples_nacional",
  });

  // O webhook do emissor pode ter chegado enquanto a chamada acima corria: se
  // a nota já está num estado terminal, esta gravação só teria como piorá-la.
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const currentStatus = current.data()?.status;
    if (currentStatus === "authorized" || currentStatus === "cancelled") return;
    tx.set(
      ref,
      {
        status: result.status === "processing" ? "processing" : result.status,
        numero: result.numero ?? null,
        serie: result.serie ?? null,
        codigoVerificacao: result.codigoVerificacao ?? null,
        pdfUrl: result.pdfUrl ?? null,
        xmlUrl: result.xmlUrl ?? null,
        errorMessage: result.errorMessage ?? null,
        processedAt: FieldValue.serverTimestamp(),
        ...(result.status === "authorized"
          ? {authorizedAt: FieldValue.serverTimestamp()}
          : {}),
      },
      {merge: true},
    );
  });
}

const secretManager = new SecretManagerServiceClient();

/** Lê a versão mais recente do secret cujo nome está em `credentialSecretName`. */
export const readIssuerTokenFromSecretManager: ReadIssuerToken = async (secretName) => {
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  const [version] = await secretManager.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });
  const value = version.payload?.data?.toString();
  if (!value) throw new Error("FISCAL_ISSUER_TOKEN_MISSING");
  return value;
};

/** Processa o pedido assim que ele nasce. Retry automático em erro lançado. */
export const onFiscalInvoiceRequested = onDocumentCreated(
  {
    document: "fiscalInvoices/{invoiceId}",
    // `FOCUS_ENV` é `defineString`, não segredo — não entra nesta lista.
    secrets: [...focusFiscalSecrets],
    retry: true,
  },
  async (event) => {
    const issuer = new FocusNfeIssuer(
      FOCUS_ENV.value() === "sandbox" ? FOCUS_API_URL_SANDBOX : FOCUS_API_URL_PRODUCTION,
    );
    await processInvoiceRequest(
      getFirestore(),
      issuer,
      readIssuerTokenFromSecretManager,
      event.params.invoiceId,
    );
  },
);
