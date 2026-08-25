package com.waiyuan.share;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;

import java.util.Locale;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 外院知识分享站 · Capacitor 入口
 * 2026-08-23 下载支持：
 *  1) DownloadListener：接管 <a download> 的 http(s) 下载（如 APK），
 *     用系统 DownloadManager 下载到公共「下载」目录并弹通知栏；
 *  2) NativeSave 桥：blob:/data: 内容（导出 PDF、分享卡 PNG、题库 JSON）
 *     由前端 WaiyuanNativeDownload 转 base64 后经此桥保存，同样落到「下载」目录。
 */
public class MainActivity extends BridgeActivity {

    private final ExecutorService imageSaveExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onDestroy() {
        imageSaveExecutor.shutdownNow();
        super.onDestroy();
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        // Android 15+（targetSdk 36）强制 edge-to-edge：内容会画到状态栏/导航栏底下，
        // 顶部按钮（返回等）被系统时间区遮挡。用 WindowInsets 给 WebView 加系统栏 padding。
        // Capacitor SystemBars 插件会消费/改写 insets（默认 css 模式），WebView 收不到系统栏 insets，
        // 因此不依赖 insets 分派：直接同步读取系统状态栏高度设置 padding，绝对生效。
        // 双保险：post 到主线程（WebView attach 后）读 dimen + rootWindowInsets 取最大；
        // 父容器 fitsSystemWindows 已处理则不重复设置（避免双倍空隙）。
        webView.post(() -> {
            int padTop = getStatusBarHeight();
            WindowInsetsCompat root = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
            if (root != null) {
                padTop = Math.max(padTop, root.getInsets(WindowInsetsCompat.Type.systemBars()).top);
            }
            View pv = (View) webView.getParent();
            int pTop = pv != null ? pv.getPaddingTop() : 0;
            if (padTop > 0 && pTop == 0) {
                webView.setPadding(0, padTop, 0, 0);
            }
        });
        // 兜底：横竖屏切换/insets 变化时保持顶部避让（navigationBar 高度同时处理）
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            View pv = (View) v.getParent();
            int pTop = pv != null ? pv.getPaddingTop() : 0;
            int padTop = Math.max(bars.top, getStatusBarHeight());
            if (padTop > 0 && pTop == 0) {
                v.setPadding(0, padTop, 0, bars.bottom);
            }
            return insets;
        });
        // 系统返回（实体按键 + Android 13+ 左右边缘滑动手势）：站内后退优先，站内无历史时才退出 App。
        // 注：Capacitor 8 核心不含 back 处理（back 逻辑在 @capacitor/app 插件中，本工程未安装），
        // 不处理时系统返回/边缘手势会直接 finish 退出整个 App。
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView wv = getBridge().getWebView();
                if (wv != null && wv.canGoBack()) {
                    wv.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
        webView.addJavascriptInterface(new NativeSaveBridge(), "NativeSave");
        webView.addJavascriptInterface(new NativeOpenBridge(), "NativeOpen");
        // Android WebView 默认长按图片只显示系统菜单；部分版本/页面会直接吞掉该菜单。
        // 在原生层接管图片长按，统一提供「保存图片」并写入系统「下载」目录。
        webView.setOnLongClickListener(v -> {
            WebView.HitTestResult hit = webView.getHitTestResult();
            if (hit == null) return false;
            int type = hit.getType();
            String imageUrl = hit.getExtra();
            if ((type == WebView.HitTestResult.IMAGE_TYPE
                    || type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE)
                    && imageUrl != null && !imageUrl.trim().isEmpty()) {
                showImageSaveDialog(imageUrl);
                return true;
            }
            return false;
        });
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null || url.startsWith("blob:") || url.startsWith("data:")) {
                return; // blob/data 由前端 NativeSave 通道处理
            }
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
                if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
                request.setMimeType(mimeTypeForFile(fileName, mimetype));
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                dm.enqueue(request);
                runOnUiThread(() -> Toast.makeText(this, "正在下载：" + fileName, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this, "下载失败：" + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    /** 供网页端判断：二维码长按交给原生层，避免 JS 菜单与原生菜单重复弹出。 */
    private class NativeSaveBridge {
        @JavascriptInterface
        public boolean supportsImageLongPress() {
            return true;
        }

        @JavascriptInterface
        public boolean saveBase64(String fileName, String base64) {
            try {
                if (base64 == null || base64.isEmpty()) throw new Exception("empty data");
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                saveBytesToDownloads(fileName, null, data);
                String safe = safeFileName(fileName);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存：" + safe, Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "保存失败：" + e.getMessage(), Toast.LENGTH_SHORT).show());
                return false;
            }
        }
    }

    /** 图片长按菜单：保留取消入口，避免误触直接产生文件。 */
    private void showImageSaveDialog(String imageUrl) {
        new AlertDialog.Builder(this)
                .setTitle("图片操作")
                .setItems(new String[]{"保存图片"}, (dialog, which) -> saveImage(imageUrl))
                .setNegativeButton("取消", null)
                .show();
    }

    private void saveImage(String imageUrl) {
        String url = imageUrl.trim();
        if (url.startsWith("data:")) {
            saveDataImage(url);
            return;
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            Toast.makeText(this, "当前图片暂不支持保存，请截图保存", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
            String fileName = URLUtil.guessFileName(url, null, "image/*");
            if (fileName == null || fileName.trim().isEmpty() || !fileName.contains(".")) {
                fileName = "图片-" + System.currentTimeMillis() + ".jpg";
            }
            request.setTitle(fileName);
            request.setMimeType(mimeTypeForFile(fileName, "image/*"));
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeFileName(fileName));
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) throw new Exception("DownloadManager unavailable");
            dm.enqueue(request);
            Toast.makeText(this, "正在保存图片：" + safeFileName(fileName), Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "保存失败：" + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void saveDataImage(String dataUrl) {
        int comma = dataUrl.indexOf(',');
        if (comma <= 5 || comma >= dataUrl.length() - 1 || !dataUrl.substring(0, comma).contains(";base64")) {
            Toast.makeText(this, "图片格式暂不支持，请截图保存", Toast.LENGTH_SHORT).show();
            return;
        }
        String header = dataUrl.substring(5, comma);
        String mime = header.substring(0, header.indexOf(';'));
        String ext = mime.endsWith("png") ? ".png" : (mime.endsWith("webp") ? ".webp" : ".jpg");
        String fileName = "图片-" + System.currentTimeMillis() + ext;
        String base64 = dataUrl.substring(comma + 1);
        imageSaveExecutor.execute(() -> {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                saveBytesToDownloads(fileName, mime, data);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存：" + fileName, Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "保存失败：" + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    private void saveBytesToDownloads(String fileName, String mime, byte[] data) throws Exception {
        if (data == null || data.length == 0) throw new Exception("empty data");
        ContentValues values = new ContentValues();
        String safe = safeFileName(fileName);
        values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeTypeForFile(safe, mime));
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("MediaStore insert failed");
        try {
            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                if (os == null) throw new Exception("open output failed");
                os.write(data);
            }
        } catch (Exception e) {
            getContentResolver().delete(uri, null, null);
            throw e;
        }
    }

    private String safeFileName(String fileName) {
        return (fileName == null || fileName.trim().isEmpty() ? "file" : fileName)
                .replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    /** 读取系统状态栏高度（含刘海屏安全高度） */
    private int getStatusBarHeight() {
        int result = 0;
        int resourceId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resourceId > 0) {
            result = getResources().getDimensionPixelSize(resourceId);
        }
        return result;
    }

    /** 前端 window.NativeOpen.openExternal(url)：用系统方式打开外部链接（如唤起微信扫一扫） */
    private class NativeOpenBridge {
        @JavascriptInterface
        public boolean openExternal(String url) {
            try {
                if (url == null || url.trim().isEmpty()) return false;
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    private String mimeTypeForFile(String fileName, String fallback) {
        String lower = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".apk")) return "application/vnd.android.package-archive";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".json")) return "application/json";
        return fallback == null || fallback.isEmpty() ? "application/octet-stream" : fallback;
    }
}
