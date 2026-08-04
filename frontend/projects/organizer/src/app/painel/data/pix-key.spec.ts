import {
  inferPixKeyType,
  maskPixKey,
  pixKeyTypeFromStored,
  resolveInitialPixKeyType,
  validatePixKeyForType,
} from './pix-key';

/** CPFs/CNPJs abaixo são sintéticos, gerados só para bater o dígito verificador. */
const VALID_CPF = '52998224725';
const VALID_CNPJ = '11222333000181';
const VALID_EVP = '123e4567-e89b-12d3-a456-426614174000';

describe('pix-key', () => {
  describe('validatePixKeyForType', () => {
    it('trata chave vazia como "ainda sem erro" em qualquer tipo', () => {
      expect(validatePixKeyForType('CPF', '')).toBeNull();
      expect(validatePixKeyForType('CNPJ', '   ')).toBeNull();
      expect(validatePixKeyForType('EVP', '')).toBeNull();
    });

    it('aceita CPF com dígito verificador correto, com ou sem máscara', () => {
      expect(validatePixKeyForType('CPF', VALID_CPF)).toBeNull();
      expect(validatePixKeyForType('CPF', '529.982.247-25')).toBeNull();
    });

    it('recusa CPF com checksum errado e CPF de dígitos repetidos', () => {
      expect(validatePixKeyForType('CPF', '52998224726')).toBe('CPF inválido');
      expect(validatePixKeyForType('CPF', '11111111111')).toBe('CPF inválido');
    });

    it('recusa CPF com quantidade errada de dígitos', () => {
      expect(validatePixKeyForType('CPF', '5299822472')).toBe('CPF deve ter 11 dígitos');
    });

    it('aceita CNPJ válido e recusa checksum errado', () => {
      expect(validatePixKeyForType('CNPJ', VALID_CNPJ)).toBeNull();
      expect(validatePixKeyForType('CNPJ', '11.222.333/0001-81')).toBeNull();
      expect(validatePixKeyForType('CNPJ', '11222333000182')).toBe('CNPJ inválido');
    });

    it('recusa CNPJ com tamanho errado', () => {
      expect(validatePixKeyForType('CNPJ', '1122233300018')).toBe('CNPJ deve ter 14 caracteres');
    });

    it('valida e-mail pela presença de @ e tamanho mínimo', () => {
      expect(validatePixKeyForType('EMAIL', 'organizador@email.com')).toBeNull();
      expect(validatePixKeyForType('EMAIL', 'semarroba.com')).toBe('E-mail inválido');
      expect(validatePixKeyForType('EMAIL', 'a@b')).toBe('E-mail inválido');
    });

    it('aceita celular com 10 e 11 dígitos e recusa fora da faixa', () => {
      expect(validatePixKeyForType('PHONE', '6239998539')).toBeNull();
      expect(validatePixKeyForType('PHONE', '62999853983')).toBeNull();
      expect(validatePixKeyForType('PHONE', '(62) 99985-3983')).toBeNull();
      expect(validatePixKeyForType('PHONE', '999853983')).toContain('10 ou 11 dígitos');
      expect(validatePixKeyForType('PHONE', '5562999853983')).toContain('10 ou 11 dígitos');
    });

    it('aceita EVP no formato UUID (case-insensitive) e recusa o resto', () => {
      expect(validatePixKeyForType('EVP', VALID_EVP)).toBeNull();
      expect(validatePixKeyForType('EVP', VALID_EVP.toUpperCase())).toBeNull();
      expect(validatePixKeyForType('EVP', 'nao-e-uuid')).toBe('Chave aleatória inválida');
    });
  });

  describe('inferPixKeyType', () => {
    it('infere pelo formato da chave', () => {
      expect(inferPixKeyType('organizador@email.com')).toBe('EMAIL');
      expect(inferPixKeyType(VALID_CPF)).toBe('CPF');
      expect(inferPixKeyType(VALID_CNPJ)).toBe('CNPJ');
      expect(inferPixKeyType(VALID_EVP)).toBe('EVP');
      expect(inferPixKeyType('6239998539')).toBe('PHONE');
    });

    /** ARMADILHA CONHECIDA, preservada de propósito: 11 dígitos casa com CPF antes de casar com
     *  celular, então celular com DDD é inferido como CPF. É a raiz do bug de BR Code Pix (chave
     *  gerada sem +55). Por isso a UI SEMPRE pede o tipo explicitamente — `inferPixKeyType` só
     *  existe pra adivinhar o tipo de chave legada, gravada antes de existir o seletor. Mudar a
     *  ordem aqui reclassificaria chaves de saque já cadastradas no Financeiro. */
    it('não distingue celular de 11 dígitos de CPF — a inferência é só fallback de legado', () => {
      expect(inferPixKeyType('62999853983')).toBe('CPF');
    });

    it('cai em EMAIL quando não reconhece o formato', () => {
      expect(inferPixKeyType('123')).toBe('EMAIL');
    });
  });

  describe('pixKeyTypeFromStored', () => {
    it('normaliza o valor gravado e devolve null para desconhecido', () => {
      expect(pixKeyTypeFromStored('cpf')).toBe('CPF');
      expect(pixKeyTypeFromStored('  Evp ')).toBe('EVP');
      expect(pixKeyTypeFromStored('random')).toBeNull();
      expect(pixKeyTypeFromStored('')).toBeNull();
    });
  });

  describe('resolveInitialPixKeyType', () => {
    it('prefere o tipo gravado quando ele é reconhecido', () => {
      expect(resolveInitialPixKeyType('EMAIL', VALID_CPF)).toBe('EMAIL');
    });

    it('infere pela chave quando o tipo gravado é inválido — inclusive o legado "random"', () => {
      expect(resolveInitialPixKeyType('random', '6239998539')).toBe('PHONE');
      expect(resolveInitialPixKeyType('', VALID_CNPJ)).toBe('CNPJ');
    });
  });

  describe('maskPixKey', () => {
    it('só encurta chave longa', () => {
      expect(maskPixKey('62999853983')).toBe('62999853983');
      expect(maskPixKey('organizador@email.com')).toBe('organiza…');
    });
  });
});
