import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

// Cloudflare Turnstile (captcha) para formulário de contato
const TURNSTILE_SECRET = defineSecret("TURNSTILE_SECRET");

/**
 * Recebe mensagem de contato com token Turnstile; valida o captcha e grava em contactMessages.
 */
export const submitContactMessageSecure = onCall(
  {secrets: [TURNSTILE_SECRET]},
  async (request) => {
    try {
      const {name, email, subject, message, captchaToken} = request.data || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        throw new HttpsError("invalid-argument", "Nome é obrigatório.");
      }
      if (!email || typeof email !== "string" || !email.trim()) {
        throw new HttpsError("invalid-argument", "E-mail é obrigatório.");
      }
      if (!subject || typeof subject !== "string" || !subject.trim()) {
        throw new HttpsError("invalid-argument", "Assunto é obrigatório.");
      }
      if (!message || typeof message !== "string" || !message.trim()) {
        throw new HttpsError("invalid-argument", "Mensagem é obrigatória.");
      }
      if (!captchaToken || typeof captchaToken !== "string" || !captchaToken.trim()) {
        throw new HttpsError("invalid-argument", "Validação de segurança (captcha) é obrigatória. Atualize a página e tente novamente.");
      }

      let secret: string;
      try {
        secret = TURNSTILE_SECRET.value() ?? "";
      } catch (e) {
        logger.error("TURNSTILE_SECRET não disponível", e);
        throw new HttpsError("failed-precondition", "Configuração de segurança indisponível. Configure TURNSTILE_SECRET nas Firebase Functions.");
      }
      if (!secret) {
        logger.error("TURNSTILE_SECRET está vazio");
        throw new HttpsError("failed-precondition", "Configuração de segurança indisponível. Configure o secret TURNSTILE_SECRET (ex.: firebase functions:secrets:set TURNSTILE_SECRET).");
      }

      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({secret, response: captchaToken.trim()}).toString()
      });
      if (!verifyRes.ok) {
        const text = await verifyRes.text();
        logger.warn("Turnstile verify request failed", verifyRes.status, text);
        throw new HttpsError("internal", "Não foi possível validar a segurança. Tente novamente.");
      }
      let verifyData: { success?: boolean };
      try {
        verifyData = (await verifyRes.json()) as { success?: boolean };
      } catch (e) {
        logger.error("Turnstile response não é JSON", e);
        throw new HttpsError("internal", "Resposta inválida do serviço de verificação. Tente novamente.");
      }
      if (!verifyData.success) {
        throw new HttpsError("invalid-argument", "Validação de segurança falhou. Tente novamente.");
      }

      const db = getFirestore();
      const docRef = await db.collection("contactMessages").add({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });
      logger.info("Contact message saved", {messageId: docRef.id});
      return {messageId: docRef.id};
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("submitContactMessageSecure error", err);
      const message = err instanceof Error ? err.message : "Erro ao enviar mensagem. Tente novamente.";
      throw new HttpsError("internal", message);
    }
  }
);