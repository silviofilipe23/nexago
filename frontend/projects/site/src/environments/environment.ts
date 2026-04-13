import { firebaseConfig } from '@nexago/firebase-config';

/**
 * Desenvolvimento local. Em produção, use `environment.prod.ts` via substituição de arquivo no build.
 */
export const environment = {
  production: false,
  devAuthBypass: true,
  firebase: firebaseConfig,
  /**
   * Open redirect: só use URLs absolutas em `?redirect=` se a origin estiver aqui (igual a `new URL(...).origin`, sem barra final).
   */
  trustedReturnOrigins: [] as string[],
};
