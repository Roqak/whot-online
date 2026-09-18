# Whot! for Android

A native Android app for the game: the solo build (same engine, same bots as
[lastcard.fun](https://lastcard.fun)) is bundled inside the APK and runs
entirely on device in a WebView. No server, no signup, works offline.

## Building

One command builds the web bundle and packages it into the APK:

```bash
npm run build:android
```

It runs `npm run build:portal` (the offline solo build into `dist-portal/`),
copies it into `android/app/src/main/assets/`, then runs Gradle
(`assembleDebug`). The APK lands in
`android/app/build/outputs/apk/debug/app-debug.apk` and is copied to
`android/Whot-debug.apk`.

Requires JDK 17 and an Android SDK (platform 35) — `local.properties` points
Gradle at yours, same as [../android-tv](../android-tv).

## How it works

- [MainActivity.java](app/src/main/java/com/whot/app/MainActivity.java) is a
  fullscreen WebView. `WebViewAssetLoader` (AndroidX webkit) serves the bundled
  assets on the virtual origin `https://appassets.androidplatform.net/assets/`,
  because ES modules won't load over `file://`.
- The web build is the `VITE_LOCAL_ONLY=1` portal build: relative paths, no
  socket, bots in the browser. The rules cannot drift from the online game —
  both use the same engine and the same bots.
- minSdk 21, targetSdk 35. Internet permission is kept so the WebView can
  fetch nothing in particular; the game itself needs no network.