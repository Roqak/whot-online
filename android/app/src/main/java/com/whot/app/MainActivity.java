package com.whot.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * Last Card for Android. The game ships inside the APK: the solo build
 * (same engine, same bots as the online game) is bundled in assets/ and
 * served by WebViewAssetLoader, which gives it a proper https origin so
 * the app's ES modules load. Everything runs on device, no server needed.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final String ASSET_HOST = "appassets.androidplatform.net";

    private WebView webView;
    private PlayGamesBridge playGamesBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        playGamesBridge = new PlayGamesBridge(this);
        playGamesBridge.signInSilently();

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.addJavascriptInterface(playGamesBridge, "Android");
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        webView.setBackgroundColor(Color.parseColor("#0b0e14"));
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep the game inside the app; nothing on the web is needed to play.
                return !ASSET_HOST.equals(request.getUrl().getHost());
            }

            @Override
            public boolean shouldOverrideKeyEvent(WebView view, android.view.KeyEvent event) {
                // BACK is the only key the game cares about: it owns the rest.
                return event.getKeyCode() != android.view.KeyEvent.KEYCODE_BACK;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                // The renderer died (low memory or a GPU crash): a dead WebView
                // would be left on screen. Show a way back instead.
                webView = null;
                setContentView(android.view.LayoutInflater
                        .from(MainActivity.this)
                        .inflate(R.layout.crash, null));
                findViewById(R.id.crash_restart).setOnClickListener(v -> {
                    recreate();
                });
                return true; // the old WebView is dead; we removed it ourselves
            }
        });
        setContentView(webView);
        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
            if (webView.getUrl() == null) webView.loadUrl(START_URL);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus || Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) {
            return;
        }
        webView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    // -------------------------------------------------------------- lifecycle

    @Override
    protected void onPause() {
        super.onPause();
        // Stop sounds and timers while the app is in the background: the game
        // is the only thing running, so a paused WebView is exactly a paused
        // game. The local table re-creates its state from the DOM on resume.
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // The game is a single page. BACK with in-app history (should not
        // normally happen on the virtual origin) steps back inside the game;
        // otherwise the game keeps running and BACK simply leaves the app.
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}