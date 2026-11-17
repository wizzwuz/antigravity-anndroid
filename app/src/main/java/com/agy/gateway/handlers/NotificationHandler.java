package com.agy.gateway.handlers;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import org.json.JSONObject;

/**
 * Handles native Android notifications and notification channels:
 * 1. "Antigravity Task Progress" - Persistent notifications showing Antigravity running tasks
 *    of different conversations as separate notifications.
 * 2. "Antigravity Task Alerts and Completion" - Floating notifications showing any Alerts or
 *    Completion of tasks of all running conversations as separate notifications.
 *
 * Tapping on either notification opens the associated conversation in MainActivity/WebView.
 */
public final class NotificationHandler {

    private static final String TAG = "NotificationHandler";

    public static final String CHANNEL_TASK_PROGRESS = "task_progress";
    public static final String CHANNEL_TASK_ALERTS_COMPLETION = "task_alerts_completion";

    // Legacy and polyfill compatibility aliases
    public static final String CHANNEL_AGENT_PROGRESS = "agent_progress";
    public static final String CHANNEL_AGENT_COMPLETED = "agent_completed";
    public static final String CHANNEL_AGENT_COMPLETED_OPEN_CHAT = "agent_completed_open_chat";
    public static final String CHANNEL_TASKS = "agy_tasks";
    public static final String CHANNEL_ALERTS = "agy_alerts";

    public static final String PREFS_NAME = "antigravity_notifications";
    public static final String PREF_PROGRESS_ENABLED = "progress_enabled";
    public static final String PREF_ALERTS_ENABLED = "alerts_enabled";

    private final Context context;
    private final NotificationManager manager;

    public NotificationHandler(Context context) {
        this.context = context.getApplicationContext();
        this.manager = (NotificationManager) this.context.getSystemService(Context.NOTIFICATION_SERVICE);
        initChannels(this.context);
    }

    public static void initChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && context != null) {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 0. Antigravity Core Running
            com.agy.core.ForegroundNotification.initChannel(context);

            // 1. Antigravity Task Progress: persistent running tasks across conversations
            NotificationChannel progressChannel = new NotificationChannel(
                    CHANNEL_TASK_PROGRESS,
                    "Antigravity Task Progress",
                    NotificationManager.IMPORTANCE_LOW);
            progressChannel.setDescription("Persistent notifications showing Antigravity running tasks across conversations");
            progressChannel.setShowBadge(false);
            progressChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(progressChannel);

            // 2. Antigravity Task Alerts and Completion: floating heads-up alerts & completions
            NotificationChannel alertsChannel = new NotificationChannel(
                    CHANNEL_TASK_ALERTS_COMPLETION,
                    "Antigravity Task Alerts and Completion",
                    NotificationManager.IMPORTANCE_HIGH);
            alertsChannel.setDescription("Floating notifications showing Alerts or Completion of tasks across conversations");
            alertsChannel.enableLights(true);
            alertsChannel.enableVibration(true);
            alertsChannel.setVibrationPattern(new long[]{0, 250, 100, 250});
            alertsChannel.setShowBadge(true);
            alertsChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(alertsChannel);

            // Compatibility channel aliases
            NotificationChannel compatProg = new NotificationChannel(
                    CHANNEL_AGENT_PROGRESS, "Antigravity Task Progress", NotificationManager.IMPORTANCE_LOW);
            compatProg.setShowBadge(false);
            manager.createNotificationChannel(compatProg);

            NotificationChannel compatDone = new NotificationChannel(
                    CHANNEL_AGENT_COMPLETED, "Antigravity Task Alerts and Completion", NotificationManager.IMPORTANCE_HIGH);
            compatDone.enableLights(true);
            compatDone.enableVibration(true);
            manager.createNotificationChannel(compatDone);
        }
    }

    public static String resolveChannel(String rawChannel, boolean ongoing) {
        if (rawChannel == null || rawChannel.isEmpty()) {
            return ongoing ? CHANNEL_TASK_PROGRESS : CHANNEL_TASK_ALERTS_COMPLETION;
        }
        if (CHANNEL_TASK_PROGRESS.equalsIgnoreCase(rawChannel)
                || CHANNEL_AGENT_PROGRESS.equalsIgnoreCase(rawChannel)
                || CHANNEL_TASKS.equalsIgnoreCase(rawChannel)) {
            return CHANNEL_TASK_PROGRESS;
        }
        if (CHANNEL_TASK_ALERTS_COMPLETION.equalsIgnoreCase(rawChannel)
                || CHANNEL_AGENT_COMPLETED.equalsIgnoreCase(rawChannel)
                || CHANNEL_AGENT_COMPLETED_OPEN_CHAT.equalsIgnoreCase(rawChannel)
                || CHANNEL_ALERTS.equalsIgnoreCase(rawChannel)) {
            return CHANNEL_TASK_ALERTS_COMPLETION;
        }
        return ongoing ? CHANNEL_TASK_PROGRESS : CHANNEL_TASK_ALERTS_COMPLETION;
    }

    public static void post(Context context, String channel, String title, String message,
                            String cascadeId, boolean ongoing, int progress, int id, String tag) {
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        initChannels(context);

        String activeChannel = resolveChannel(channel, ongoing);

        // Check user preferences
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (CHANNEL_TASK_PROGRESS.equals(activeChannel) && !prefs.getBoolean(PREF_PROGRESS_ENABLED, true)) {
            return;
        }
        if (CHANNEL_TASK_ALERTS_COMPLETION.equals(activeChannel) && !prefs.getBoolean(PREF_ALERTS_ENABLED, true)) {
            return;
        }

        // Multi-conversation support: distinct notification tag and ID per conversation
        String actualTag;
        int actualId;
        if (cascadeId != null && !cascadeId.trim().isEmpty()) {
            String cid = cascadeId.trim();
            int hashOffset = Math.abs(cid.hashCode() % 50000);
            if (CHANNEL_TASK_PROGRESS.equals(activeChannel)) {
                actualTag = "cascade_prog_" + cid;
                actualId = 10000 + hashOffset;
            } else {
                actualTag = "cascade_done_" + cid;
                actualId = 60000 + hashOffset;
                // Automatically cancel any active progress notification for this conversation
                cancel(context, "cascade_prog_" + cid, 10000 + hashOffset);
            }
        } else {
            actualTag = tag != null && !tag.isEmpty() ? tag : "agy_notification";
            actualId = id > 0 ? id : (ongoing ? 1001 : 1002);
        }

        int icon = context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName());
        if (icon == 0) {
            icon = android.R.drawable.stat_notify_chat;
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, activeChannel)
                : new Notification.Builder(context);

        String resolvedTitle = (title != null && !title.trim().isEmpty()) ? title : "Antigravity";
        String resolvedMessage = message != null ? message : "";

        builder.setContentTitle(resolvedTitle)
                .setContentText(resolvedMessage)
                .setStyle(new Notification.BigTextStyle().bigText(resolvedMessage))
                .setSmallIcon(icon)
                .setOngoing(ongoing)
                .setAutoCancel(!ongoing);

        // Progress configuration for task progress
        if (CHANNEL_TASK_PROGRESS.equals(activeChannel) || ongoing) {
            if (progress >= 0) {
                builder.setProgress(100, Math.min(100, Math.max(0, progress)), false);
            } else {
                builder.setProgress(0, 0, true);
            }
        }

        // PendingIntent: tapping notification opens the associated conversation in MainActivity
        Intent intent = createLaunchIntent(context, cascadeId);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(context, actualId, intent, pendingFlags);
        builder.setContentIntent(pi);

        // Configure floating notification (heads-up banner) for alerts and completions
        if (CHANNEL_TASK_ALERTS_COMPLETION.equals(activeChannel)) {
            builder.setPriority(Notification.PRIORITY_MAX);
            builder.setDefaults(Notification.DEFAULT_ALL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(Notification.CATEGORY_EVENT);
                builder.setVibrate(new long[]{0, 250, 100, 250});
            }
        } else {
            builder.setPriority(Notification.PRIORITY_LOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(Notification.CATEGORY_PROGRESS);
            }
        }

        try {
            manager.notify(actualTag, actualId, builder.build());
            Log.i(TAG, "Notification posted: tag=" + actualTag + " id=" + actualId + " channel=" + activeChannel);
        } catch (Throwable t) {
            Log.w(TAG, "Failed posting notification: " + t.getMessage(), t);
        }
    }

    public static Intent createLaunchIntent(Context context, String cascadeId) {
        Intent intent = null;
        if (com.agy.ui.MainActivity.activeActivity != null) {
            intent = new Intent(context, com.agy.ui.MainActivity.activeActivity.getClass());
        } else {
            try {
                intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            } catch (Throwable ignored) {
            }
            if (intent == null) {
                intent = new Intent(context, com.agy.ui.MainActivity.class);
            }
        }
        intent.setPackage(context.getPackageName());
        if (cascadeId != null && !cascadeId.trim().isEmpty()) {
            String cid = cascadeId.trim();
            intent.setAction("com.agy.action.OPEN_CONVERSATION");
            intent.putExtra("cascade_id", cid);
            intent.setData(android.net.Uri.parse("agy://conversation/" + cid));
        } else {
            intent.setAction(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
        }
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return intent;
    }

    public static void cancel(Context context, String tag, int id) {
        if (context == null || tag == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        String cid = tag.replaceFirst("^cascade_(prog|done)_", "");
        int hashOffset = Math.abs(cid.hashCode() % 50000);
        int progId = 10000 + hashOffset;
        int doneId = 60000 + hashOffset;

        try {
            manager.cancel(tag, progId);
            manager.cancel(tag, doneId);
            manager.cancel("cascade_prog_" + cid, progId);
            manager.cancel("cascade_done_" + cid, doneId);
            if (id > 0) {
                manager.cancel(tag, id);
                manager.cancel("cascade_prog_" + cid, id);
                manager.cancel("cascade_done_" + cid, id);
            }
            manager.cancel(tag, 0);
            manager.cancel("cascade_prog_" + cid, 0);
            manager.cancel("cascade_done_" + cid, 0);
            manager.cancel(progId);
            manager.cancel(doneId);
        } catch (Throwable ignored) {}

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                StatusBarNotification[] active = manager.getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification sbn : active) {
                        String sbnTag = sbn.getTag();
                        int sbnId = sbn.getId();
                        if (sbnTag != null) {
                            if (sbnTag.equals(tag) || sbnTag.equals("cascade_prog_" + cid) || (cid.length() > 0 && sbnTag.contains(cid))) {
                                manager.cancel(sbnTag, sbnId);
                            }
                        } else {
                            if (sbnId == progId || sbnId == doneId) {
                                manager.cancel(null, sbnId);
                            }
                        }
                    }
                }
            } catch (Throwable ignored) {}
        }
    }

    public static void cancelAllProgressNotifications(Context context) {
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                StatusBarNotification[] active = manager.getActiveNotifications();
                if (active != null) {
                    for (StatusBarNotification sbn : active) {
                        String sbnTag = sbn.getTag();
                        int sbnId = sbn.getId();
                        boolean isProgress = false;
                        if (sbnTag != null && sbnTag.startsWith("cascade_prog_")) {
                            isProgress = true;
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                                && CHANNEL_TASK_PROGRESS.equals(sbn.getNotification().getChannelId())) {
                            isProgress = true;
                        } else if (sbnId >= 10000 && sbnId < 60000) {
                            isProgress = true;
                        }
                        if (isProgress) {
                            manager.cancel(sbnTag, sbnId);
                        }
                    }
                }
            } catch (Throwable ignored) {}
        }
    }

    public static void openNotificationSettings(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            } else {
                intent.setAction("android.settings.APP_NOTIFICATION_SETTINGS");
                intent.putExtra("app_package", context.getPackageName());
                intent.putExtra("app_uid", context.getApplicationInfo().uid);
            }
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "failed to launch notification settings: " + t.getMessage());
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(android.net.Uri.parse("package:" + context.getPackageName()));
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
            } catch (Throwable ignored) {}
        }
    }

    public static String getSettingsJson(Context context) {
        if (context == null) return "{}";
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONObject obj = new JSONObject();
            obj.put("core_enabled", prefs.getBoolean(com.agy.core.ForegroundNotification.PREF_CORE_ENABLED, true));
            obj.put("progress_enabled", prefs.getBoolean(PREF_PROGRESS_ENABLED, true));
            obj.put("alerts_enabled", prefs.getBoolean(PREF_ALERTS_ENABLED, true));
            return obj.toString();
        } catch (Throwable t) {
            return "{}";
        }
    }

    public static boolean setSetting(Context context, String key, boolean value) {
        if (context == null || key == null) return false;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(key, value).apply();
            if (com.agy.core.ForegroundNotification.PREF_CORE_ENABLED.equals(key)) {
                if (value) {
                    com.agy.core.ForegroundNotification.update(context);
                } else {
                    com.agy.core.ForegroundNotification.hide(context);
                }
            } else if (PREF_PROGRESS_ENABLED.equals(key) && !value) {
                cancelAllProgressNotifications(context);
            }
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    public JSONObject handle(JSONObject payload) {
        JSONObject resp = new JSONObject();
        try {
            String action = payload.optString("action", "post");
            String tag = payload.optString("tag", "agy_task");
            int id = payload.optInt("id", (int) (System.currentTimeMillis() % 100000));

            if ("cancel".equalsIgnoreCase(action)) {
                cancel(context, tag, id);
                resp.put("ok", true);
                resp.put("cancelled", true);
                return resp;
            }

            String title = payload.optString("title", "Antigravity");
            String message = payload.optString("message", "");
            int progress = payload.optInt("progress", -1);
            boolean ongoing = payload.optBoolean("ongoing", false);
            String channel = payload.optString("channel", payload.optString("category", null));
            String cascadeId = payload.optString("cascadeId", payload.optString("cascade_id", null));

            post(context, channel, title, message, cascadeId, ongoing, progress, id, tag);

            resp.put("ok", true);
            resp.put("tag", tag);
            resp.put("id", id);
            resp.put("channel", channel);
        } catch (Exception e) {
            Log.w(TAG, "Notification error: " + e.getMessage());
            try {
                resp.put("ok", false);
                resp.put("error", e.getMessage());
            } catch (Exception ignored) {}
        }
        return resp;
    }
}
