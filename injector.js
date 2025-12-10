// injector.js

(function () {

    // --- 辅助函数：判断是否为图片URL ---
    function isImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        // 简单的启发式判断
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i;
        return imageExtensions.test(url) || url.includes('image') || url.includes('img');
    }

    // --- 通知内容脚本（通过自定义事件）---
    function notifyContentScript(url) {
        // 使用 window 上的自定义事件通信，因为 injector.js 和 content.js 运行在不同的作用域
        window.dispatchEvent(new CustomEvent('interceptedRequest', {
            detail: { url: url }
        }));
    }

    // --- 1. 劫持 Fetch API ---
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
        const url = args[0] instanceof Request ? args[0].url : args[0];

        if (isImageUrl(url)) {
            notifyContentScript(url);
        }

        return originalFetch.apply(this, args);
    };

    // --- 2. 劫持 XMLHttpRequest ---
    const originalXHRopen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        // 在 open 阶段捕获 URL
        if (isImageUrl(url)) {
            // 注意：此时只能获取 URL，请求类型需要在 send 后判断
            notifyContentScript(url);
        }

        // 绑定事件监听器，也可以在请求完成后进一步检查响应类型
        this.addEventListener('load', function () {
            if (this.status >= 200 && this.status < 300) {
                // 如果请求成功且 URL 仍未被 webRequest 捕获，则可以再次确认
                // 但为了避免重复，我们依赖 open 时的 URL 启发式判断。
            }
        });

        // 调用原始的 open 方法
        return originalXHRopen.apply(this, arguments);
    };

    console.log("Injection successful: Fetch and XHR are hijacked.");
})();