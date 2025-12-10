// background.js 使用 chrome.storage.local 同步数据

// 使用 chrome.storage 存储数据，但为了快速访问和避免频繁 I/O，
// 我们仍然在内存中维护核心数据。在扩展程序启动时，可以尝试从 storage 加载。

let interceptedImageUrls = [];
const MAX_URLS = 100;
let isCapturing = false;

// --- 辅助函数：将最新数据和状态写入存储 (取代 pushUpdateToPopups) ---
function saveAndNotify(urls, capturingState, isListCleared = false) {
    // 1. 更新内存中的变量
    interceptedImageUrls = urls;
    isCapturing = capturingState;

    // 2. 将新值写入存储，这将触发所有打开的 popup 中的 chrome.storage.onChanged
    chrome.storage.local.set({
        capturedUrls: interceptedImageUrls,
        isCapturing: isCapturing
    });
    
    // 如果是清空操作，通常不需要额外通知，因为 capturedUrls: [] 已经触发更新
}

// --- 初始化/恢复状态：在 Service Worker 启动时尝试加载存储的数据 ---
function initializeState() {
    chrome.storage.local.get(['capturedUrls', 'isCapturing'], (result) => {
        interceptedImageUrls = result.capturedUrls || [];
        isCapturing = result.isCapturing || false;
        console.log(`Service Worker loaded state. Capturing: ${isCapturing}, Images: ${interceptedImageUrls.length}`);
    });
}

// 在 Service Worker 启动时执行初始化
initializeState();


// --- webRequest 监听器：网络层拦截 ---
chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
        if (!isCapturing || details.type !== "image" || details.url.startsWith("chrome-extension://")) {
            return { cancel: false };
        }
        
        // 检查非成功响应 (尽管 webRequest 通常只拦截请求，但在某些模式下可能需要)
        if (details.statusCode < 200 || details.statusCode >= 300) {
            return { cancel: false };
        }

        const url = details.url;
        let wasNewImage = false;

        if (!interceptedImageUrls.includes(url)) {
            // 1. 更新列表
            const newUrls = [url, ...interceptedImageUrls];
            if (newUrls.length > MAX_URLS) {
                newUrls.pop();
            }
            interceptedImageUrls = newUrls; // 更新内存引用
            wasNewImage = true;
            console.log("WebRequest Intercepted:", url);
        }

        // 2. 如果捕获到新图片，立即保存并通知
        if (wasNewImage) {
            // 立即将新列表保存到存储中
            saveAndNotify(interceptedImageUrls, isCapturing);
        }

        return { cancel: false };
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
);

// --- **核心变化**：使用 chrome.runtime.onMessage 监听来自 popup 的请求 ---
// 这取代了 Port 连接监听器 chrome.runtime.onConnect

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // ----------------------------------------------------
    // 处理来自 Popup 的操作请求 (取代 Port.onMessage 监听器中的逻辑)
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
            saveAndNotify(emptyUrls, isCapturing, true);
            sendResponse({ success: true });
            return true;
        }
    }
    
    // ----------------------------------------------------
    // 接收来自 content.js/injector.js 的数据 (处理非 webRequest 捕获)
    // ----------------------------------------------------
    if (request.action === "foundImages") {
        if (!isCapturing) {
            sendResponse({ success: false, reason: "Not capturing" });
            return true;
        }

        let wasNewImage = false;
        
        // 1. 更新列表
        const newUrls = [...interceptedImageUrls]; // 复制当前列表
        request.urls.forEach(url => {
            if (!newUrls.includes(url)) {
                newUrls.unshift(url);
                wasNewImage = true;
            }
        });
        
        if (newUrls.length > MAX_URLS) {
            newUrls.splice(MAX_URLS); // 截断到最大长度
        }
        
        // 2. 如果捕获到新图片，立即保存并通知
        if (wasNewImage) {
            // 使用新列表保存并通知
            saveAndNotify(newUrls, isCapturing);
        }

        sendResponse({ success: true });
        return true;
    }
    
    // 必须返回 true 以指示异步响应，即使我们不使用 sendResponse
    return false;
});