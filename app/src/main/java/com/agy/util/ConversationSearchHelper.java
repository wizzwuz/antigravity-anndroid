package com.agy.util;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Searches across all conversation transcripts on device.
 * Lists every occurrence of a word or sentence across every line and step
 * of any conversation.
 */
public final class ConversationSearchHelper {

    private static final String TAG = "ConvoSearchHelper";
    private static final int MAX_RESULTS = 250;
    private static final int SNIPPET_CONTEXT_CHARS = 40;

    private ConversationSearchHelper() {
    }

    public static String searchAllConversationsJson(Context context, String query) {
        if (query == null || query.trim().length() < 1) {
            return "[]";
        }
        String cleanQuery = query.trim();
        String queryLower = cleanQuery.toLowerCase();

        List<File> brainDirs = new ArrayList<>();
        if (context != null) {
            File f = new File(context.getFilesDir(), ".gemini/antigravity-app/brain");
            if (f.isDirectory()) brainDirs.add(f);
        }
        File f1 = new File("/data/user/0/com.agy.wizzwuz/files/.gemini/antigravity-app/brain");
        if (f1.isDirectory() && !brainDirs.contains(f1)) brainDirs.add(f1);
        File f2 = new File("/data/user/0/com.agy/files/.gemini/antigravity-app/brain");
        if (f2.isDirectory() && !brainDirs.contains(f2)) brainDirs.add(f2);

        JSONArray results = new JSONArray();
        int totalMatches = 0;

        for (File brainDir : brainDirs) {
            File[] convoDirs = brainDir.listFiles();
            if (convoDirs == null) continue;

            for (File cDir : convoDirs) {
                if (!cDir.isDirectory()) continue;
                String cid = cDir.getName();
                if ("tempmediaStorage".equalsIgnoreCase(cid) || "scratch".equalsIgnoreCase(cid)) {
                    continue;
                }

                File logFile = new File(cDir, ".system_generated/logs/transcript.jsonl");
                if (!logFile.isFile() || !logFile.canRead()) {
                    File fullLog = new File(cDir, ".system_generated/logs/transcript_full.jsonl");
                    if (fullLog.isFile() && fullLog.canRead()) {
                        logFile = fullLog;
                    } else {
                        continue;
                    }
                }

                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(new FileInputStream(logFile), StandardCharsets.UTF_8))) {
                    String line;
                    int lineCount = 0;
                    String firstUserPrompt = "";

                    while ((line = reader.readLine()) != null) {
                        lineCount++;
                        // Fast substring check before JSON parsing
                        if (!line.toLowerCase().contains(queryLower)) {
                            // Still capture prompt for title if empty
                            if (firstUserPrompt.isEmpty() && line.contains("USER_INPUT") && line.contains("content")) {
                                try {
                                    JSONObject pObj = new JSONObject(line);
                                    String c = pObj.optString("content", "");
                                    if (!c.isEmpty()) {
                                        firstUserPrompt = cleanTitle(c);
                                    }
                                } catch (Throwable ignored) {}
                            }
                            continue;
                        }

                        JSONObject stepObj;
                        try {
                            stepObj = new JSONObject(line);
                        } catch (Exception ex) {
                            continue;
                        }

                        int stepIndex = stepObj.optInt("step_index", lineCount - 1);
                        String content = stepObj.optString("content", "");
                        String thinking = stepObj.optString("thinking", "");

                        if (firstUserPrompt.isEmpty() && "USER_INPUT".equals(stepObj.optString("type"))) {
                            firstUserPrompt = cleanTitle(content);
                        }

                        // Search in content
                        if (!content.isEmpty()) {
                            totalMatches = searchInText(cid, firstUserPrompt, stepIndex, content, cleanQuery, queryLower, results, totalMatches);
                            if (totalMatches >= MAX_RESULTS) break;
                        }

                        // Also search in thinking if space permits
                        if (totalMatches < MAX_RESULTS && !thinking.isEmpty()) {
                            totalMatches = searchInText(cid, firstUserPrompt, stepIndex, thinking, cleanQuery, queryLower, results, totalMatches);
                            if (totalMatches >= MAX_RESULTS) break;
                        }
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "failed searching convo " + cid + ": " + t.getMessage());
                }

                if (totalMatches >= MAX_RESULTS) break;
            }
            if (totalMatches >= MAX_RESULTS) break;
        }

        return results.toString();
    }

    private static int searchInText(String cid, String title, int stepIndex, String text,
                                    String cleanQuery, String queryLower, JSONArray results, int currentMatches) {
        String textLower = text.toLowerCase();
        int idx = textLower.indexOf(queryLower);

        while (idx >= 0 && currentMatches < MAX_RESULTS) {
            // Find line bounds around idx for readable sentence/line snippet
            int lineStart = text.lastIndexOf('\n', idx);
            lineStart = lineStart >= 0 ? lineStart + 1 : Math.max(0, idx - SNIPPET_CONTEXT_CHARS);

            int lineEnd = text.indexOf('\n', idx + cleanQuery.length());
            lineEnd = lineEnd >= 0 ? lineEnd : Math.min(text.length(), idx + cleanQuery.length() + SNIPPET_CONTEXT_CHARS);

            // Cap snippet length
            int snippetStart = Math.max(lineStart, idx - SNIPPET_CONTEXT_CHARS);
            int snippetEnd = Math.min(lineEnd, idx + cleanQuery.length() + SNIPPET_CONTEXT_CHARS);

            String rawSnippet = text.substring(snippetStart, snippetEnd).replace('\r', ' ').replace('\n', ' ').trim();
            if (rawSnippet.isEmpty()) rawSnippet = cleanQuery;

            String prefix = snippetStart > 0 ? "... " : "";
            String suffix = snippetEnd < text.length() ? " ..." : "";
            String fullSnippet = prefix + rawSnippet + suffix;

            // Compute exact highlight match range in snippet
            int matchInRaw = rawSnippet.toLowerCase().indexOf(queryLower);
            int startOffset = matchInRaw >= 0 ? prefix.length() + matchInRaw : prefix.length();
            int endOffset = startOffset + cleanQuery.length();

            try {
                JSONObject matchObj = new JSONObject();
                matchObj.put("cascadeId", cid);
                if (title != null && !title.isEmpty()) {
                    matchObj.put("title", title);
                }
                matchObj.put("matchedStepIndex", stepIndex);
                matchObj.put("snippet", fullSnippet);
                matchObj.put("uniqueId", cid + ":" + stepIndex + ":" + idx);

                JSONArray ranges = new JSONArray();
                JSONObject range = new JSONObject();
                range.put("startOffset", startOffset);
                range.put("endOffsetExclusive", endOffset);
                ranges.put(range);
                matchObj.put("snippetMatchRanges", ranges);

                results.put(matchObj);
                currentMatches++;
            } catch (Throwable ignored) {}

            // Find next occurrence in this text
            idx = textLower.indexOf(queryLower, idx + Math.max(1, cleanQuery.length()));
        }

        return currentMatches;
    }

    private static String cleanTitle(String rawPrompt) {
        if (rawPrompt == null) return "";
        String s = rawPrompt;
        if (s.contains("<USER_REQUEST>")) {
            int start = s.indexOf("<USER_REQUEST>") + 14;
            int end = s.indexOf("</USER_REQUEST>", start);
            s = end > start ? s.substring(start, end) : s.substring(start);
        }
        s = s.replace('\r', ' ').replace('\n', ' ').trim();
        while (s.startsWith("/") && s.contains(" ")) {
            s = s.substring(s.indexOf(' ') + 1).trim();
        }
        if (s.length() > 60) {
            s = s.substring(0, 57) + "...";
        }
        return s;
    }
}
