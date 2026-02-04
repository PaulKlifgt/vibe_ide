const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ollama = require('ollama').default || require('ollama');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 900,
        backgroundColor: '#1e1e1e',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    mainWindow.loadFile('index.html');

    // === ФИКС КОПИРОВАНИЯ И ВСТАВКИ (COPY/PASTE) ===
    const isMac = process.platform === 'darwin';

    const template = [
        // 1. Меню приложения (Только для Mac)
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        
        // 2. Меню Файл
        {
            label: 'File',
            submenu: [
                { role: 'quit' } // На Windows это выход
            ]
        },

        // 3. Меню Правка (САМОЕ ГЛАВНОЕ)
        // Именно эти роли включают Ctrl+C / Ctrl+V
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'pasteAndMatchStyle' },
                { role: 'delete' },
                { role: 'selectAll' }
            ]
        },

        // 4. Меню Вид (Полезно для зума и DevTools)
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' }, // F12 / Cmd+Opt+I
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        
        // 5. Меню Окно
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // Запуск оболочки
    startShell();
}

// --- SHELL (ТЕРМИНАЛ) ---
let shellProcess = null;
function startShell() {
    // Windows = powershell, Mac/Linux = bash или zsh
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    try {
        shellProcess = spawn(shell, [], { cwd: process.cwd(), env: process.env });
        
        shellProcess.stdout.on('data', d => sendTerm(d));
        shellProcess.stderr.on('data', d => sendTerm(d));
    } catch (e) { 
        console.error("Shell Error:", e);
    }
}

function sendTerm(data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('term-output', data.toString());
    }
}

app.whenReady().then(createWindow);

// --- IPC ОБРАБОТЧИКИ ---
ipcMain.on('term-input', (e, cmd) => { 
    if (shellProcess) shellProcess.stdin.write(cmd + '\n'); 
});

ipcMain.handle('open-folder', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('read-dir', (e, dir) => {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => !d.name.startsWith('.') && d.name !== 'node_modules')
            .map(d => ({ name: d.name, isDir: d.isDirectory() }));
    } catch { return []; }
});

ipcMain.handle('read-file', (e, p) => fs.readFileSync(p, 'utf-8'));
ipcMain.handle('save-file', (e, { path, content }) => fs.writeFileSync(path, content));
ipcMain.handle('create-file', (e, p) => fs.writeFileSync(p, ''));
ipcMain.handle('delete-file', (e, p) => fs.unlinkSync(p));
ipcMain.handle('rename-file', (e, { oldPath, newPath }) => fs.renameSync(oldPath, newPath));

ipcMain.handle('ask-ollama', async (e, { model, messages }) => {
    try {
        const stream = await ollama.chat({ model, messages, stream: true });
        for await (const part of stream) mainWindow.webContents.send('ai-chunk', part.message.content);
        return "DONE";
    } catch (err) { return "Error: " + err.message; }
});