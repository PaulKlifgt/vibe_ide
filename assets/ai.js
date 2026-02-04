(function() {
    // Мы получаем ipcRenderer ВНУТРИ этой функции, чтобы имя не конфликтовало с app.js
    const { ipcRenderer } = nodeRequire('electron');

    const chatHistory = document.getElementById('chat-history');
    const aiPrompt = document.getElementById('ai-prompt');
    const sendBtn = document.getElementById('send-btn');
    
    // Глобальное хранилище для кода (оно должно быть доступно везде, поэтому window)
    window.aiCodeStore = {};

    if (sendBtn) {
        sendBtn.onclick = async () => {
            const txt = aiPrompt.value.trim();
            if (!txt) return;
            
            aiPrompt.value = '';

            // 1. Сообщение юзера
            const userDiv = document.createElement('div');
            userDiv.className = 'msg user';
            userDiv.style.background = '#0e639c';
            userDiv.style.color = 'white';
            userDiv.style.padding = '8px';
            userDiv.style.marginBottom = '10px';
            userDiv.style.borderRadius = '4px';
            userDiv.innerText = txt;
            chatHistory.appendChild(userDiv);

            // 2. Сообщение AI (заглушка)
            const aiDiv = document.createElement('div');
            aiDiv.className = 'msg ai';
            aiDiv.style.background = '#333';
            aiDiv.style.color = '#ddd';
            aiDiv.style.padding = '8px';
            aiDiv.style.marginBottom = '10px';
            aiDiv.style.borderRadius = '4px';
            aiDiv.innerText = 'Thinking...';
            chatHistory.appendChild(aiDiv);
            
            chatHistory.scrollTop = chatHistory.scrollHeight;

            // 3. Контекст
            const contextCode = window.editor ? window.editor.getValue() : "";
            
            // 4. Запрос к Ollama
            try {
                let fullText = "";
                
                // Чистим слушатели
                ipcRenderer.removeAllListeners('ai-chunk');
                
                ipcRenderer.on('ai-chunk', (e, chunk) => {
                    fullText += chunk;
                    aiDiv.innerHTML = parseMarkdown(fullText);
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                });

                const result = await ipcRenderer.invoke('ask-ollama', {
                    model: 'qwen2.5:3b', 
                    messages: [
                        { role: 'system', content: 'You are a coding assistant. Wrap code in ```language ... ``` blocks.' },
                        { role: 'user', content: `Context:\n${contextCode}\n\nTask: ${txt}` }
                    ]
                });

                if (result && result.startsWith && result.startsWith('Error')) {
                    aiDiv.innerHTML = `<span style="color:red"><b>Error:</b> ${result}</span>`;
                }

            } catch (err) {
                aiDiv.innerHTML = `<span style="color:red">Client Error: ${err.message}</span>`;
            }
        };
    }

    // Функция парсинга (локальная)
    function parseMarkdown(text) {
        let clean = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        clean = clean.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const id = Math.random().toString(36).substr(2);
            const rawCode = code.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
            
            window.aiCodeStore[id] = rawCode;
            
            return `
            <div style="background:#111; margin:5px 0; border:1px solid #444; border-radius:4px; overflow:hidden;">
                <div style="background:#252526; padding:4px 8px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444;">
                    <span style="color:#aaa; font-size:11px; font-weight:bold;">${lang || 'code'}</span>
                    <button style="cursor:pointer; background:#28a745; color:white; border:none; border-radius:3px; padding:2px 8px; font-size:10px;" onclick="insertAiCode('${id}')">
                        INSERT
                    </button>
                </div>
                <pre style="margin:0; padding:10px; overflow-x:auto; font-family:monospace; color:#d4d4d4;">${code}</pre>
            </div>`;
        });
        
        return clean.replace(/\n/g, "<br>");
    }

    // Глобальная функция вставки (должна быть window, чтобы HTML кнопка ее видела)
    window.insertAiCode = (id) => {
        const code = window.aiCodeStore[id];
        if (window.editor && code) {
            const selection = window.editor.getSelection();
            window.editor.executeEdits('ai', [{ 
                range: selection, 
                text: code, 
                forceMoveMarkers: true 
            }]);
            window.editor.focus();
        }
    };

})(); // <-- Конец самовызывающейся функции