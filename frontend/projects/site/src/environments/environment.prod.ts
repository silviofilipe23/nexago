import { firebaseConfig } from '@nexago/firebase-config';

export const environment = {
  production: true,
  devAuthBypass: false,
  firebase: firebaseConfig,
  trustedReturnOrigins: [] as string[],
};
