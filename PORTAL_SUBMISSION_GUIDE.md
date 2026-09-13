# HTML5 Game Portal Submission & Testing Guide

This guide walks you through testing, preparing, and submitting the portal build (`dist-portal.zip`) to **CrazyGames**, **GameDistribution**, and **Poki**.

---

## 1. Local Testing with the Portal SDK

The project has integrated an ad and lifecycle manager (`src/lib/portalSdk.ts`) that activates when running in portal mode.

### A. Testing with the CrazyGames Official QA Tool
CrazyGames provides an interactive QA overlay to test ad events, loading progress, and adblock simulation directly in your browser:

1. Run the development server:
   ```bash
   npm run dev
   ```
2. Open your browser with the QA flag:
   ```
   http://localhost:5173/?solo=1&crazygames=qa
   ```
3. You will see the CrazyGames QA control banner at the top of your screen.
4. Play a match against bots:
   - When someone wins, notice `happytime` event triggered in the console.
   - On the Match Over screen, clicking **Play again** or **Leave table** will request a `midgame` ad break.
   - Watch the QA overlay simulate an ad: verify game audio mutes during the ad and unmutes once the ad finishes.

### B. Testing with Simulated Mock Ads
If you are offline or want to test without connecting to CrazyGames servers:
```
http://localhost:5173/?solo=1&mockAds=1
```
This logs ad calls to the console and simulates a 2-second ad break while testing sound muting.

---

## 2. Generating the Portal Package

To create the release zip file:

```bash
npm run package:portal
```

This command will:
1. Compile TypeScript and build the static bundle using `VITE_LOCAL_ONLY=1`.
2. Output assets with relative paths (`./`) into `dist-portal/`.
3. Compress the folder into `dist-portal.zip` with `index.html` located at the **root of the archive** (a mandatory requirement for portal loaders).

---

## 3. Submitting to CrazyGames (Recommended First Step)

CrazyGames is the fastest and most developer-friendly HTML5 portal. They offer self-service submissions, automated QA tools, and direct 50/50 revenue sharing on ads.

### Step 1: Create a Developer Account
- Go to [developer.crazygames.com](https://developer.crazygames.com) and sign up for a publisher account.

### Step 2: New Game Submission
- Click **Add Game** / **Submit Game**.
- **Game Title**: `Last Card` (or `Last Card: Classic Whot Card Game` for higher search discoverability).
- **Game Type**: `HTML5 (ZIP)`.
- **File Upload**: Upload `dist-portal.zip`.

### Step 3: Required Metadata & Assets
All required graphics have already been generated and saved into [`portal-assets/`](file:///Users/akinolunloye/projects/whot-online/portal-assets):
- **App Icon (512x512)**: [`portal-assets/icon-512x512.jpg`](file:///Users/akinolunloye/projects/whot-online/portal-assets/icon-512x512.jpg)
- **Cover Thumbnail (800x600 / 4:3)**: [`portal-assets/cover-800x600.jpg`](file:///Users/akinolunloye/projects/whot-online/portal-assets/cover-800x600.jpg)
- **Wide Banner (1920x1080 / 16:9)**: [`portal-assets/banner-1920x1080.jpg`](file:///Users/akinolunloye/projects/whot-online/portal-assets/banner-1920x1080.jpg)
- **Gameplay Screenshot 1 (Table view)**: [`portal-assets/screenshot-table.jpg`](file:///Users/akinolunloye/projects/whot-online/portal-assets/screenshot-table.jpg)
- **Gameplay Screenshot 2 (Victory / Checkup)**: [`portal-assets/screenshot-victory.jpg`](file:///Users/akinolunloye/projects/whot-online/portal-assets/screenshot-victory.jpg)

**Listing Copy**:
- **Short Description**:
  > *"Play Last Card, the beloved Nigerian card game of Whot! Match shapes and numbers, drop special action cards (Hold On, Pick Two, General Market), call Last Card before your opponents catch you, and empty your hand to check up!"*
- **Tags**: `Card`, `Multiplayer`, `Uno`, `Board`, `Casual`, `Strategy`.

### Step 4: Submission QA Verification
CrazyGames automated reviewer will verify:
- [x] CrazyGames SDK v3 initialized (`window.CrazyGames.SDK.init()`).
- [x] Game loading finishes (`loadingStop()`).
- [x] Gameplay lifecycle calls (`gameplayStart()` and `gameplayStop()`).
- [x] Midgame commercial break requests on match conclusion.
- [x] Audio mutes while commercial break is active.

Once approved (typically 2–5 business days), your game goes live to millions of monthly players.

---

## 4. Submitting to GameDistribution & Poki

Once you have tested the portal build on CrazyGames, you can submit the exact same `dist-portal.zip` to other major portals:

### GameDistribution (Azerion)
- Portal: [gamedistribution.com/developers](https://gamedistribution.com/developers)
- Upload `dist-portal.zip`.
- GameDistribution distributes your game to hundreds of publisher sites (including Y8, Yahoo Games, etc.).

### Poki
- Portal: [developers.poki.com](https://developers.poki.com)
- Poki is curated: submit your game pitch and demo link first.
- If accepted, the `portalSdk.ts` integration already supports PokiSDK callbacks automatically.

---

## 5. Checking Revenue & Payouts

- In your CrazyGames Developer Dashboard, navigate to **Analytics & Earnings**.
- Track:
  - Daily Active Users (DAU)
  - Gameplays and Playtime
  - Ad Impressions (Midroll & Rewarded)
  - Estimated Revenue & eCPM
- Payouts are made monthly via PayPal, Wire Transfer, or Wise once you reach the minimum threshold (typically \$50).
