package com.agy.ui.lifecycle;

import android.content.ComponentCallbacks2;
import android.os.Handler;
import android.webkit.WebView;

import com.agy.ui.webview.WebViewHost;
import com.agy.ui.webview.WebViewLifecycle;

/** Activity lifecycle glue: WebView resume, trim-memory and handler teardown. */
public final class AppLifecycle {

    private AppLifecycle() {
    }

    public static void resume(WebView webView) {
        WebViewLifecycle.resume(webView);
    }

    public static void pauseTimers(WebView webView) {
        WebViewLifecycle.resumeTimers(webView);
    }

    public static void trimMemory(int level, Handler handler, WebViewHost host) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            System.gc();
        }
        if (host != null && host.getWebView() != null) {
            try {
                host.getWebView().evaluateJavascript(
                        "(function(){ try { window.dispatchEvent(new CustomEvent('agy:trim-memory', {detail: " + level + "})); } catch(e){} })();",
                        null);
            } catch (Throwable ignored) {}
        }
        if (level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE) {
            if (host != null && host.getWebView() != null) {
                WebViewLifecycle.freeMemory(host.getWebView());
            }
        }
    }

    public static void destroy(Handler handler) {
        handler.removeCallbacksAndMessages(null);
    }
}
