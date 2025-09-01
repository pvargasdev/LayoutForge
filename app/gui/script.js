document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const imagePreviewArea = document.getElementById('image-preview-area');
    const imageList = document.getElementById('image-list');
    const actionArea = document.getElementById('action-area');
    const generateBtn = document.getElementById('generate-btn');
    const uploadForm = document.getElementById('upload-form');
    const cardWidthInput = document.getElementById('card-width');
    const cardHeightInput = document.getElementById('card-height');
    const resultsSection = document.getElementById('results-section');
    const downloadLinksContainer = document.getElementById('download-links');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const scrollContainer = document.getElementById('scroll-container'); 
    const fadeOverlay = document.getElementById('fade-overlay');
    const stretchToggle = document.getElementById('stretch-toggle');
    const borderToggle = document.getElementById('border-toggle');
    const clearListBtn = document.getElementById('clear-list-btn');

    let uploadedFiles = [];
    let currentLayoutPlan = null;
    const BACKEND_URL = 'http://127.0.0.1:5000';

    new Sortable(imageList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        scroll: scrollContainer,
        scrollSensitivity: 60,
        scrollSpeed: 10,
        onEnd: function (evt) {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === newIndex) {
                return;
            }
            const [movedItem] = uploadedFiles.splice(oldIndex, 1);
            uploadedFiles.splice(newIndex, 0, movedItem);
        }
    });

    clearListBtn.addEventListener('click', () => {
            uploadedFiles = [];
            
            imageList.innerHTML = '';
            
            updateVisibility();
            updateFadeEffect();
            resultsSection.classList.add('hidden');
            downloadLinksContainer.innerHTML = '';
            currentLayoutPlan = null;
        });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
        fileInput.value = null;
    });
    fileInput.addEventListener('change', () => {
        handleFiles(fileInput.files);
        fileInput.value = null;
    });

    function handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const fileData = {
                    id: `file-${Date.now()}-${Math.random()}`,
                    file: file
                };
                uploadedFiles.push(fileData);
                const cardElement = createCardElement(fileData);
                imageList.appendChild(cardElement);
            }
        }
        updateVisibility();
        setTimeout(updateFadeEffect, 0);
    }
    
    function createCardElement(fileData) {
        const card = document.createElement('div');
        card.className = 'relative flex flex-col items-center bg-slate-50 p-2 rounded-lg border';
        card.id = fileData.id;

        const reader = new FileReader();
        reader.onload = (e) => {
            card.innerHTML = `
                <p class="text-xs font-medium text-slate-600 truncate w-full text-center mb-2" title="${fileData.file.name}">${fileData.file.name}</p>
                <div class="w-24 h-24 bg-white border rounded-md overflow-hidden">
                    <img src="${e.target.result}" alt="${fileData.file.name}" class="w-full h-full object-cover">
                </div>
                <div class="flex items-center justify-center gap-4 mt-2">
                    <button type="button" title="Duplicate item" class="duplicate-btn text-slate-400 hover:text-indigo-600" data-id="${fileData.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <button type="button" title="Remove item" class="remove-btn text-slate-400 hover:text-red-600" data-id="${fileData.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                </div>
            `;
            updateFadeEffect();
        };
        reader.readAsDataURL(fileData.file);
        return card;
    }

    function updateVisibility() {
        const hasFiles = uploadedFiles.length > 0;
        imagePreviewArea.classList.toggle('hidden', !hasFiles);
        actionArea.classList.toggle('hidden', !hasFiles);
    }
    
    imageList.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.dataset.id;
        const originalCardElement = document.getElementById(id);
        const originalFileIndex = uploadedFiles.findIndex(item => item.id === id);
        
        if (button.classList.contains('remove-btn')) {
            if (originalCardElement) originalCardElement.remove();
            if (originalFileIndex > -1) uploadedFiles.splice(originalFileIndex, 1);
        }

        if (button.classList.contains('duplicate-btn') && originalFileIndex > -1) {
            const originalFileData = uploadedFiles[originalFileIndex];
            const newFileData = { id: `file-${Date.now()}-${Math.random()}`, file: originalFileData.file };
            uploadedFiles.splice(originalFileIndex + 1, 0, newFileData);
            const newCardElement = createCardElement(newFileData);
            if (originalCardElement) originalCardElement.insertAdjacentElement('afterend', newCardElement);
        }
        
        updateVisibility();
        updateFadeEffect();
    });

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (uploadedFiles.length === 0 || !cardWidthInput.value || !cardHeightInput.value) {
            alert('Please add images and fill in the dimensions.');
            return;
        }
        setLoading(true);

        const formData = new FormData();
        formData.append('card_width_mm', cardWidthInput.value);
        formData.append('card_height_mm', cardHeightInput.value);
        formData.append('stretch_to_fit', stretchToggle.checked);
        formData.append('add_border', borderToggle.checked);
        uploadedFiles.forEach(fileData => {
            formData.append('files[]', fileData.file);
        });

        try {
            const response = await fetch(`${BACKEND_URL}/preview-layout`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'An error occurred on the server.');
            }
            const resultPlan = await response.json();
            currentLayoutPlan = resultPlan;
            displayDownloadOptions(resultPlan);
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    });
    
    function displayDownloadOptions(plan) {
        if (!plan) return;
        
        let buttonsHTML = '';
        if (plan.num_sheets > 1) {
            buttonsHTML += `<button data-format="zip" class="download-btn block w-full bg-blue-100 text-blue-800 font-semibold p-3 rounded-lg hover:bg-blue-200 transition-colors">Download Pack (.zip)</button>`;
        } else {
            buttonsHTML += `<button data-format="jpg" class="download-btn block w-full bg-green-100 text-green-800 font-semibold p-3 rounded-lg hover:bg-green-200 transition-colors">Download Image (.jpg)</button>`;
        }
        buttonsHTML += `<button data-format="pdf" class="download-btn block w-full bg-red-100 text-red-800 font-semibold p-3 rounded-lg hover:bg-red-200 transition-colors mt-2">Download Document (.pdf)</button>`;

        resultsSection.classList.remove('hidden');
        resultsSection.style.transition = 'none';
        resultsSection.style.opacity = '0';
        resultsSection.style.transform = 'translateY(-20px)';
        downloadLinksContainer.innerHTML = buttonsHTML;

        setTimeout(() => {
            resultsSection.style.transition = 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out';
            resultsSection.style.opacity = '1';
            resultsSection.style.transform = 'translateY(0)';
        }, 50);
    }

    downloadLinksContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('.download-btn');
        if (!button) return;

        const format = button.dataset.format;
        if (!format || !currentLayoutPlan) return;

        button.disabled = true;
        button.textContent = 'Generating...';

        try {
            const response = await fetch(`${BACKEND_URL}/generate-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: currentLayoutPlan, format: format }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate the file.');
            }
            const result = await response.json();

            const link = document.createElement('a');
            link.href = `${BACKEND_URL}${result.download_url}`;
            link.download = result.download_url.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            fetch(`${BACKEND_URL}/open-folder`, { method: 'POST' });

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            if (format === 'zip') button.textContent = 'Download Pack (.zip)';
            if (format === 'jpg') button.textContent = 'Download Image (.jpg)';
            if (format === 'pdf') button.textContent = 'Download Document (.pdf)';
            button.disabled = false;
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            generateBtn.disabled = true;
            btnText.textContent = 'Generating...';
            btnSpinner.classList.remove('hidden');
        } else {
            generateBtn.disabled = false;
            btnText.textContent = 'Generate Sheets';
            btnSpinner.classList.add('hidden');
        }
    }

    function updateFadeEffect() {
        const container = scrollContainer;
        const hasScroll = container.scrollHeight > container.clientHeight;
        const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 5;
        if (hasScroll && !isAtBottom) {
            fadeOverlay.classList.add('is-visible');
        } else {
            fadeOverlay.classList.remove('is-visible');
        }
    }
    
    scrollContainer.addEventListener('scroll', updateFadeEffect);
    window.addEventListener('resize', updateFadeEffect);
});