package com.agy.gateway.handlers;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

/**
 * Handles native Android notifications and notification categories:
 * 1. Agent completed in the open chat (silent shade notification)
 * 2. Agent completed (silent heads-up banner, finished or needs attention)
 * 3. Agent progress (silent ongoing progress bar for Antigravity tasks)
 *
 * All channels and builders are strictly SILENT: no ringtones, no notification sounds, no vibration.
 */
public final class NotificationHandler {

    private static final String TAG = "NotificationHandler";

    // New versioned silent channel IDs to prevent Android OS from using cached sound/vibration
    public static final String CHANNEL_AGENT_COMPLETED_OPEN_CHAT = "agent_completed_open_chat_v3";
    public static final String CHANNEL_AGENT_COMPLETED = "agent_completed_v3";
    public static final String CHANNEL_AGENT_PROGRESS = "agent_progress_v3";

    // Legacy channel compatibility
    public static final String CHANNEL_TASKS = "agy_tasks";
    public static final String CHANNEL_ALERTS = "agy_alerts";

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
            if (manager == null) {
                return;
            }

            // Clean up legacy channels that may have system-cached sound or vibration
            String[] legacy = new String[]{
                "agent_completed", "agent_completed_open_chat", "agent_progress",
                "agy_tasks", "agy_alerts", "agent_completed_v2", "agent_completed_open_chat_v2", "agent_progress_v2"
            };
            for (String ch : legacy) {
                try {
                    manager.deleteNotificationChannel(ch);
                } catch (Throwable ignored) {}
            }

            // 1. Silent completion in open chat: shade notification without sound or vibration
            NotificationChannel openChat = new NotificationChannel(
                    CHANNEL_AGENT_COMPLETED_OPEN_CHAT,
                    "Agent completed in open chat",
                    NotificationManager.IMPORTANCE_LOW);
            openChat.setDescription("Completion in open chat (silent, no sound, no vibration)");
            openChat.setShowBadge(true);
            openChat.setSound(null, null);
            openChat.enableVibration(false);
            openChat.setVibrationPattern(null);
            openChat.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(openChat);

            // 2. Silent completed banner: heads-up banner support with zero sound and zero vibration
            NotificationChannel completed = new NotificationChannel(
                    CHANNEL_AGENT_COMPLETED,
                    "Agent completed",
                    NotificationManager.IMPORTANCE_HIGH);
            completed.setDescription("Agent task completed alert (silent, no sound, no vibration)");
            completed.enableLights(false);
            completed.enableVibration(false);
            completed.setVibrationPattern(null);
            completed.setSound(null, null);
            completed.setShowBadge(true);
            completed.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(completed);

            // 3. Silent task progress: ongoing progress bar with zero sound and zero vibration
            NotificationChannel progress = new NotificationChannel(
                    CHANNEL_AGENT_PROGRESS,
                    "Agent progress",
                    NotificationManager.IMPORTANCE_LOW);
            progress.setDescription("Ongoing task progress (silent, no sound, no vibration)");
            progress.setShowBadge(false);
            progress.enableVibration(false);
            progress.setVibrationPattern(null);
            progress.setSound(null, null);
            progress.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(progress);
        }
    }

    public static void post(Context context, String channel, String title, String message,
                            String cascadeId, boolean ongoing, int progress, int id, String tag) {
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        initChannels(context);

        // Normalize channel alias to new v3 silent channels
        if ("agent_completed".equalsIgnoreCase(channel) || "agent_completed_v3".equalsIgnoreCase(channel)
                || CHANNEL_ALERTS.equalsIgnoreCase(channel)) {
            channel = CHANNEL_AGENT_COMPLETED;
        } else if ("agent_progress".equalsIgnoreCase(channel) || "agent_progress_v3".equalsIgnoreCase(channel)
                || CHANNEL_TASKS.equalsIgnoreCase(channel)) {
            channel = CHANNEL_AGENT_PROGRESS;
        } else if ("agent_completed_open_chat".equalsIgnoreCase(channel)
                || "agent_completed_open_chat_v3".equalsIgnoreCase(channel)) {
            channel = CHANNEL_AGENT_COMPLETED_OPEN_CHAT;
        } else if (channel == null || channel.isEmpty()) {
            channel = ongoing ? CHANNEL_AGENT_PROGRESS : CHANNEL_AGENT_COMPLETED;
        }

        // Determine stable per-conversation tag & ID for multi-conversation support
        String actualTag;
        int actualId;
        if (cascadeId != null && !cascadeId.isEmpty()) {
            int hashOffset = Math.abs(cascadeId.hashCode() % 50000);
            if (CHANNEL_AGENT_PROGRESS.equals(channel)) {
                actualTag = "cascade_prog_" + cascadeId;
                actualId = 10000 + hashOffset;
            } else {
                actualTag = "cascade_done_" + cascadeId;
                actualId = 60000 + hashOffset;
                // Automatically dismiss any active progress notification for this conversation
                try {
                    manager.cancel("cascade_prog_" + cascadeId, 10000 + hashOffset);
                } catch (Throwable ignored) {}
            }
        } else {
            actualTag = tag != null && !tag.isEmpty() ? tag : "agy_notification";
            actualId = id > 0 ? id : (ongoing ? 1001 : 1002);
        }

        int icon = context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName());
        if (icon == 0) {
            icon = android.R.drawable.ic_dialog_info;
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, channel)
                : new Notification.Builder(context);

        builder.setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(icon)
                .setOngoing(ongoing)
                .setAutoCancel(!ongoing)
                .setSound(null)
                .setDefaults(0)
                .setVibrate(null)
                .setOnlyAlertOnce(true);

        // Progress bar configuration: always smooth continuous indeterminate for agent_progress
        if (CHANNEL_AGENT_PROGRESS.equals(channel)) {
            builder.setProgress(0, 0, true);
            builder.setPriority(Notification.PRIORITY_LOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(Notification.CATEGORY_PROGRESS);
            }
        } else if (progress >= 0) {
            builder.setProgress(100, Math.min(100, Math.max(0, progress)), false);
        } else if (ongoing) {
            builder.setProgress(0, 0, true);
        }

        if (CHANNEL_AGENT_COMPLETED.equals(channel)) {
            builder.setPriority(Notification.PRIORITY_HIGH);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(Notification.CATEGORY_EVENT);
            }
        } else if (CHANNEL_AGENT_COMPLETED_OPEN_CHAT.equals(channel)) {
            builder.setPriority(Notification.PRIORITY_LOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(Notification.CATEGORY_STATUS);
            }
        }

        // Action Intent to bring app to foreground and navigate directly to conversation
        Intent intent = new Intent(context, com.agy.ui.MainActivity.class);
        intent.setAction("com.agy.action.OPEN_CONVERSATION");
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (cascadeId != null && !cascadeId.isEmpty()) {
            intent.putExtra("cascade_id", cascadeId);
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(context, actualId, intent, pendingFlags);
        builder.setContentIntent(pi);

        try {
            manager.notify(actualTag, actualId, builder.build());
        } catch (Throwable t) {
            Log.w(TAG, "manager.notify failed: " + t.getMessage());
        }
    }

    public static void cancel(Context context, String tag, int id) {
        if (context == null) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (tag != null) {
            String cid = tag;
            if (cid.startsWith("cascade_prog_")) {
                cid = cid.substring("cascade_prog_".length());
            } else if (cid.startsWith("cascade_done_")) {
                cid = cid.substring("cascade_done_".length());
            } else if (cid.startsWith("cascade_")) {
                cid = cid.substring("cascade_".length());
            }

            int hashOffset = Math.abs(cid.hashCode() % 50000);
            int progId = 10000 + hashOffset;
            int doneId = 60000 + hashOffset;

            manager.cancel(tag, id > 0 ? id : progId);
            manager.cancel("cascade_prog_" + cid, progId);
            manager.cancel("cascade_done_" + cid, doneId);
            manager.cancel(tag, 0);
        } else {
            manager.cancel("agy_notification", id);
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
