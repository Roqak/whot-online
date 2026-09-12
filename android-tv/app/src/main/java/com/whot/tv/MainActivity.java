package com.whot.tv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import android.app.Activity;

/**
 * Android TV viewer for Whot! Online. Shows the live 3D table for a room code:
 * first launch asks for the server URL, then a D-pad friendly code entry
 * screen, then the /w/CODE watch page in a fullscreen WebView.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "whot_tv";
    private static final String KEY_SERVER = "server_url";

    private FrameLayout root;
    private WebView webView;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0b0e14"));
        setContentView(root);

        String server = prefs.getString(KEY_SERVER, null);
        if (server == null) {
            showServerSetup();
        } else {
            showCodeEntry(server);
        }
    }

    // ---------------------------------------------------------------- setup

    private void showServerSetup() {
        LinearLayout panel = textPanel("Whot! TV", "Enter your Whot server address");
        final EditText input = makeInput("https://your-server.example.com");
        panel.addView(input);
        TextView go = makeButton("Save");
        go.setOnClickListener(v -> {
            String url = input.getText().toString().trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                toast("Address must start with http:// or https://");
                return;
            }
            while (url.endsWith("/")) {
                url = url.substring(0, url.length() - 1);
            }
            prefs.edit().putString(KEY_SERVER, url).apply();
            showCodeEntry(url);
        });
        panel.addView(go);
        root.addView(panel);
        input.requestFocus();
    }

    private void showCodeEntry(final String server) {
        LinearLayout panel = textPanel("Whot! TV", "Enter the room code to watch");
        final EditText input = makeInput("ROOM CODE");
        input.setOnEditorActionListener((v, actionId, event) -> {
            openWatch(server, input.getText().toString());
            return true;
        });
        panel.addView(input);
        TextView go = makeButton("Watch");
        go.setOnClickListener(v -> openWatch(server, input.getText().toString()));
        panel.addView(go);
        root.addView(panel);
        input.requestFocus();
    }

    private void openWatch(String server, String rawCode) {
        String code = normalizeCode(rawCode);
        if (code.isEmpty()) {
            toast("Enter a room code");
            return;
        }
        String url = server + "/w/" + code;
        openWebView(url);
    }

    private static String normalizeCode(String raw) {
        StringBuilder sb = new StringBuilder();
        for (char c : raw.trim().toUpperCase().toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    // --------------------------------------------------------------- webview

    @SuppressLint("SetJavaScriptEnabled")
    private void openWebView(String url) {
        root.removeAllViews();
        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        webView.setBackgroundColor(Color.parseColor("#0b0e14"));
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                // If the room is gone the watch page shows its own message;
                // a long press on BACK (handled in onKeyDown) exits to code entry.
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.loadUrl(url);
    }

    // --------------------------------------------------------------- helpers

    private LinearLayout textPanel(String title, String subtitle) {
        root.removeAllViews();
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(48), dp(24), dp(48), dp(24));
        root.addView(panel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(34);
        titleView.setGravity(Gravity.CENTER);
        panel.addView(titleView);

        TextView subtitleView = new TextView(this);
        subtitleView.setText(subtitle);
        subtitleView.setTextColor(Color.parseColor("#9aa4b2"));
        subtitleView.setTextSize(16);
        subtitleView.setGravity(Gravity.CENTER);
        subtitleView.setPadding(0, dp(8), 0, dp(24));
        panel.addView(subtitleView);
        return panel;
    }

    private EditText makeInput(String hint) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setHintTextColor(Color.parseColor("#5b6470"));
        input.setTextColor(Color.WHITE);
        input.setTextSize(24);
        input.setGravity(Gravity.CENTER);
        input.setMaxLines(1);
        input.setBackgroundResource(android.R.drawable.editbox_background_normal);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(560), dp(64));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        input.setLayoutParams(lp);
        return input;
    }

    private TextView makeButton(String label) {
        TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(20);
        btn.setGravity(Gravity.CENTER);
        btn.setBackgroundResource(android.R.drawable.button_onoff_indicator_off);
        btn.setFocusable(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(280), dp(60));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        lp.topMargin = dp(24);
        btn.setLayoutParams(lp);
        btn.setOnFocusChangeListener((v, hasFocus) ->
                btn.setTextColor(hasFocus ? Color.parseColor("#ffd166") : Color.WHITE));
        return btn;
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // ------------------------------------------------------------- key input

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // On the watch screen, long-press BACK leaves the game for code entry;
        // a short press keeps the WebView's own back handling.
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null
                && event.getRepeatCount() > 0) {
            exitWatch();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void exitWatch() {
        String server = prefs.getString(KEY_SERVER, null);
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        if (server != null) {
            showCodeEntry(server);
        } else {
            showServerSetup();
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