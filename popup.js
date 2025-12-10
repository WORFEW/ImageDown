// popup.js - 重构为使用 chrome.storage.onChanged 实现数据同步

document.addEventListener('DOMContentLoaded', () => {
    // --- UI 元素获取 ---
    const imageListContainer = document.getElementById('image-list-container');
    const toggleCaptureButton = document.getElementById('toggle-capture');
    const downloadButton = document.getElementById('download-selected');
    const copyButton = document.getElementById('copy-link-selected');
    const formatSelect = document.getElementById('format-select');
    const previewModal = document.getElementById('preview-modal');
    const previewImage = document.getElementById('preview-image');
    const closeBtn = document.querySelector('.close-btn');
    const imageCountTitle = document.getElementById('image-count-title');
    const clearImagesButton = document.getElementById('clear-images');
    const statusMessageElement = document.getElementById('status-message');
    const selectAllButton = document.getElementById('select-all');
    const urlLimitInput = document.getElementById('urlLimit');
    const saveLimitButton = document.getElementById('saveLimit');

    // **核心数据结构**
    let selectedUrls = new Set();
    let currentImageUrls = [];
    let isCapturing = false; // 跟踪当前捕获状态

    // --- 核心函数：显示无阻塞状态消息 ---
    function displayStatusMessage(message, duration = 3000, color = 'green') {
        clearTimeout(statusMessageElement.dataset.timeoutId);
        
        limitStatusMessage.style.color = color;
        statusMessageElement.textContent = message;
        statusMessageElement.classList.add('visible');

        const timeoutId = setTimeout(() => {
            statusMessageElement.classList.remove('visible');
        }, duration);

        statusMessageElement.dataset.timeoutId = timeoutId;
    }

    // --- 辅助函数：更新操作按钮状态 ---
    function updateActionButtons() {
        const hasSelection = selectedUrls.size > 0;
        downloadButton.disabled = !hasSelection;
        copyButton.disabled = !hasSelection;
        selectAllButton.disabled = currentImageUrls.length === 0;
    }

    // --- 捕获状态按钮更新 ---
    function updateToggleButton(capturingState) {
        isCapturing = capturingState; // 更新本地状态
        if (isCapturing) {
            toggleCaptureButton.textContent = '结束捕获';
            toggleCaptureButton.classList.remove('start-capture');
            toggleCaptureButton.classList.add('end-capture');
        } else {
            toggleCaptureButton.textContent = '开始捕获';
            toggleCaptureButton.classList.remove('end-capture');
            toggleCaptureButton.classList.add('start-capture');
        }
    }

    // --- 多选/切换选择逻辑 ---
    function toggleImageSelection(element, url) {
        element.classList.toggle('selected');
        if (element.classList.contains('selected')) {
            selectedUrls.add(url);
        } else {
            selectedUrls.delete(url);
        }
        updateActionButtons();
    }

    // --- 全选/取消全选逻辑 ---
    function selectAllImages() {
        const imageItems = imageListContainer.querySelectorAll('.image-item');
        const isCurrentlyAllSelected = selectedUrls.size === currentImageUrls.length && currentImageUrls.length > 0;

        if (isCurrentlyAllSelected) {
            selectedUrls.clear();
            imageItems.forEach(item => item.classList.remove('selected'));
        } else {
            selectedUrls.clear();
            imageItems.forEach(item => {
                const url = item.dataset.url;
                selectedUrls.add(url);
                item.classList.add('selected');
            });
        }
        updateActionButtons();
    }

    // --- 图片列表渲染 ---
    function renderImageList(urls) {
        imageListContainer.innerHTML = '';
        const count = urls.length;
        imageCountTitle.textContent = `已捕获的图片 (${count} 张)`;

        const newlyCapturedUrls = new Set(urls.filter(url => !currentImageUrls.includes(url)));
        currentImageUrls = urls;

        // --- 同步 selectedUrls ---
        if (urls.length === 0) {
            selectedUrls.clear();
        } else {
            const newSelection = new Set();
            urls.forEach(url => {
                if (selectedUrls.has(url)) {
                    newSelection.add(url);
                }
            });
            selectedUrls = newSelection;
        }

        updateActionButtons();

        if (count === 0) {
            imageListContainer.innerHTML = '<p class="no-images">当前没有捕获到的图片。请启动捕获并刷新页面。</p>';
            return;
        }

        urls.forEach(url => {
            const imgWrapper = document.createElement('div');

            if (selectedUrls.has(url)) {
                imgWrapper.classList.add('selected');
            }

            imgWrapper.classList.add('image-item');
            imgWrapper.dataset.url = url;

            if (newlyCapturedUrls.has(url)) {
                imgWrapper.classList.add('newly-captured');
                setTimeout(() => imgWrapper.classList.remove('newly-captured'), 500);
            }

            const img = document.createElement('img');
            img.src = url;
            img.loading = "lazy";

            img.onerror = function () {
                imgWrapper.style.backgroundColor = '#f0f0f0';
                img.style.display = 'none';
                const errorText = document.createElement('span');
                errorText.textContent = '无法预览';
                errorText.style.fontSize = '10px';
                errorText.style.color = '#666';
                errorText.style.textAlign = 'center';
                imgWrapper.appendChild(errorText);
            };

            imgWrapper.appendChild(img);
            imageListContainer.appendChild(imgWrapper);

            imgWrapper.addEventListener('click', () => toggleImageSelection(imgWrapper, url));
            imgWrapper.addEventListener('dblclick', () => openPreview(url));
        });
    }

    // --- 核心变化：使用 chrome.storage.onChanged 监听数据变化 ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes.capturedUrls) {
            const newUrls = changes.capturedUrls.newValue || [];
            renderImageList(newUrls);
            if (newUrls.length === 0 && (changes.capturedUrls.oldValue && changes.capturedUrls.oldValue.length > 0)) {
                displayStatusMessage("图片列表已清空。");
            }
        }

        if (changes.isCapturing) {
            updateToggleButton(changes.isCapturing.newValue);
        }
        // 新增：监听 MAX_URLS 限制的变化，并更新输入框
        if (changes.maxUrlsLimit) {
            urlLimitInput.value = changes.maxUrlsLimit.newValue;
        }
    });

    // --- 初始化：获取初始数据 ---
    function initializePopup() {
        chrome.storage.local.get(['capturedUrls', 'isCapturing', 'maxUrlsLimit'], (result) => {
            const urls = result.capturedUrls || [];
            const capturingState = result.isCapturing || false;
            const limitValue = result.maxUrlsLimit || 100; // 默认值 100

            renderImageList(urls);
            updateToggleButton(capturingState);
            urlLimitInput.value = limitValue;
        });
    }

    // --- 绑定事件监听器 (通过 chrome.runtime.sendMessage 发送请求) ---

    selectAllButton.addEventListener('click', selectAllImages);

    toggleCaptureButton.addEventListener('click', () => {
        // 使用短消息发送请求
        chrome.runtime.sendMessage({ action: "toggleCapture" })
            .catch(e => {
                console.error("Failed to send toggleCapture message:", e);
                displayStatusMessage("无法连接到后台服务。请重新打开面板。", 4000, 'red');
            });
    });

    clearImagesButton.addEventListener('click', () => {
        displayStatusMessage("正在清空图片列表...", 1000);
        // 使用短消息发送请求
        chrome.runtime.sendMessage({ action: "clearImages" })
            .catch(e => {
                console.error("Failed to send clearImages message:", e);
                displayStatusMessage("无法连接到后台服务。请重新打开面板", 4000, 'red');
            });
    });

    // 新增：MAX_URLS 保存事件
    saveLimitButton.addEventListener('click', () => {
        const newLimit = parseInt(urlLimitInput.value, 10);

        // 向 Service Worker 发送消息以保存新限制
        chrome.runtime.sendMessage({
            action: "setMaxUrls",
            limit: newLimit
        }, (response) => {
            if (response.success){
                displayStatusMessage(`最大 URL 数量限制已设置为 ${newLimit}`);
            } else {
                displayStatusMessage(`设置失败: ${response.reason}`, 4000, 'red');
            }
        });
    });

    // 以下为下载和复制逻辑，它们不需要修改，因为它们只使用本地数据 selectedUrls

    // --- 辅助函数：将图片 Blob 转换为目标格式 ---
    function convertToTargetFormat(originalBlob, targetFormat) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(originalBlob);

            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                let mimeType;
                if (targetFormat === 'png') {
                    mimeType = 'image/png';
                } else if (targetFormat === 'jpeg') {
                    mimeType = 'image/jpeg';
                } else {
                    reject(new Error(`Unsupported target format: ${targetFormat}`));
                    return;
                }

                canvas.toBlob(resolve, mimeType, 0.9);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Failed to load image onto canvas for conversion."));
            };

            img.src = url;
        });
    }

    // --- 辅助函数：根据 Blob 的 Content-Type 确定扩展名 ---
    function getExtensionFromMime(mimeType) {
        if (!mimeType) return '';
        const mimeMap = {
            'image/jpeg': 'jpeg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg'
        };
        // 移除 Content-Type 后的字符集信息 (如 image/jpeg;charset=utf-8)
        const cleanType = mimeType.split(';')[0].toLowerCase();
        return mimeMap[cleanType] || ''; // 返回格式名 (如 'jpeg' 或 '')
    }

    // --- 多选下载功能：改为 ZIP 压缩包下载 (集成格式转换) ---
    downloadButton.addEventListener('click', async () => {
        if (selectedUrls.size === 0) return;

        const urls = Array.from(selectedUrls);
        const zip = new JSZip();
        let downloadedCount = 0;
        const totalCount = urls.length;
        const targetFormat = formatSelect.value;

        displayStatusMessage(`正在准备下载 ${totalCount} 张图片，请稍候...`, 10000);
        downloadButton.disabled = true;

        for (const url of urls) {
            try {
                // --- 1. 使用 fetch 获取 Blob 数据并记录 Content-Type ---
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                }

                // 获取 Content-Type（服务器的权威信息）
                const contentType = response.headers.get('content-type') || response.blob().type;
                let originalFormatName = getExtensionFromMime(contentType); // 例如 'jpeg', 'png', 或 ''

                let blob = await response.blob();

                // 2. 【核心修改】处理格式转换
                let newExtension = '';
                let isConverted = false;

                // 如果 originalFormatName 为空，先使用 Blob 对象的 type，但它可能不准
                const currentMime = originalFormatName || (blob.type ? blob.type.split('/')[1] : '');

                if (targetFormat !== 'original') {
                    if (currentMime !== targetFormat) {
                        blob = await convertToTargetFormat(blob, targetFormat);
                        newExtension = `.${targetFormat}`;
                        isConverted = true;
                    }
                } else {
                    // 如果是 'original'，但 originalFormatName 为空 (如动态链接)，
                    // 尝试用一个默认的格式名来帮助生成文件名。
                    if (!originalFormatName) {
                        originalFormatName = 'jpg'; // 动态链接若不能识别，假定为 jpg
                    }
                }

                // 3. 获取文件名并处理扩展名
                const urlParts = url.split('/');
                let filename = urlParts[urlParts.length - 1].split('?')[0];

                if (!filename || filename.indexOf('.') === -1) {
                    // 【核心修改】：无扩展名时
                    // 优先使用转换后的扩展名 newExtension
                    // 如果没有转换 (targetFormat === 'original')，
                    // 则使用从 MIME Type 推断出的 originalFormatName (如 'jpeg')

                    let defaultExt = newExtension;
                    if (!defaultExt) {
                        // 如果没有 newExtension，使用 MIME 推断的扩展名
                        defaultExt = `.${originalFormatName}`;
                    }

                    // 最终确保有一个扩展名，如果推断也失败了，默认为 .png
                    if (defaultExt === '.') {
                        defaultExt = '.jpg';
                    }

                    filename = `image_${downloadedCount + 1}${defaultExt}`;
                } else if (isConverted) {
                    // 如果文件名存在且已转换
                    const parts = filename.split('.');
                    parts.pop(); // 移除原始扩展名
                    filename = `${parts.join('.')}${newExtension}`;
                }

                // 4. 确保文件名是唯一的 (保持不变)
                const originalFilename = filename;
                let fileCounter = 1;
                while (zip.files[filename]) {
                    const parts = originalFilename.split('.');
                    const name = parts.slice(0, -1).join('.');
                    const ext = parts[parts.length - 1];
                    filename = `${name}_${fileCounter++}.${ext}`;
                }

                // 5. 将处理后的 Blob 添加到 ZIP 文件中 (保持不变)
                zip.file(filename, blob, { binary: true });
                downloadedCount++;

                displayStatusMessage(`已打包 ${downloadedCount} / ${totalCount} 张图片...`, 500);

            } catch (error) {
                console.error(`跳过下载：${url}`, error);
            }
        }

        // 6. 生成 ZIP 文件并下载 (保持不变)
        if (downloadedCount > 0) {
            displayStatusMessage(`正在压缩...`, 10000);
            const zipBlob = await zip.generateAsync({ type: "blob" });

            const zipName = `images_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`;

            const a = document.createElement('a');
            a.href = URL.createObjectURL(zipBlob);
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

            displayStatusMessage(`成功下载 ${downloadedCount} 张图片！`, 3000);
        } else {
            displayStatusMessage(`下载失败，没有图片被成功打包。`, 5000);
        }

        downloadButton.disabled = false;
    });

    // --- 多选复制功能 ---
    copyButton.addEventListener('click', () => {
        if (selectedUrls.size === 0) return;
        const linksToCopy = Array.from(selectedUrls).join('\n');

        navigator.clipboard.writeText(linksToCopy)
            .then(() => {
                displayStatusMessage(`已复制 ${selectedUrls.size} 个图片链接到剪贴板!`);
            })
            .catch(err => {
                console.error('复制失败:', err);
                displayStatusMessage('复制失败。请检查浏览器权限。', 5000);
            });
    });

    // --- 放大器/预览逻辑 ---
    function openPreview(url) {
        previewImage.src = url;
        previewModal.style.display = 'flex';
    }

    closeBtn.addEventListener('click', () => {
        previewModal.style.display = 'none';
    });

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            previewModal.style.display = 'none';
        }
    });

    // 初始化调用
    initializePopup();
});