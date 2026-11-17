package com.agy.core;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;

/** Builds the low-importance ongoing notification and enters the foreground. */
public final class ForegroundNotification {

    public static final int NOTIFICATION_ID = 9001;
    public static final String CHANNEL_ID = "core_channel";
    public static final String PREF_CORE_ENABLED = "core_enabled";

    private ForegroundNotification() {
    }

    public static Notification build(Context context) {
        initChannel(context);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);

        int icon = context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName());
        if (icon == 0) {
            icon = android.R.drawable.stat_notify_sync;
        }

        Intent intent = com.agy.gateway.handlers.NotificationHandler.createLaunchIntent(context, null);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(context, NOTIFICATION_ID, intent, pendingFlags);

        return builder
                .setContentTitle("Antigravity")
                .setContentText("Core running")
                .setSmallIcon(icon)
                .setContentIntent(pi)
                .setOngoing(true)
                .setAutoCancel(false)
                .build();
    }

    public static void initChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && context != null) {
            NotificationManager manager =
                    (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "Antigravity Core", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Ongoing status notification indicating Antigravity core language server is running");
                channel.setShowBadge(false);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                manager.createNotificationChannel(channel);
            }
        }
    }

    public static void start(Service service) {
        if (service == null) return;
        Notification notification = build(service);
        SharedPreferences prefs = service.getSharedPreferences(
                com.agy.gateway.handlers.NotificationHandler.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(PREF_CORE_ENABLED, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            service.startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            service.startForeground(NOTIFICATION_ID, notification);
        }

        if (!enabled) {
            hide(service);
        }
    }

    public static void update(Context context) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(
                com.agy.gateway.handlers.NotificationHandler.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(PREF_CORE_ENABLED, true);
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (enabled) {
            manager.notify(NOTIFICATION_ID, build(context));
        } else {
            manager.cancel(NOTIFICATION_ID);
        }
    }

    public static void hide(Context context) {
        if (context == null) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }
}
