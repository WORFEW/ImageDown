// utils.js

/**
 * 辅助函数：判断是否为图片URL (在所有脚本中保持一致)
 */
function isImageUrl(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;

    // 清理 URL：移除查询参数和哈希
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();

    // 1. 黑名单排除 (明确排除 .json, .html 等文件)
    const blacklistExtensions = /\.(json|xml|html|js|css|txt)(\?.*)?$/i;
    if (blacklistExtensions.test(cleanUrl)) {
        return false;
    }

    // 2. 图片扩展名白名单
    const imageExtensions = /\.(jpg|jpeg|png|webp|svg|bmp|gif)(\?.*)?$/i;
    if (imageExtensions.test(cleanUrl)) {
        return true;
    }

    // 3. 严格启发式关键词（作为后备，仅检查路径）
    if (cleanUrl.includes('/image/') || cleanUrl.includes('/img/')) {
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