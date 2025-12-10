// injector.js

(function () {
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
        let absoluteUrl = url;

        // 1. 将相对 URL 转换为绝对 URL，并保存到 XHR 实例上
        try {
            absoluteUrl = new URL(url, window.location.href).href;
        } catch (e) {
            absoluteUrl = url;
        }

        this._interceptedUrl = absoluteUrl;

        // 2. 绑定事件监听器，在请求完成时进行状态码过滤
        this.onload = function () {
            // 检查 Content-Type (排除 text/html, application/json 等)
            const contentType = this.getResponseHeader('Content-Type');
            if (!isImageContentType(contentType)) {
                return;
            }
        };

        return originalXHRopen.apply(this, arguments);
    };

    console.log("注入成功: Fetch 和 XHR 已被劫持。");
})();