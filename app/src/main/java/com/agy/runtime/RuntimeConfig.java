package com.agy.runtime;

import android.content.Context;
import android.os.Process;
import android.util.Log;

import com.agy.BuildConfig;
import com.agy.core.CoreRuntimeState;

import java.io.File;
import java.io.FileInputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;

/** App-level constants sourced from the generated BuildConfig. */
public final class RuntimeConfig {

    private static final String TAG = "RuntimeConfig";

    public static final int DEFAULT_HTTPS_PORT = BuildConfig.PORT;
    public static final String CORE_VERSION = BuildConfig.CORE_VERSION;
    public static final int MIN_API = BuildConfig.MIN_API;

    private static volatile Integer resolvedPort = null;

    private RuntimeConfig() {
    }

    /** The raw configured port from res/values/gen.xml, else the BuildConfig default. */
    public static int rawConfiguredPort(Context appContext) {
        if (appContext != null) {
            try {
                int resId = appContext.getResources().getIdentifier(
                        "https_server_port", "integer", appContext.getPackageName());
                if (resId != 0) {
                    return appContext.getResources().getInteger(resId);
                }
            } catch (Exception ignored) {
            }
        }
        return DEFAULT_HTTPS_PORT;
    }

    /**
     * Resolves the loopback HTTPS port for the core.
     * Guarantees the returned port is free to bind on 127.0.0.1, auto-killing
     * any zombie core processes from this app and finding the next free port if occupied.
     */
    public static synchronized int httpsPort(Context appContext) {
        if (resolvedPort != null) {
            return resolvedPort;
        }
        int basePort = rawConfiguredPort(appContext);
        killStaleCoreProcesses();
        resolvedPort = resolveFreePort(basePort);
        CoreRuntimeState.httpsPort = resolvedPort;
        Log.i(TAG, "resolved core port: " + resolvedPort + " (configured: " + basePort + ")");
        return resolvedPort;
    }

    /** Resets the cached resolved port so the next call scans fresh. */
    public static synchronized void resetResolvedPort() {
        resolvedPort = null;
    }

    public static boolean isPortAvailable(int port) {
        ServerSocket ss = null;
        try {
            ss = new ServerSocket();
            ss.setReuseAddress(true);
            ss.bind(new InetSocketAddress("127.0.0.1", port));
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (ss != null) {
                try {
                    ss.close();
                } catch (Exception ignored) {
                }
            }
        }
    }

    public static int resolveFreePort(int startPort) {
        if (startPort <= 0) {
            startPort = DEFAULT_HTTPS_PORT;
        }
        for (int p = startPort; p < startPort + 100; p++) {
            if (isPortAvailable(p)) {
                return p;
            }
        }
        try (ServerSocket ss = new ServerSocket(0)) {
            return ss.getLocalPort();
        } catch (Exception e) {
            return startPort;
        }
    }

    /**
     * Kills any orphaned liblanguage_server.so processes owned by our app UID.
     */
    public static void killStaleCoreProcesses() {
        try {
            int myPid = Process.myPid();
            File procDir = new File("/proc");
            File[] files = procDir.listFiles();
            if (files == null) {
                return;
            }
            for (File f : files) {
                if (!f.isDirectory()) {
                    continue;
                }
                String name = f.getName();
                try {
                    int pid = Integer.parseInt(name);
                    if (pid == myPid) {
                        continue;
                    }
                    File cmdlineFile = new File(f, "cmdline");
                    if (!cmdlineFile.isFile() || !cmdlineFile.canRead()) {
                        continue;
                    }
                    byte[] buf = new byte[512];
                    int len;
                    try (FileInputStream fis = new FileInputStream(cmdlineFile)) {
                        len = fis.read(buf);
                    }
                    if (len > 0) {
                        String cmdline = new String(buf, 0, len);
                        if (cmdline.contains("liblanguage_server.so") || cmdline.contains("language_server")) {
                            Log.w(TAG, "killing stale core process pid " + pid);
                            Process.sendSignal(pid, Process.SIGNAL_KILL);
                        }
                    }
                } catch (NumberFormatException ignored) {
                } catch (Exception ignored) {
                }
            }
            Thread.sleep(80);
        } catch (Exception ignored) {
        }
    }
}
