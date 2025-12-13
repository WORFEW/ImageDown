// background.js 使用 chrome.storage.local 同步数据

// 使用 chrome.storage 存储数据，但为了快速访问和避免频繁 I/O，
// 仍然在内存中维护核心数据。在扩展程序启动时，可以尝试从 storage 加载。

importScripts("utils.js");

let interceptedImageUrls = [];
let maxUrlsLimit = 100; // 新增：最大 URL 数量限制
let isCapturing = false;

// --- 辅助函数：将最新数据和状态写入存储 (取代 pushUpdateToPopups) ---
function saveAndNotify(urls, capturingState, newLimit = maxUrlsLimit) {
    // 1. 更新内存中的变量
    interceptedImageUrls = urls;
    isCapturing = capturingState;
    maxUrlsLimit = newLimit;

    // 2. 将新值写入存储，这将触发所有打开的 popup 中的 chrome.storage.onChanged
    chrome.storage.local.set({
        capturedUrls: interceptedImageUrls,
        isCapturing: isCapturing,
        maxUrlsLimit: maxUrlsLimit,
    });
}

// --- 初始化/恢复状态：在 Service Worker 启动时尝试加载存储的数据 ---
function initializeState() {
    chrome.storage.local.get(["capturedUrls", "isCapturing", "maxUrlsLimit"], (result) => {
        interceptedImageUrls = result.capturedUrls || [];
        isCapturing = result.isCapturing || false;
        maxUrlsLimit = result.maxUrlsLimit || 100; // 新增：加载限制值，默认 100
        console.log(
            `初始化状态, 捕获状态: ${isCapturing}, 图片数量: ${interceptedImageUrls.length} , 最大限制: ${maxUrlsLimit}`
        );
    });
}

// 在 Service Worker 启动时执行初始化
initializeState();

// --- webRequest 监听器：网络层拦截 ---
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        if (
            !isCapturing ||
            details.type !== "image" ||
            details.url.startsWith("chrome-extension://") ||
            !isImageUrl(details.url)
        ) {
            return { cancel: false };
        }

        const url = details.url;
        let wasNewImage = false;

        if (!interceptedImageUrls.includes(url)) {
            // 1. 更新列表
            const newUrls = [url, ...interceptedImageUrls];
            if (newUrls.length > maxUrlsLimit) {
                newUrls.pop();
            }
            interceptedImageUrls = newUrls; // 更新内存引用
            wasNewImage = true;
        }

        // 2. 如果捕获到新图片，立即保存并通知
        if (wasNewImage) {
            // 立即将新列表保存到存储中
            saveAndNotify(interceptedImageUrls, isCapturing);
        }

        return { cancel: false };
    },
    { urls: ["<all_urls>"] }
);

// --- **核心变化**：使用 chrome.runtime.onMessage 监听来自 popup 的请求 ---
// 这取代了 Port 连接监听器 chrome.runtime.onConnect

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ----------------------------------------------------
    // 处理来自 Popup 的操作请求
    // ----------------------------------------------------
    if (sender.url && sender.url.includes("popup.html")) {
        if (request.action === "toggleCapture") {
            const newCapturingState = !isCapturing;
            // 状态改变，保存并通知
            saveAndNotify(interceptedImageUrls, newCapturingState);
            sendResponse({ success: true, isCapturing: newCapturingState });
            return true;
        }

        if (request.action === "clearImages") {
            const emptyUrls = [];
            // 清空列表，保存并通知
            saveAndNotify(
                (urls = emptyUrls),
                (capturingState = isCapturing),
                (newLimit = maxUrlsLimit)
            );
            sendResponse({ success: true });
            return true;
        }
    }

    // ----------------------------------------------------
    // 接收来自 content.js 的数据 (处理非 webRequest 捕获)
    // ----------------------------------------------------
    if (request.action === "foundImages") {
        if (!isCapturing) {
            sendResponse({ success: false, reason: "Not capturing" });
            return true;
        }

        let wasNewImage = false;

        // 1. 更新列表
        const newUrls = [...interceptedImageUrls]; // 复制当前列表
        request.urls.forEach((url) => {
            if (!newUrls.includes(url)) {
                newUrls.unshift(url);
                wasNewImage = true;
            }
        });

        if (newUrls.length > maxUrlsLimit) {
            newUrls.splice(maxUrlsLimit); // 截断到最大长度
        }

        // 2. 如果捕获到新图片，立即保存并通知
        if (wasNewImage) {
            // 使用新列表保存并通知
            saveAndNotify((urls = newUrls), (capturingState = isCapturing));
        }

        sendResponse({ success: true });
        return true;
    }
    // ----------------------------------------------------
    // 处理设置最大 URL 数量限制的请求
    // ----------------------------------------------------
    if (request.action === "setMaxUrls") {
        const upLimit = parseInt(request.limit, 10);

        // 校验输入
        if (!isNaN(upLimit) && upLimit >= 100 && upLimit <= 1000) {
            // 限制一个合理的最大值
            // 仅更新限制，不修改图片列表
            saveAndNotify(
                (urls = interceptedImageUrls),
                (capturingState = isCapturing),
                (newLimit = upLimit)
            );
            sendResponse({ success: true, newLimit: upLimit });
        } else {
            sendResponse({
                success: false,
                reason: "最大限制值无效或超出范围, 限制为 100 到 1000",
            });
        }
        return true;
    }

    // 必须返回 true 以指示异步响应，即使我们不使用 sendResponse
    return false;
});
