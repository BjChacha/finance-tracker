package com.chacha.nlprobe;

import android.app.Activity;
import android.os.Bundle;
import android.os.SystemClock;
import android.system.Os;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public final class MainActivity extends Activity {
    private volatile Process server;
    private volatile boolean cancelled;
    private String apiKey;
    private volatile Thread nativeServer;
    private volatile Integer nativeExit;
    private volatile String nativeFailure;
    private volatile boolean nativeReady;
    private boolean nativeStopRequested;

    private static native int runNativeServer(String[] arguments, String logPath);
    private static native void stopNativeServer();

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView status = new TextView(this);
        status.setText("Testing local inference under an application UID...");
        setContentView(status);
        new Thread(this::runProbe, "local-inference-probe").start();
    }

    private static String read(InputStream stream) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private JSONObject request(String path, JSONObject body, int timeout) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("http://127.0.0.1:18488" + path).openConnection();
        try {
            connection.setConnectTimeout(timeout);
            connection.setReadTimeout(timeout);
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            if (body != null) {
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream stream = connection.getOutputStream()) {
                    stream.write(bytes);
                }
            }
            if (connection.getResponseCode() != 200) throw new IllegalStateException("HTTP " + connection.getResponseCode());
            return new JSONObject(read(connection.getInputStream()));
        } finally {
            connection.disconnect();
        }
    }

    private void persist(JSONObject result) throws Exception {
        File temporary = new File(getFilesDir(), "result.tmp");
        try (FileOutputStream stream = new FileOutputStream(temporary)) {
            stream.write(result.toString(2).getBytes(StandardCharsets.UTF_8));
        }
        Files.move(temporary.toPath(), new File(getFilesDir(), "result.json").toPath(),
            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }

    private void runProbe() {
        JSONObject result = new JSONObject();
        JSONArray events = new JSONArray();
        long started = SystemClock.elapsedRealtime();
        try {
            result.put("uid", android.os.Process.myUid());
            result.put("pid", android.os.Process.myPid());
            result.put("events", events);
            result.put("complete", false);
            result.put("scope", "Isolated APK runtime capability probe; no finance database or UI latency claim");
            persist(result);
            String library = getApplicationInfo().nativeLibraryDir;
            File model = new File(getFilesDir(), "model.gguf");
            if (model.length() != 2740937888L) throw new IllegalStateException("Unexpected model size");
            apiKey = UUID.randomUUID().toString();
            File keyFile = new File(getFilesDir(), "session-key");
            Files.write(keyFile.toPath(), apiKey.getBytes(StandardCharsets.UTF_8));
            try (InputStream source = getAssets().open("template.jinja")) {
                Files.copy(source, new File(getFilesDir(), "template.jinja").toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            String[] arguments = new String[] {
                library + "/libllama-server.so", "-m", model.getAbsolutePath(),
                "--host", "127.0.0.1", "--port", "18488", "--api-key-file", keyFile.getAbsolutePath(),
                "-c", "4096", "-b", "512", "-ub", "512", "-t", "4", "-tb", "4", "-np", "1",
                "-ngl", "99", "--device", "HTP0", "--ctx-checkpoints", "4", "--cache-ram", "512",
                "--jinja", "--chat-template-file", new File(getFilesDir(), "template.jinja").getAbsolutePath(),
                "--no-webui", "--no-warmup", "--no-context-shift"};
            File log = new File(getFilesDir(), "server.log");
            result.put("backend", BuildConfig.USE_JNI ? "jni" : "executable");
            persist(result);
            if (BuildConfig.USE_JNI) {
                Os.setenv("ADSP_LIBRARY_PATH", library, true);
                Os.setenv("GGML_HEXAGON_POWER_MODE", "burst", true);
                System.loadLibrary("nlprobe_jni");
                nativeServer = new Thread(() -> {
                    try {
                        nativeExit = runNativeServer(arguments, log.getAbsolutePath());
                    } catch (Throwable error) {
                        nativeFailure = error.toString();
                    }
                }, "local-native-server");
                nativeServer.start();
            } else {
                ProcessBuilder builder = new ProcessBuilder(Arrays.asList(arguments));
                Map<String, String> environment = builder.environment();
                environment.put("LD_LIBRARY_PATH", library);
                environment.put("ADSP_LIBRARY_PATH", library);
                environment.put("GGML_HEXAGON_POWER_MODE", "burst");
                builder.directory(getFilesDir());
                builder.redirectErrorStream(true);
                builder.redirectOutput(log);
                server = builder.start();
            }
            boolean ready = false;
            while (!cancelled && SystemClock.elapsedRealtime() - started < 120000) {
                if (BuildConfig.USE_JNI) {
                    if (!nativeServer.isAlive()) throw new IllegalStateException(
                        "JNI server exited: " + nativeExit + " " + nativeFailure);
                } else if (!server.isAlive()) {
                    throw new IllegalStateException("Native server exited: " + server.exitValue());
                }
                try {
                    ready = "ok".equals(request("/health", null, 500).optString("status"));
                    if (ready) break;
                } catch (Exception ignored) {
                    // Health is unavailable during model initialization.
                }
                Thread.sleep(100);
            }
            if (!ready) throw new IllegalStateException("Native server did not become ready");
            nativeReady = true;
            result.put("health_ms", SystemClock.elapsedRealtime() - started);
            JSONArray cases = new JSONArray(read(getAssets().open("requests.json")));
            for (int index = 0; index < cases.length(); index++) {
                if (cancelled) throw new InterruptedException("Probe cancelled");
                JSONObject item = cases.getJSONObject(index);
                long before = SystemClock.elapsedRealtimeNanos();
                JSONObject response = request("/v1/chat/completions", item.getJSONObject("request"), 60000);
                JSONObject event = new JSONObject();
                event.put("name", item.getString("name"));
                event.put("elapsed_ms", (SystemClock.elapsedRealtimeNanos() - before) / 1000000.0);
                event.put("response", response);
                events.put(event);
                JSONObject choice = response.getJSONArray("choices").getJSONObject(0);
                if (!"stop".equals(choice.getString("finish_reason"))) throw new IllegalStateException("Truncated output");
                if (item.getString("name").startsWith("prime_") &&
                    !"OK".equals(choice.getJSONObject("message").optString("content"))) {
                    throw new IllegalStateException("Priming response mismatch");
                }
                persist(result);
            }
            result.put("complete", true);
        } catch (Throwable error) {
            try { result.put("error", error.toString()); } catch (Exception ignored) { }
        } finally {
            stopServer();
            try {
                result.put("total_ms", SystemClock.elapsedRealtime() - started);
                persist(result);
            } catch (Exception ignored) { }
            runOnUiThread(this::finish);
        }
    }

    private synchronized void stopServer() {
        Thread thread = nativeServer;
        if (thread != null) {
            if (nativeReady && thread.isAlive() && !nativeStopRequested) {
                nativeStopRequested = true;
                stopNativeServer();
            }
            try {
                thread.join(2000);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
            return;
        }
        Process owned = server;
        if (owned == null) return;
        owned.destroy();
        try {
            if (!owned.waitFor(2, TimeUnit.SECONDS)) owned.destroyForcibly();
        } catch (InterruptedException error) {
            owned.destroyForcibly();
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public void onDestroy() {
        cancelled = true;
        stopServer();
        super.onDestroy();
    }
}
