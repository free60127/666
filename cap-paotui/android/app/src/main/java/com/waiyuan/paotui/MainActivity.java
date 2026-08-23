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
import android.view.View;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

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

    /** 读取系统状态栏高度（含刘海屏安全高度） */
    private int getStatusBarHeight() {
        int result = 0;
        int resourceId = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resourceId > 0) {
            result = getResources().getDimensionPixelSize(resourceId);
        }
        return result;
    }

    /** 前端 window.NativeSave.saveBase64(name, base64) 保存内容文件到「下载」目录 */
    private class NativeSaveBridge {
        @JavascriptInterface
        public boolean saveBase64(String fileName, String base64) {
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
                }
                // minSdk 29（Android 10+）：MediaStore 写入公共「下载」目录，无需存储权限
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "已保存：" + safe, Toast.LENGTH_SHORT).show());
                return true;
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "保存失败：" + e.getMessage(), Toast.LENGTH_SHORT).show());
                return false;
            }
        }
    }
}
