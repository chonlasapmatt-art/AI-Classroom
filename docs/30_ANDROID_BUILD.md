# Android build and release

The Android application is the web build in a Capacitor shell. There is no second codebase, no
mobile-only feature and no mobile-only bug surface: `webDir` is `dist`, so a release ships exactly
the bundle `npm run build` produced and the four gates already passed.

## What is in this repository, and what is not

In: `apps/web/capacitor.config.ts`, the Capacitor packages, and the three npm scripts below. That is
everything that can be decided once and reused.

Not in: the generated `android/` project, the version code, and the keystore.

* **`android/` is generated.** `npx cap add android` writes it from the config, and it is a build
  artefact of a particular Capacitor version rather than source. Generate it on the machine that
  builds. Commit it only if the team decides to hand-edit the Gradle files, and then own the merge
  conflicts that come with it.
* **The keystore is never committed.** This repository is public. A signing key in it is a signing
  key that has to be replaced, and Play will not accept a replacement for an existing listing —
  losing the upload key means losing the ability to update the app for its installed users. Keep it
  in a password manager, and enrol in **Play App Signing** so Google holds the app signing key and a
  lost upload key is recoverable.
* **The version code belongs to the release.** It is a monotonically increasing integer per upload
  and cannot repeat, so it is set by whatever runs the build, not stored here.

## First time on a machine

Requires JDK 21 and Android Studio (for the SDK and platform tools).

```bash
npm ci
npm run android:add       # generates apps/web/android/ — once per checkout
npm run android:sync      # builds the web app and copies it in
npm run android:open      # opens the project in Android Studio
```

`android:sync` is the one to re-run after any change to the web app. It runs `npm run build` first
on purpose: a `cap sync` over a stale `dist` ships the previous version and looks like the change
simply did not work.

## Release

1. `npm run check` — all four gates, on the tree being released.
2. Set the version. `versionName` is the human string and matches the release published in the
   operations console; `versionCode` is the integer Play orders uploads by and must be higher than
   every previous upload.
3. `npm run android:sync`.
4. In Android Studio: **Build → Generate Signed Bundle** → Android App Bundle, signed with the
   upload key.
5. Upload to the Play Console track. Roll out gradually — the same reason the platform has release
   channels: a bad build reaching every school at once is the failure worth avoiding.

## Things that will bite

**The https scheme is load-bearing.** `androidScheme: 'https'` in the config makes the WebView a
secure origin. On `http` the WebView either refuses IndexedDB or treats it as insecure and clears it
without warning, and this product keeps a teacher's unsynced attendance in IndexedDB. Do not change
it to quiet a mixed-content warning; fix the content.

**The application id is permanent.** `th.ac.smartclassroom.app` binds the Play listing for the life
of the app. Changing it later creates a new listing with no installs and no reviews.

**The operations console is not in the customer build.** Build with
`INCLUDE_PLATFORM_CONSOLE=false` before `android:sync` for a release that ships to schools, so the
console is absent from the bundle rather than merely unreachable — the same rule the web build
follows.

**`ALLOWED_ORIGINS` needs the app's origin.** The Edge Functions check it. A WebView on the https
scheme presents `https://localhost` as its origin; add it, or every gateway call from the app is
refused by CORS while the same build works in a browser.

## Not yet done

Push notifications. Parent messages go out over LINE, which reaches a parent on a phone whether or
not they have installed this app, so a Capacitor push plugin has not been added. If it is added
later, `notification_outbox` already has the shape for a second channel — add a delivery arm beside
`pushLine` in `notification-dispatch` rather than a second queue.
