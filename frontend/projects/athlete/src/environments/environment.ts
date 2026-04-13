import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: false,
  devAuthBypass: true,
  firebase: firebaseConfig,
  trustedReturnOrigins: [] as string[],
};
