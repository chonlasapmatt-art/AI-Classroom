// The Android wrapper around the same build the web and the PWA run.
//
// Not a second application. `webDir` is `dist`, which is the artefact `npm run build` already
// produces, so an Android release ships exactly the code that was tested — there is no separate
// mobile bundle to drift, and no feature that exists on one and not the other.
//
// The two things that are decided here and nowhere else, because Google will not let them be
// decided twice:
//
//   * `appId` is permanent. Play Console binds a listing to it for the life of the application, and
//     a typo is a new listing rather than a rename. `th.ac.smartclassroom.app` is the reverse-domain
//     form for a Thai school product.
//   * `androidScheme: 'https'` makes the WebView an https origin. On http the browser storage APIs
//     the whole product is built on — IndexedDB through Dexie, the sync queue, the service worker —
//     are either unavailable or treated as an insecure origin and cleared without warning, which
//     would lose a teacher's unsynced attendance. This is not a preference.
//
// Version code and signing are deliberately absent. Both belong to the release, not the repository:
// see `docs/30_ANDROID_BUILD.md`. A keystore in a public repository is a keystore that has to be
// replaced, and this repository is public.

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'th.ac.smartclassroom.app',
  appName: 'Smart Classroom',
  webDir: 'dist',
  android: {
    // The generated project ships debuggable; a release build turns it off. Stated rather than left
    // to the default so a release that forgot is a diff rather than a discovery.
    webContentsDebuggingEnabled: false
  },
  server: {
    androidScheme: 'https'
  },
  plugins: {
    // The splash screen is the app's own, shown while the WebView boots. The product already draws
    // a boot screen of its own (`.app-boot`), so this one only has to not flash a white rectangle
    // before that appears.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: '#100d24',
      showSpinner: false
    }
  }
};

export default config;
