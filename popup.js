// popup.js

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

    // **核心数据结构**
    let selectedUrls = new Set();
    let currentImageUrls = [];

    // **实时通信核心**：与后台的持久连接
    let port = null;

    // --- 【新增】重连机制变量 ---
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY_MS = 2000; // 2秒后重试
    let reconnectAttempts = 0;
    // ----------------------------

    // --- 核心函数：显示无阻塞状态消息 ---
    function displayStatusMessage(message, duration = 3000) {
        clearTimeout(statusMessageElement.dataset.timeoutId);

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
    function updateToggleButton(isCapturing) {
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

    // --- 实时刷新核心：处理后台推送的消息 ---
    function handleRealtimeUpdate(data) {
        if (data.action === "updateList") {
            renderImageList(data.urls);
        } else if (data.action === "cleared") {
            renderImageList([]);
            displayStatusMessage("图片列表已清空。");
        } else if (data.action === "toggleStatus") {
            updateToggleButton(data.isCapturing);
        }
    }

    // --- 初始化：建立连接并请求初始数据 (包含重连机制) ---
    function initializePopup() {
        // 如果正在重连，显示状态消息
        if (reconnectAttempts > 0) {
            displayStatusMessage(`与后台连接断开，尝试重连... (第 ${reconnectAttempts} 次)`, RECONNECT_DELAY_MS);
        }
        
        try {
            port = chrome.runtime.connect({ name: "popup-channel" });
            
            // 成功连接后，重置重试计数器
            reconnectAttempts = 0; 
            
            port.onMessage.addListener(handleRealtimeUpdate);
            
            // --- 重连逻辑 ---
            port.onDisconnect.addListener(() => {
                console.warn("Disconnected from background script. Service Worker might have died.");
                port = null;
                
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    // 使用 setTimeout 异步重试连接
                    setTimeout(initializePopup, RECONNECT_DELAY_MS);
                } else {
                    displayStatusMessage("与后台的连接已断开，重试失败。请重新打开面板。", 5000);
                    reconnectAttempts = 0; // 重置计数器，以便下次打开面板时可以重新尝试
                }
            });
            // ------------------
            
            port.postMessage({ action: "getInitialImages" });
            
        } catch (e) {
            console.error("Connection failed immediately:", e);
            port = null;
            // 立即连接失败也尝试重连
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(initializePopup, RECONNECT_DELAY_MS);
            } else {
                displayStatusMessage("与后台的连接已断开，重试失败。请重新打开面板。", 5000);
                reconnectAttempts = 0;
            }
        }
    }

    // --- 绑定事件监听器 (通过 Port 发送请求) ---

    selectAllButton.addEventListener('click', selectAllImages);

    toggleCaptureButton.addEventListener('click', () => {
        if (port) {
            port.postMessage({ action: "toggleCapture" });
        }
    });

    // 清空事件：单次点击即执行
    clearImagesButton.addEventListener('click', () => {
        if (port) {
            port.postMessage({ action: "clearImages" });
            displayStatusMessage("正在清空图片列表...", 1000);
        } else {
            displayStatusMessage("后台服务未连接，请重新打开面板。", 4000);
        }
    });

    // --- 辅助函数：将 Blob 转换为目标格式的 Blob ---
    /**
     * 使用 Canvas API 将图像 Blob 转换为指定格式 (PNG, JPEG)
     * @param {Blob} originalBlob 原始图片 Blob
     * @param {string} targetFormat 目标格式 ('png', 'jpeg')
     * @returns {Promise<Blob>} 转换后的 Blob
     */
    function convertToTargetFormat(originalBlob, targetFormat) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(originalBlob);

            img.onload = () => {
                URL.revokeObjectURL(url); // 释放 Blob URL
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // 确定 MIME 类型和质量 (仅对 JPEG/WebP 有效)
                let mimeType;
                if (targetFormat === 'png') {
                    mimeType = 'image/png';
                } else if (targetFormat === 'jpeg') {
                    mimeType = 'image/jpeg';
                } else {
                    reject(new Error(`Unsupported target format: ${targetFormat}`));
                    return;
                }

                // 导出为目标格式 (JPEG 质量设为 0.9，其他格式忽略质量参数)
                canvas.toBlob(resolve, mimeType, 0.9);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Failed to load image onto canvas for conversion."));
            };

            img.src = url;
        });
    }

    // --- 【修改核心】多选下载功能：改为 ZIP 压缩包下载 (集成格式转换) ---
    downloadButton.addEventListener('click', async () => {
        if (selectedUrls.size === 0) return;

        const urls = Array.from(selectedUrls);
        const zip = new JSZip();
        let downloadedCount = 0;
        const totalCount = urls.length;
        const targetFormat = formatSelect.value;

        displayStatusMessage(`正在准备下载 ${totalCount} 张图片，请稍候...`, 10000);
        downloadButton.disabled = true; // 禁用按钮防止重复点击

        for (const url of urls) {
            try {
                // 1. 使用 fetch 获取 Blob 数据
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                }
                let blob = await response.blob();

                // 2. 【新增】：处理格式转换
                let newExtension = '';
                let isConverted = false;

                if (targetFormat !== 'original') {
                    // 如果目标格式与原始 MIME 类型不匹配，则进行转换
                    const originalMime = blob.type.split('/')[1];
                    if (originalMime !== targetFormat) {
                        blob = await convertToTargetFormat(blob, targetFormat);
                        newExtension = `.${targetFormat}`;
                        isConverted = true;
                    }
                }


                // 3. 获取文件名并处理扩展名
                const urlParts = url.split('/');
                let filename = urlParts[urlParts.length - 1].split('?')[0];

                if (!filename || filename.indexOf('.') === -1) {
                    // 创建通用文件名，使用新的或原始的扩展名
                    const defaultExt = newExtension || (url.includes('.') ? url.substring(url.lastIndexOf('.')) : '.jpg');
                    filename = `image_${downloadedCount + 1}${defaultExt}`;
                } else if (isConverted) {
                    // 如果进行了转换，替换或添加新的扩展名
                    const parts = filename.split('.');
                    parts.pop(); // 移除原始扩展名
                    filename = `${parts.join('.')}${newExtension}`;
                }

                // 4. 确保文件名是唯一的
                const originalFilename = filename;
                let fileCounter = 1;
                while (zip.files[filename]) {
                    const parts = originalFilename.split('.');
                    const name = parts.slice(0, -1).join('.');
                    const ext = parts[parts.length - 1];
                    filename = `${name}_${fileCounter++}.${ext}`;
                }

                // 5. 将处理后的 Blob 添加到 ZIP 文件中
                zip.file(filename, blob, { binary: true });
                downloadedCount++;

                displayStatusMessage(`已打包 ${downloadedCount} / ${totalCount} 张图片...`, 500);

            } catch (error) {
                console.error(`跳过下载：${url}`, error);
            }
        }

        // 6. 生成 ZIP 文件并下载
        if (downloadedCount > 0) {
            displayStatusMessage(`正在压缩...`, 10000);
            const zipBlob = await zip.generateAsync({ type: "blob" });

            const zipName = `images_${new Date().toISOString().slice(0, 10)}.zip`;

            // 使用 file-saver 库或简单创建链接下载
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

    initializePopup();
});