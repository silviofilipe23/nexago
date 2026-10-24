import { Injectable } from '@angular/core';
import { runTransaction, serverTimestamp, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  MAX_BODY_CHARS,
  MAX_TEMPLATE_VERSIONS,
  starterBody,
  type ContractAudience,
  type ContractKind,
  type ContractTemplate,
} from '../../domain/contracts';
import { db } from '../firebase';
import { readContractTemplate } from '../mappers';
import { CenterActionsBase } from './actor';
import { callCenterFunction } from './invoices.actions';

export interface TemplateSettings {
  name: string;
  kind: ContractKind;
  audience: ContractAudience;
  optional: boolean;
}

export interface SendContractsInput {
  studentId: string;
  enrollmentId: string | null;
  templateIds: string[];
  requireBeforePayment: boolean;
}

export interface SendContractsResult {
  contracts: { contractId: string; number: string; title: string }[];
  /** O aluno recebeu push (tem conta vinculada). */
  notified: boolean;
}

/**
 * Contratos dos alunos. Modelos o gestor escreve direto no Firestore (rules: owner/admin, centro
 * não suspenso, `version` nunca diminui); o contrato de cada aluno só o servidor grava, então
 * enviar, lembrar e encerrar vão pelas callables de `functions/src/training-center-contracts.ts`.
 */
@Injectable({ providedIn: 'root' })
export class ContractsActions extends CenterActionsBase {
  async createTemplate(input: TemplateSettings): Promise<string> {
    this.assertWritable();
    const name = input.name.trim().slice(0, 80);
    if (!name) {
      throw new Error('Dê um nome ao modelo.');
    }
    const a = this.actor();
    const ref = this.ref('contractTemplates');
    const b = writeBatch(db());
    b.set(ref, {
      name,
      kind: input.kind,
      audience: input.audience,
      optional: input.kind === 'term' && input.optional,
      status: 'draft',
      version: 0,
      body: '',
      draftBody: starterBody(input.kind),
      draftUpdatedAt: serverTimestamp(),
      draftUpdatedByName: a.name,
      publishedAt: null,
      publishedByName: '',
      versions: [],
      createdAt: serverTimestamp(),
      createdByName: a.name,
    });
    const audit = this.auditDoc({ action: 'contract_template.created', entity: 'contract_template', entityId: ref.id, detail: `Modelo de contrato criado · ${name}` });
    b.set(audit.ref, audit.data);
    await b.commit();
    return ref.id;
  }

  /** Autosave do rascunho (sem auditoria: só publicar muda o que o aluno recebe). */
  async saveDraft(templateId: string, draftBody: string): Promise<void> {
    this.assertWritable();
    if (draftBody.length > MAX_BODY_CHARS) {
      throw new Error(`O texto passou de ${MAX_BODY_CHARS.toLocaleString('pt-BR')} caracteres.`);
    }
    await updateDoc(this.ref('contractTemplates', templateId), {
      draftBody,
      draftUpdatedAt: serverTimestamp(),
      draftUpdatedByName: this.actor().name,
    });
  }

  async updateSettings(t: ContractTemplate, input: TemplateSettings): Promise<void> {
    this.assertWritable();
    const name = input.name.trim().slice(0, 80);
    if (!name) {
      throw new Error('Dê um nome ao modelo.');
    }
    const b = writeBatch(db());
    b.update(this.ref('contractTemplates', t.id), {
      name,
      kind: input.kind,
      audience: input.audience,
      optional: input.kind === 'term' && input.optional,
    });
    const audit = this.auditDoc({ action: 'contract_template.updated', entity: 'contract_template', entityId: t.id, detail: `Configurações do modelo · ${name}` });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  /**
   * Publicar = nova versão: o rascunho vira `body`, `version` sobe e a versão entra no histórico.
   * Quem já assinou fica com o texto congelado do envio — nada muda pra trás.
   */
  async publish(templateId: string): Promise<number> {
    this.assertWritable();
    const a = this.actor();
    const ref = this.ref('contractTemplates', templateId);
    return runTransaction(db(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('Modelo não encontrado.');
      }
      const t = readContractTemplate(snap.id, snap.data());
      const body = t.draftBody.trim();
      if (!body) {
        throw new Error('O texto do modelo está vazio.');
      }
      if (t.version > 0 && body === t.body.trim()) {
        throw new Error('Nada mudou desde a última versão publicada.');
      }
      const version = t.version + 1;
      // Timestamp do cliente: `serverTimestamp()` não vale dentro de array.
      const entry = { version, body, publishedAt: Timestamp.now(), byName: a.name };
      const previous = (snap.data()['versions'] as unknown[] | undefined) ?? [];
      tx.update(ref, {
        status: 'published',
        version,
        body,
        draftBody: body,
        publishedAt: serverTimestamp(),
        publishedByName: a.name,
        versions: [...(Array.isArray(previous) ? previous : []), entry].slice(-MAX_TEMPLATE_VERSIONS),
      });
      const audit = this.auditDoc({ action: 'contract_template.published', entity: 'contract_template', entityId: templateId, detail: `${t.name} · v${version} publicada` });
      tx.set(audit.ref, audit.data);
      return version;
    });
  }

  /** Arquivar tira o modelo do envio; o histórico e os contratos já enviados ficam. */
  async setArchived(t: ContractTemplate, archived: boolean): Promise<void> {
    this.assertWritable();
    const status = archived ? 'archived' : t.version > 0 ? 'published' : 'draft';
    const b = writeBatch(db());
    b.update(this.ref('contractTemplates', t.id), { status });
    const audit = this.auditDoc({
      action: archived ? 'contract_template.archived' : 'contract_template.restored',
      entity: 'contract_template',
      entityId: t.id,
      detail: `${t.name} · ${archived ? 'arquivado' : 'reativado'}`,
    });
    b.set(audit.ref, audit.data);
    await b.commit();
  }

  send(input: SendContractsInput): Promise<SendContractsResult> {
    return callCenterFunction<SendContractsResult>('sendTrainingCenterContracts', { centerId: this.centerId(), ...input });
  }

  remind(contractId: string): Promise<{ notified: boolean; reminderCount: number }> {
    return callCenterFunction('remindTrainingCenterContract', { centerId: this.centerId(), contractId });
  }

  /** Assinado vira "encerrado"; ainda aberto vira "cancelado" (só owner/admin). */
  terminate(contractId: string, reason: string): Promise<{ status: 'terminated' | 'cancelled' }> {
    return callCenterFunction('terminateTrainingCenterContract', { centerId: this.centerId(), contractId, reason: reason.trim() });
  }
}

/** Mensagem da callable de contratos: o servidor já manda texto pronto nos `failed-precondition`. */
export function contractErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message.trim() : '';
  if (message.toUpperCase() === 'NOT FOUND' || message.toUpperCase() === 'NOT_FOUND') return 'Contratos indisponíveis no momento. Tente mais tarde.';
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return 'Sem conexão. Tente de novo.';
  if (code === 'functions/internal' && (!message || message.toLowerCase() === 'internal')) return 'Não foi possível concluir. Tente de novo.';
  if (code === 'permission-denied') return 'Sem permissão para esta ação neste centro.';
  if (code === 'unavailable') return 'Sem conexão. Tente de novo.';
  return message || 'Não foi possível concluir. Tente de novo.';
}
