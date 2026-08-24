/**
 * Configuração fiscal da arena. O núcleo recebe `saveSecret` injetado para o
 * teste não depender do Secret Manager.
 *
 * Certificado e senha passam por aqui em trânsito e não são gravados em lugar
 * nenhum: quem os guarda é o emissor. O que persistimos é o token da empresa,
 * e ele vai para o Secret Manager.
 */
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {FieldValue, getFirestore, type Firestore} from "firebase-admin/firestore";
import {SecretManagerServiceClient} from "@google-cloud/secret-manager";
import {
  FocusNfeIssuer,
  FOCUS_ACCOUNT_TOKEN,
  FOCUS_API_URL_PRODUCTION,
  FOCUS_API_URL_SANDBOX,
  FOCUS_ENV,
  focusFiscalSecrets,
} from "./focus-nfe-client";
import type {FiscalIssuer, RegisterIssuerResult} from "./issuer-port";
import type {FiscalAddress, FiscalMode, FiscalService} from "./types";

export type SaveSecretFn = (name: string, value: string) => Promise<void>;

export interface SaveFiscalConfigInput {
  arenaId: string;
  callerUid: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  inscricaoMunicipal: string;
  regimeTributario: "simples_nacional" | "lucro_presumido" | "lucro_real" | "mei";
  enderecoFiscal: FiscalAddress;
  services: FiscalService[];
  defaultServiceIdBooking?: string;
  defaultServiceIdClub?: string;
  certificadoBase64?: string;
  senhaCertificado?: string;
  /** Aceite do termo que autoriza a nexaGO a emitir em nome da arena. */
  authorizationAccepted: boolean;
  authorizationTermVersion: string;
}

export function issuerTokenSecretName(arenaId: string): string {
  return `fiscal-issuer-token-${arenaId}`;
}

async function assertManagesArena(
  db: Firestore,
  arenaId: string,
  callerUid: string,
): Promise<void> {
  const snap = await db.doc(`arenas/${arenaId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Arena não encontrada.");
  }
  if (snap.data()?.managerUserId !== callerUid) {
    throw new HttpsError(
      "permission-denied",
      "PERMISSION_DENIED: só o gestor da arena pode alterar os dados fiscais.",
    );
  }
}

function assertDefaultServicesExist(input: SaveFiscalConfigInput): void {
  if (!input.services?.length) {
    throw new HttpsError("invalid-argument", "Cadastre ao menos um serviço.");
  }
  const ids = new Set(input.services.map((s) => s.id));
  for (const id of [input.defaultServiceIdBooking, input.defaultServiceIdClub]) {
    if (id && !ids.has(id)) {
      throw new HttpsError(
        "invalid-argument",
        "INVALID_DEFAULT_SERVICE: serviço padrão não está no catálogo.",
      );
    }
  }
}

export async function saveArenaFiscalConfigCore(
  db: Firestore,
  issuer: FiscalIssuer,
  saveSecret: SaveSecretFn,
  input: SaveFiscalConfigInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);
  if (!input.authorizationAccepted || !input.authorizationTermVersion) {
    throw new HttpsError(
      "invalid-argument",
      "AUTHORIZATION_REQUIRED: aceite o termo que autoriza a emissão em nome da arena.",
    );
  }
  assertDefaultServicesExist(input);

  // O emissor lança `Error` cru (ex.: `FOCUS_REGISTER_FAILED_422`); solto,
  // isso chega no wizard como um `internal` opaco. O gestor precisa de uma
  // frase que diga o que fazer.
  let registered: RegisterIssuerResult;
  try {
    registered = await issuer.registerIssuer({
      cnpj: input.cnpj,
      razaoSocial: input.razaoSocial,
      nomeFantasia: input.nomeFantasia,
      inscricaoMunicipal: input.inscricaoMunicipal,
      endereco: input.enderecoFiscal,
      regimeTributario: input.regimeTributario,
      certificadoBase64: input.certificadoBase64,
      senhaCertificado: input.senhaCertificado,
    });
  } catch (e) {
    logger.error(`registerIssuer falhou para a arena ${input.arenaId}`, e);
    throw new HttpsError(
      "failed-precondition",
      "Não foi possível registrar a arena no emissor de notas fiscais. " +
        "Confira os dados e tente novamente, ou fale com o suporte.",
    );
  }

  const secretName = issuerTokenSecretName(input.arenaId);
  await saveSecret(secretName, registered.token);

  // Note o que NÃO entra: certificadoBase64, senhaCertificado, token.
  await db.doc(`arenas/${input.arenaId}/fiscal/config`).set(
    {
      cnpj: input.cnpj,
      razaoSocial: input.razaoSocial,
      nomeFantasia: input.nomeFantasia ?? null,
      inscricaoMunicipal: input.inscricaoMunicipal,
      regimeTributario: input.regimeTributario,
      enderecoFiscal: input.enderecoFiscal,
      services: input.services,
      defaultServiceIdBooking: input.defaultServiceIdBooking ?? null,
      defaultServiceIdClub: input.defaultServiceIdClub ?? null,
      issuerId: registered.issuerId,
      credentialSecretName: secretName,
      certificateExpiresAt: registered.certificateExpiresAt ?? null,
      status: "testing",
      mode: "off",
      statusMessage: null,
      authorizationAcceptedAt: FieldValue.serverTimestamp(),
      authorizationAcceptedByUid: input.callerUid,
      authorizationTermVersion: input.authorizationTermVersion,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );
}

export interface SetFiscalModeInput {
  arenaId: string;
  callerUid: string;
  mode: FiscalMode;
}

export async function setArenaFiscalModeCore(
  db: Firestore,
  input: SetFiscalModeInput,
): Promise<void> {
  await assertManagesArena(db, input.arenaId, input.callerUid);
  const ref = db.doc(`arenas/${input.arenaId}/fiscal/config`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Configure os dados fiscais antes.");
  }
  if (input.mode !== "off" && snap.data()?.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      "NOT_ACTIVE: emita a nota de teste antes de ligar a emissão.",
    );
  }
  await ref.set({mode: input.mode, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
}

function buildIssuer(): FiscalIssuer {
  const sandbox = FOCUS_ENV.value() === "sandbox";
  return new FocusNfeIssuer(
    sandbox ? FOCUS_API_URL_SANDBOX : FOCUS_API_URL_PRODUCTION,
    undefined,
    FOCUS_ACCOUNT_TOKEN.value(),
  );
}

const secretManager = new SecretManagerServiceClient();

/** `ALREADY_EXISTS` no enum de status do google-gax. */
const GRPC_ALREADY_EXISTS = 6;

/** Cria a secret se não existir e adiciona a versão nova. */
export async function saveSecretToSecretManager(name: string, value: string): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT ?? "";
  const parent = `projects/${projectId}`;
  try {
    await secretManager.createSecret({
      parent,
      secretId: name,
      secret: {replication: {automatic: {}}},
    });
  } catch (err) {
    // Só "já existe" é esperado. Engolir tudo esconderia um PERMISSION_DENIED
    // de IAM — e aí a arena já teria sido registrada no emissor, consumindo
    // uma vaga do plano, com a falha aparecendo confusa mais adiante.
    if ((err as {code?: number} | null)?.code !== GRPC_ALREADY_EXISTS) throw err;
  }
  await secretManager.addSecretVersion({
    parent: `${parent}/secrets/${name}`,
    payload: {data: Buffer.from(value, "utf8")},
  });
}

export const saveArenaFiscalConfig = onCall(
  {secrets: focusFiscalSecrets},
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Faça login para continuar.");
    }
    const data = (request.data ?? {}) as Omit<SaveFiscalConfigInput, "callerUid">;
    await saveArenaFiscalConfigCore(getFirestore(), buildIssuer(), saveSecretToSecretManager, {
      ...data,
      callerUid,
    });
    return {ok: true};
  },
);

export const setArenaFiscalMode = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Faça login para continuar.");
  }
  const data = (request.data ?? {}) as Omit<SetFiscalModeInput, "callerUid">;
  await setArenaFiscalModeCore(getFirestore(), {...data, callerUid});
  return {ok: true};
});

export const getArenaFiscalRequirements = onCall(
  {secrets: focusFiscalSecrets},
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Faça login para continuar.");
    }
    const codigoIbge = String((request.data as {codigoIbge?: string})?.codigoIbge ?? "");
    return {requirements: await buildIssuer().getMunicipalRequirements(codigoIbge)};
  },
);
