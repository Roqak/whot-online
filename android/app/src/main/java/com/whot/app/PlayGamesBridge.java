package com.whot.app;

import android.app.Activity;
import android.util.Log;
import android.webkit.JavascriptInterface;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.LeaderboardsClient;
import com.google.android.gms.games.PlayGames;

/**
 * Exposed to the WebView as `window.Android`. The web game (see
 * src/native/playGames.ts) calls submitWinCount() after each match win;
 * everything here is fire-and-forget since the game has no UI for
 * sign-in/leaderboard errors and shouldn't block on them.
 */
public class PlayGamesBridge {

    private static final String TAG = "PlayGamesBridge";

    private final Activity activity;
    private final GamesSignInClient signInClient;

    PlayGamesBridge(Activity activity) {
        this.activity = activity;
        this.signInClient = PlayGames.getGamesSignInClient(activity);
    }

    /** Call once at startup; silent, no UI if the player has never signed in. */
    void signInSilently() {
        signInClient.isAuthenticated().addOnCompleteListener(task -> {
            boolean signedIn = task.isSuccessful() && task.getResult().isAuthenticated();
            if (!signedIn) {
                signInClient.signIn();
            }
        });
    }

    @JavascriptInterface
    public void submitWinCount(int wins) {
        activity.runOnUiThread(() -> {
            signInClient.isAuthenticated().addOnCompleteListener(task -> {
                boolean signedIn = task.isSuccessful() && task.getResult().isAuthenticated();
                if (!signedIn) return;
                LeaderboardsClient leaderboards = PlayGames.getLeaderboardsClient(activity);
                String leaderboardId = activity.getString(R.string.leaderboard_wins_id);
                leaderboards.submitScore(leaderboardId, wins);
            });
        });
    }
}
