// injector.js

(function () {

    // --- 辅助函数：判断是否为图片URL ---
    function isImageUrl(url) {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;

        // 清理 URL，移除查询参数和哈希，转为小写进行匹配
        const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();

        // --- 1. 黑名单排除 ---
        // 明确排除常见的非图片文件扩展名
        const blacklistExtensions = /\.(json|xml|html|js|css|txt)(\?.*)?$/i;
        if (blacklistExtensions.test(cleanUrl)) {
            return false;
        }

        // --- 2. 白名单/启发式判断 ---
        // A) 图片扩展名白名单
        const imageExtensions = /\.(jpg|jpeg|png|webp|svg|bmp)(\?.*)?$/i;
        if (imageExtensions.test(cleanUrl)) {
            return true;
        }

        // B) 启发式关键词（作为后备）
        // 只有在扩展名不明确时，才依赖关键词
        if (cleanUrl.includes('image') || cleanUrl.includes('img')) {
            return true;
        }

        return false;
    }

    // --- 辅助函数：Content-Type 检查 ---
    function isImageContentType(contentType) {
        if (!contentType) return false;
        const cleanType = contentType.split(';')[0].toLowerCase();
        // 排除 text/html, application/json 等明确的非图片类型
        if (cleanType.includes('text/') || cleanType.includes('application/json')) {
            return false;
        }
        // 检查是否为 image/*
        return cleanType.startsWith('image/');
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
            const finalUrl = this._interceptedUrl;

            // 核心过滤 1: 检查 HTTP 状态码 (仅处理 2xx 成功响应)
            if (this.status < 200 || this.status >= 300) {
                return;
            }

            // 核心过滤 2: 检查 Content-Type (排除 text/html, application/json 等)
            const contentType = this.getResponseHeader('Content-Type');
            if (!isImageContentType(contentType)) {
                return;
            }

            // 核心过滤 3: 检查 URL 启发式规则 (排除黑名单扩展名)
            if (isImageUrl(finalUrl)) {
                notifyContentScript(finalUrl);
            }
        };

        return originalXHRopen.apply(this, arguments);
    };

    console.log("Injection successful: Fetch and XHR are hijacked.");
})();