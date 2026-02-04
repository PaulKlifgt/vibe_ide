// Логика работы с терминалом
const termOutput = document.getElementById('terminal-output');
const termInput = document.getElementById('term-input');

// Обработка ввода
termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const cmd = termInput.value;
        ipcRenderer.send('term-input', cmd); // Отправляем в Main process
        termInput.value = '';
        
        // Автоскролл
        setTimeout(() => termOutput.scrollTop = termOutput.scrollHeight, 50);
    }
});

// Получение вывода
ipcRenderer.on('term-output', (event, data) => {
    // Очень простая очистка ANSI цветов (чтобы не было [32m...)
    // Для идеального результата лучше использовать xterm.js, но это усложнит код
    const cleanData = data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    
    termOutput.innerText += cleanData;
    termOutput.scrollTop = termOutput.scrollHeight;
});

document.getElementById('btn-clear-term').onclick = () => {
    termOutput.innerText = '';
};

// Фокус на инпут при клике на терминал
document.querySelector('.terminal-wrapper').onclick = () => termInput.focus();