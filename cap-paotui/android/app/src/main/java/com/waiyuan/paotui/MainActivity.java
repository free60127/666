package com.waiyuan.paotui;

import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * 外院跑腿 · Capacitor 入口
 * 2026-08-23 下载支持：
 *  1) DownloadListener：接管 <a download> 的 http(s) 下载（如 APK），
 *     用系统 DownloadManager 下载到公共「下载」目录并弹通知栏；
 *  2) NativeSave 桥：blob:/data: 内容（分享卡 PNG 等）
 *     由前端 WaiyuanNativeDownload 转 base64 后经此桥保存，同样落到「下载」目录。
 */
public class MainActivity extends BridgeActivity {

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativeSaveBridge(), "NativeSave");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) {
                return; // blob/data 由前端 NativeSave 通道处理
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimetype == null || mimetype.isEmpty() ? "application/octet-stream" : mimetype);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
                if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(request);
                runOnUiThread(() -> Toast.makeText(this, "正在下载：" + fileName, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "下载失败：" + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    /** 前端 window.NativeSave.saveBase64(name, base64) 保存内容文件到「下载」目录 */
    private class NativeSaveBridge {
        @JavascriptInterface
        public void saveBase64(String fileName, String base64) {
            try {
                if (base64 == null || base64.isEmpty()) throw new Exception("empty data");
                String safe = (fileName == null || fileName.trim().isEmpty() ? "file" : fileName)
                        .replaceAll("[\\\\/:*?\"<>|]", "_");
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    values.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new Exception("MediaStore insert failed");
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(data);
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("cannot create Downloads dir");
                    File out = new File(dir, safe);
                    try (FileOutputStream fos = new FileOutputStream(out)) {
                        fos.write(data);
                    }
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存：" + safe, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "保存失败：" + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }
    }
}
