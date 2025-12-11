// utils.js

/**
 * 辅助函数：判断是否为图片URL (在所有脚本中保持一致)
 */
function isImageUrl(url) {
    // 1. 基本校验
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;

    // (jpe?g|png|webp|svg|bmp|tif|tiff|ico) 匹配常见图片格式
    const imagePattern = /(jpg|jpeg|png|webp|svg|bmp|tif|tiff|ico)/i;

    // --- 步骤 1: 图片白名单检查 (同时检查路径和查询参数) ---
    if (imagePattern.test(url)) {

        // 排除黑名单文件（仅检查路径部分，避免误杀）
        const blacklistExtensions = /\.(json|xml|html|js|css|txt|pdf)/i;
        if (blacklistExtensions.test(url)) {
            return false;
        }
        return true;
    }

    // --- 步骤 2: 严格启发式关键词（作为后备，仅检查路径） ---
    // 检查路径中是否包含 /image/ 或 /img/
    if (url.includes('/image/') || url.includes('/img/')) {
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