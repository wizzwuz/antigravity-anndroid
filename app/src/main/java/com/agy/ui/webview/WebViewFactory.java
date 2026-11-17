package com.agy.ui.webview;

import android.content.Context;
import android.graphics.Rect;
import android.os.Build;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputConnectionWrapper;
import android.webkit.WebView;

import com.agy.bridge.AndroidBridge;
import com.agy.theme.ThemeManager;

import java.util.Locale;

/** Creates and hardware-configures the host WebView. */
public final class WebViewFactory {

    private static final String JS_SELECT_ALL =
            "(function(){try{window.__agySelectAllInEditor&&window.__agySelectAllInEditor();}catch(e){}})();";

    private WebViewFactory() {
    }

    private static void triggerLexicalSelectAll(final WebView view) {
        if (view == null) return;
        Runnable r = new Runnable() {
            @Override
            public void run() {
                try {
                    view.evaluateJavascript(JS_SELECT_ALL, null);
                } catch (Throwable ignored) {
                }
            }
        };
        view.post(r);
        view.postDelayed(r, 60);
    }

    private static boolean isSelectAllItem(MenuItem item) {
        if (item == null) return false;
        if (item.getItemId() == android.R.id.selectAll) return true;
        CharSequence title = item.getTitle();
        return title != null && "select all".equals(title.toString().trim().toLowerCase(Locale.ROOT));
    }

    private static ActionMode.Callback wrapActionModeCallback(final WebView view, final ActionMode.Callback cb) {
        if (cb == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && cb instanceof ActionMode.Callback2) {
            final ActionMode.Callback2 cb2 = (ActionMode.Callback2) cb;
            return new ActionMode.Callback2() {
                @Override
                public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                    return cb2.onCreateActionMode(mode, menu);
                }

                @Override
                public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                    return cb2.onPrepareActionMode(mode, menu);
                }

                @Override
                public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                    boolean selectAll = isSelectAllItem(item);
                    boolean handled = cb2.onActionItemClicked(mode, item);
                    if (selectAll) {
                        triggerLexicalSelectAll(view);
                    }
                    return handled;
                }

                @Override
                public void onDestroyActionMode(ActionMode mode) {
                    cb2.onDestroyActionMode(mode);
                }

                @Override
                public void onGetContentRect(ActionMode mode, View v, Rect outRect) {
                    cb2.onGetContentRect(mode, v, outRect);
                }
            };
        }
        return new ActionMode.Callback() {
            @Override
            public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                return cb.onCreateActionMode(mode, menu);
            }

            @Override
            public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                return cb.onPrepareActionMode(mode, menu);
            }

            @Override
            public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                boolean selectAll = isSelectAllItem(item);
                boolean handled = cb.onActionItemClicked(mode, item);
                if (selectAll) {
                    triggerLexicalSelectAll(view);
                }
                return handled;
            }

            @Override
            public void onDestroyActionMode(ActionMode mode) {
                cb.onDestroyActionMode(mode);
            }
        };
    }

    public static WebView create(Context context, AndroidBridge bridge, ThemeManager theme) {
        WebView view = new WebView(context) {
            @Override
            public ActionMode startActionMode(ActionMode.Callback callback) {
                return super.startActionMode(wrapActionModeCallback(this, callback));
            }

            @Override
            public ActionMode startActionMode(ActionMode.Callback callback, int type) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    return super.startActionMode(wrapActionModeCallback(this, callback), type);
                }
                return super.startActionMode(wrapActionModeCallback(this, callback));
            }

            @Override
            public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
                InputConnection ic = super.onCreateInputConnection(outAttrs);
                if (ic == null) return null;
                final WebView self = this;
                return new InputConnectionWrapper(ic, false) {
                    @Override
                    public boolean performContextMenuAction(int id) {
                        boolean res = super.performContextMenuAction(id);
                        if (id == android.R.id.selectAll) {
                            triggerLexicalSelectAll(self);
                        }
                        return res;
                    }
                };
            }
        };
        view.setBackgroundColor(theme.getBackgroundColor());
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        view.requestFocus(View.FOCUS_DOWN);
        // Layer type NONE: hardware acceleration is already enabled at window/manifest level.
        // LAYER_TYPE_HARDWARE forces offscreen texture compositing on every frame, causing sluggishness.
        view.setLayerType(View.LAYER_TYPE_NONE, null);
        view.addJavascriptInterface(bridge, bridge.getNativeBindingName());
        // Android WebView needs an explicit focus grant for the soft keyboard to show.
        view.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_DOWN) {
                    ((WebView) v).requestFocus(View.FOCUS_DOWN);
                }
                return false;
            }
        });

        WebSettingsFactory.configure(view);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            boolean isDevBuild = context != null && ("com.agy.dev".equals(context.getPackageName()) || context.getPackageName().endsWith(".dev"));
            WebView.setWebContentsDebuggingEnabled(isDevBuild);
        }
        return view;
    }
}
