// background.js (Service Worker 脚本，支持实时推送)

const interceptedImageUrls = [];
const MAX_URLS = 100;
let isCapturing = false;

// **核心：存储所有打开的 popup 窗口的 Port 连接**
const connectedPorts = new Set();

// --- 辅助函数：向所有打开的 popup 推送最新列表 ---
function pushUpdateToPopups() {
    connectedPorts.forEach(port => {
        try {
            port.postMessage({
                action: "updateList",
                urls: interceptedImageUrls
            });
        } catch (e) {
            // 如果发送失败，说明 Port 已失效，将其移除
            connectedPorts.delete(port);
        }
    });
}

// --- webRequest 监听器：网络层拦截 ---
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        let wasNewImage = false;
        // 检查是否在捕获状态，类型是否为图片，并且不是来自扩展程序内部的请求
        if (isCapturing && details.type === "image" && !details.url.startsWith("chrome-extension://")) {
            const url = details.url;
            if (!interceptedImageUrls.includes(url)) {
                interceptedImageUrls.unshift(url);
                if (interceptedImageUrls.length > MAX_URLS) {
                    interceptedImageUrls.pop();
                }
                console.log("WebRequest Intercepted:", url);
                wasNewImage = true;
            }
        }
        if (details.statusCode < 200 || details.statusCode >= 300) {
            return; // 非成功响应不处理
        }

        // 如果捕获到新图片，立即推送更新
        if (wasNewImage) {
            pushUpdateToPopups();
        }

        return { cancel: false };
    },
    { urls: ["<all_urls>"] },
    ["blocking"] // 需要 'webRequestBlocking' 权限
);

// --- Port 连接监听器：处理来自 popup 的通信 ---
chrome.runtime.onConnect.addListener(port => {
    // 确保是我们的 popup 连接
    if (port.name !== "popup-channel") return;

    // 1. 添加新的连接
    connectedPorts.add(port);
    console.log("Popup connected. Total connections:", connectedPorts.size);

    // 2. 监听来自 popup 的消息
    port.onMessage.addListener(request => {
        if (request.action === "getInitialImages") {
            // 响应初始数据请求
            port.postMessage({
                action: "updateList",
                urls: interceptedImageUrls,
            });
            // 发送当前的捕获状态
            port.postMessage({ action: "toggleStatus", isCapturing: isCapturing });

        } else if (request.action === "toggleCapture") {
            isCapturing = !isCapturing;
            // 状态改变，向所有 popup 推送状态更新
            connectedPorts.forEach(p => p.postMessage({ action: "toggleStatus", isCapturing: isCapturing }));

        } else if (request.action === "clearImages") {
            interceptedImageUrls.length = 0;
            // 清空后，向所有 popup 推送清空消息和更新列表
            connectedPorts.forEach(p => p.postMessage({ action: "cleared" }));
            pushUpdateToPopups();
        }
    });

    // 3. 处理连接断开
    port.onDisconnect.addListener(() => {
        connectedPorts.delete(port);
        console.log("Popup disconnected. Total connections:", connectedPorts.size);
    });
});

// --- 接收来自 content.js/injector.js 的数据 (处理非 webRequest 捕获) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "foundImages") {
        if (!isCapturing) {
            sendResponse({ success: false });
            return true;
        }

        let wasNewImage = false;
        request.urls.forEach(url => {
            if (!interceptedImageUrls.includes(url)) {
                interceptedImageUrls.unshift(url);
                if (interceptedImageUrls.length > MAX_URLS) {
                    interceptedImageUrls.pop();
                }
                wasNewImage = true;
            }
        });

        // 如果捕获到新图片，立即推送更新
        if (wasNewImage) {
            pushUpdateToPopups();
        }

        sendResponse({ success: true });
        return true;
    }
});