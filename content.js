// content.js

// --- 1. 注入 injector.js ---
function injectScript(file_path) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(file_path);
    // 脚本加载完成后移除，保持DOM干净
    s.onload = function () {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
}
injectScript('injector.js');

// --- 2. 监听 injector.js 发来的数据 ---
window.addEventListener('interceptedRequest', function (e) {
    if (e.detail && e.detail.url) {
        // 将劫持到的 URL 转发给 background.js
        chrome.runtime.sendMessage({
            action: "foundImages",
            urls: [e.detail.url]
        });
    }
}, false);

// --- 3. DOM 观察和图片查找 ---

function findAndSendImageUrls() {
    const images = document.querySelectorAll('img, [style*="background-image"]');
    const urls = [];

    images.forEach(el => {
        let src = '';
        if (el.tagName === 'IMG') {
            // 捕获 src 或 data-src（懒加载）
            src = el.src || el.getAttribute('data-src');
        } else {
            // 捕获背景图片 URL
            const style = el.style.backgroundImage || el.style.background;
            const match = style.match(/url\(['"]?(.*?)['"]?\)/);
            if (match && match[1]) {
                src = match[1];
            }
        }

        if (src && src.startsWith('http')) {
            urls.push(src);
        }
    });

    if (urls.length > 0) {
        // 将发现的图片 URL 发送给 background.js 存储
        chrome.runtime.sendMessage({
            action: "foundImages",
            urls: urls
        });
    }
}

// 首次执行查找
findAndSendImageUrls();

// 监听DOM变化（用于捕获懒加载或动态插入的图片）
const observer = new MutationObserver(findAndSendImageUrls);

if (document.body) {
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'data-src', 'style'] // 监听 style 变化以捕获背景图片
    });
} else {
    // 处理 document.body 尚未加载的情况
    document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'data-src', 'style']
            });
        }
    });
}