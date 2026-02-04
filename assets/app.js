// Добавили clipboard в импорт
const { ipcRenderer, clipboard } = nodeRequire('electron');
const path = nodeRequire('path');

window.editor = null;
window.currentRoot = null;
window.currentFile = null;
let targetFileCtx = null;

// === КАСТОМНОЕ ОКНО (ОСТАВЛЯЕМ КАК БЫЛО) ===
function customPrompt(title, defaultVal = "") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const input = document.getElementById('modal-input');
        const label = document.getElementById('modal-title');
        const ok = document.getElementById('modal-ok');
        const cancel = document.getElementById('modal-cancel');

        label.textContent = title;
        input.value = defaultVal;
        overlay.style.display = 'flex';
        input.focus();

        function close(val) {
            overlay.style.display = 'none';
            ok.onclick = null; cancel.onclick = null; input.onkeydown = null;
            resolve(val);
        }

        ok.onclick = () => close(input.value);
        cancel.onclick = () => close(null);
        input.onkeydown = (e) => { if(e.key === 'Enter') ok.click(); };
    });
}

// === MONACO EDITOR ===
require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' }});
require(['vs/editor/editor.main'], function() {
    window.editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '// Open folder to start...', 
        language: 'javascript', 
        theme: 'vs-dark', 
        automaticLayout: true
    });

    // --- ФИКС ВСТАВКИ (CTRL+V / CMD+V) ---
    // Мы принудительно учим редактор читать буфер обмена Electron
    window.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
        const text = clipboard.readText();
        const selection = window.editor.getSelection();
        window.editor.executeEdits('clipboard', [{
            range: selection,
            text: text,
            forceMoveMarkers: true
        }]);
    });
    // -------------------------------------

    window.editor.onDidChangeModelContent(() => {
        if (window.currentFile) ipcRenderer.invoke('save-file', { path: window.currentFile, content: window.editor.getValue() });
    });
});

// === ФАЙЛЫ ===
const ctxMenu = document.getElementById('ctx-menu');
document.addEventListener('click', () => ctxMenu.style.display = 'none');

document.getElementById('btn-open-folder').onclick = async () => {
    const root = await ipcRenderer.invoke('open-folder');
    if (root) { window.currentRoot = root; loadFiles(); }
};

document.getElementById('btn-new-file').onclick = async () => {
    if (!window.currentRoot) return alert('Open folder first');
    const name = await customPrompt("File name:");
    if (name) {
        await ipcRenderer.invoke('create-file', path.join(window.currentRoot, name));
        loadFiles();
    }
};

// Удаление
document.getElementById('ctx-delete').onclick = async () => {
    if (!targetFileCtx) return;
    const confirm = await customPrompt(`Delete ${path.basename(targetFileCtx)}? (Press Enter)`, "yes");
    if (confirm) {
        await ipcRenderer.invoke('delete-file', targetFileCtx);
        if (window.currentFile === targetFileCtx) window.editor.setValue('');
        loadFiles();
    }
};

// Переименование
document.getElementById('ctx-rename').onclick = async () => {
    if (!targetFileCtx) return;
    const newName = await customPrompt("New name:", path.basename(targetFileCtx));
    if (newName) {
        await ipcRenderer.invoke('rename-file', { oldPath: targetFileCtx, newPath: path.join(window.currentRoot, newName) });
        loadFiles();
    }
};

// Кнопка RUN
document.getElementById('btn-run').onclick = async () => {
    if (!window.currentFile) return alert("Open a file first!");

    await ipcRenderer.invoke('save-file', { path: window.currentFile, content: window.editor.getValue() });

    const ext = path.extname(window.currentFile);
    let cmd = '';

    if (ext === '.py') {
        const py = process.platform === 'win32' ? 'python' : 'python3';
        cmd = `${py} "${window.currentFile}"`;
    } else if (ext === '.js') {
        cmd = `node "${window.currentFile}"`;
    } else {
        cmd = `echo "Unknown file type: ${ext}"`;
    }

    ipcRenderer.send('term-input', cmd);
};

async function loadFiles() {
    const files = await ipcRenderer.invoke('read-dir', window.currentRoot);
    const tree = document.getElementById('file-tree');
    tree.innerHTML = '';
    
    files.forEach(f => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = (f.isDir ? '📁 ' : '📄 ') + f.name;
        const fullPath = path.join(window.currentRoot, f.name);

        div.onclick = async () => {
            if (!f.isDir) {
                window.currentFile = fullPath;
                const content = await ipcRenderer.invoke('read-file', fullPath);
                window.editor.setValue(content);
                const ext = f.name.split('.').pop();
                const lang = ext==='py'?'python':ext==='html'?'html':'javascript';
                monaco.editor.setModelLanguage(window.editor.getModel(), lang);
            }
        };

        div.oncontextmenu = (e) => {
            e.preventDefault();
            targetFileCtx = fullPath;
            ctxMenu.style.display = 'block';
            ctxMenu.style.left = e.pageX + 'px';
            ctxMenu.style.top = e.pageY + 'px';
        };
        tree.appendChild(div);
    });
}