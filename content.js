// content.js

// --- DOM 观察和图片查找 (添加去抖动优化) ---

let debounceTimer;

/**
 * 查找 DOM 中的图片 URL 并发送到 Service Worker。
 */
function findAndSendImageUrls() {
    // 立即停止所有待处理的发送请求
    clearTimeout(debounceTimer);

    // 延迟发送，等待 DOM 变化稳定
    debounceTimer = setTimeout(() => {
        const images = document.querySelectorAll('img, [style*="background-image"]');
        const urls = [];

        images.forEach((el) => {
            let src = "";
            if (el.tagName === "IMG") {
                // 捕获 src 或 data-src（懒加载）
                src = el.src || el.getAttribute("data-src");
            } else {
                // 捕获背景图片 URL
                const style = el.style.backgroundImage || el.style.background;
                const match = style.match(/url\(['"]?(.*?)['"]?\)/);
                if (match && match[1]) {
                    // 确保 URL 是合法的 HTTP/HTTPS 链接
                    src = match[1];
                }
            }
            if (src && isImageUrl(src) && !urls.includes(src)) {
                urls.push(src);
            }
        });

        if (urls.length > 0) {
            // 将发现的图片 URL 发送给 background.js 存储 (无需修改，使用 chrome.runtime.sendMessage)
            chrome.runtime.sendMessage({
                action: "foundImages",
                urls: urls,
            });
        }
    }, 10); // 去抖动延迟 10 毫秒
}

// 首次执行查找
findAndSendImageUrls();

// 监听DOM变化（用于捕获懒加载或动态插入的图片）
// 注意：MutationObserver 会非常频繁地触发 findAndSendImageUrls，去抖动是必要的。
const observer = new MutationObserver(findAndSendImageUrls);

if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "data-src", "style"],
    });
} else {
    // 处理 document.body 尚未加载的情况
    document.addEventListener("DOMContentLoaded", () => {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["src", "data-src", "style"],
            });
        }
    });
}
