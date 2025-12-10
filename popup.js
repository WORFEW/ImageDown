// popup.js (完整的客户端交互逻辑，修改为 ZIP 下载)

document.addEventListener('DOMContentLoaded', () => {
    // --- 【变通方案】阻止 Popup 自动关闭的尝试 ---
    const wrapper = document.getElementById('content-wrapper'); 
    if (wrapper) {
        wrapper.addEventListener('mousedown', (e) => {
            e.stopPropagation(); 
        });
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation(); 
        });
    }
    // ---------------------------------------------
    
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
            displayStatusMessage(message);
        }
    }

    // --- 初始化：建立连接并请求初始数据 ---
    function initializePopup() {
        port = chrome.runtime.connect({ name: "popup-channel" });
        port.onMessage.addListener(handleRealtimeUpdate);
        port.onDisconnect.addListener(() => {
            console.warn("Disconnected from background script. Service Worker might have died.");
            port = null;
            displayStatusMessage("与后台的连接已断开，请重新打开面板。", 5000);
        });
        port.postMessage({ action: "getInitialImages" });
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

    // --- 【修改核心】多选下载功能：改为 ZIP 压缩包下载 ---
    downloadButton.addEventListener('click', async () => {
        if (selectedUrls.size === 0) return;

        const urls = Array.from(selectedUrls);
        const zip = new JSZip();
        let downloadedCount = 0;
        const totalCount = urls.length;
        
        displayStatusMessage(`正在准备下载 ${totalCount} 张图片，请稍候...`, 10000);
        downloadButton.disabled = true; // 禁用按钮防止重复点击
        
        for (const url of urls) {
            try {
                // 1. 获取文件名：从 URL 路径获取，或使用递增数字
                const urlParts = url.split('/');
                let filename = urlParts[urlParts.length - 1].split('?')[0];
                if (!filename || filename.indexOf('.') === -1) {
                    // 如果文件名无效或没有扩展名，则创建通用文件名
                    const ext = (formatSelect.value === 'original' && url.includes('.')) 
                        ? url.substring(url.lastIndexOf('.')) 
                        : '.jpg'; // 默认扩展名
                    filename = `image_${downloadedCount + 1}${ext}`;
                }
                
                // 确保文件名是唯一的 (如果有重复的 URL，虽然 Set 阻止了，但不同页面的相同资源可能有同名)
                const originalFilename = filename;
                let fileCounter = 1;
                while (zip.files[filename]) {
                    const parts = originalFilename.split('.');
                    const name = parts.slice(0, -1).join('.');
                    const ext = parts[parts.length - 1];
                    filename = `${name}_${fileCounter++}.${ext}`;
                }

                // 2. 使用 fetch 获取 Blob 数据
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                }
                const blob = await response.blob();
                
                // 3. 将 Blob 添加到 ZIP 文件中
                zip.file(filename, blob, { binary: true });
                downloadedCount++;
                
                displayStatusMessage(`已打包 ${downloadedCount} / ${totalCount} 张图片...`, 500);

            } catch (error) {
                console.error(`跳过下载：${url}`, error);
            }
        }

        if (downloadedCount > 0) {
            // 4. 生成 ZIP 文件
            displayStatusMessage('正在生成压缩包...', 10000);
            const zipBlob = await zip.generateAsync({ type: "blob" });
            
            // 5. 触发下载
            const zipFilename = `captured_images_${Date.now()}.zip`;
            const zipUrl = URL.createObjectURL(zipBlob);

            chrome.downloads.download({
                url: zipUrl,
                filename: zipFilename,
                saveAs: true // 允许用户选择保存位置
            }, () => {
                // 清理 Blob URL
                URL.revokeObjectURL(zipUrl);
                displayStatusMessage(`ZIP 压缩包 (${downloadedCount} 张) 已开始下载。`, 5000);
                downloadButton.disabled = false; // 恢复按钮
                updateActionButtons(); // 确保按钮状态正确
            });

        } else {
            displayStatusMessage("没有图片成功下载或打包。", 3000);
            downloadButton.disabled = false;
        }
    });
    // -------------------------------------------------------------


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