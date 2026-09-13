package com.whot.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.Log;
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
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Android TV viewer for Whot! Online. Shows the live 3D table for a room code:
 * first launch asks for the server URL, then a D-pad friendly code entry
 * screen, then the /w/CODE watch page in a fullscreen WebView.
 *
 * Any startup crash is caught and painted on screen so a TV without adb
 * still shows what went wrong.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "whot_tv";
    private static final String KEY_SERVER = "server_url";
    private static final String DEFAULT_SERVER = "https://lastcard.fun";
    private static final String TAG = "WhotTV";

    private FrameLayout root;
    private WebView webView;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0b0e14"));
        setContentView(root);

        try {
            String server = prefs.getString(KEY_SERVER, DEFAULT_SERVER);
            showCodeEntry(server);
        } catch (Throwable t) {
            Log.e(TAG, "startup failed", t);
            showCrash(t);
        }
    }

    private void showCrash(Throwable t) {
        root.removeAllViews();
        root.addView(crashView(t), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private LinearLayout crashView(Throwable t) {
        java.io.StringWriter sw = new java.io.StringWriter();
        t.printStackTrace(new java.io.PrintWriter(sw));
        final String text = t.getClass().getName() + "\n\n" + sw.toString();

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(32), dp(24), dp(32), dp(24));

        TextView title = new TextView(this);
        title.setText("Whot! TV hit an error");
        title.setTextColor(Color.parseColor("#ff6b6b"));
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        panel.addView(title);

        ScrollView scroll = new ScrollView(this);
        TextView body = new TextView(this);
        body.setText(text);
        body.setTextColor(Color.WHITE);
        body.setTextSize(13);
        body.setTypeface(Typeface.MONOSPACE);
        body.setPadding(0, dp(16), 0, dp(16));
        scroll.addView(body);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        panel.addView(scroll, lp);
        return panel;
    }

    // ---------------------------------------------------------------- setup

    private void showServerSetup() {
        LinearLayout panel = textPanel("Whot! TV", "Enter your Whot server address");
        final EditText input = makeInput(prefs.getString(KEY_SERVER, DEFAULT_SERVER));
        input.setText(prefs.getString(KEY_SERVER, DEFAULT_SERVER));
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
        TextView change = makeButton("Change server");
        change.setOnClickListener(v -> showServerSetup());
        panel.addView(change);
        root.addView(panel);
        input.requestFocus();
    }

    private void openWatch(String server, String rawCode) {
        String code = normalizeCode(rawCode);
        if (code.isEmpty()) {
            toast("Enter a room code");
            return;
        }
        openWebView(server + "/w/" + code);
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
        webView.setWebViewClient(new WebViewClient());
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
        GradientDrawable box = new GradientDrawable();
        box.setColor(Color.parseColor("#1c2230"));
        box.setCornerRadius(dp(10));
        box.setStroke(dp(2), Color.parseColor("#3a4356"));
        input.setBackground(box);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(560), dp(64));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        input.setLayoutParams(lp);
        return input;
    }

    private TextView makeButton(String label) {
        TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextSize(20);
        btn.setGravity(Gravity.CENTER);
        btn.setFocusable(true);
        GradientDrawable pill = new GradientDrawable();
        pill.setColor(Color.parseColor("#ffd166"));
        pill.setCornerRadius(dp(30));
        btn.setBackground(pill);
        btn.setTextColor(Color.parseColor("#0b0e14"));
        btn.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable g = new GradientDrawable();
            g.setColor(Color.parseColor(hasFocus ? "#ffe08a" : "#7a6636"));
            g.setCornerRadius(dp(30));
            btn.setBackground(g);
            btn.setTextColor(hasFocus ? Color.parseColor("#0b0e14") : Color.WHITE);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(280), dp(60));
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        lp.topMargin = dp(24);
        btn.setLayoutParams(lp);
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
        // From code entry, long-press BACK opens the server address screen;
        // on the watch screen, long-press BACK returns to code entry.
        if (keyCode == KeyEvent.KEYCODE_BACK && event.getRepeatCount() > 0) {
            if (webView != null) {
                exitWatch();
            } else {
                showServerSetup();
            }
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