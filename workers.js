addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const notebookName = url.pathname.substring(1) || 'default'
  
  if (request.method === 'GET') {
    const content = await NOTEBOOK_KV.get(notebookName)
    const decodedContent = decodeHtml(content || '')
    return new Response(renderHtml(notebookName, decodedContent), {
      headers: {
        'content-type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    })
  }

  if (request.method === 'POST') {
    const formData = await request.formData()
    const content = formData.get('content')
    const encodedContent = encodeHtml(content)
    await NOTEBOOK_KV.put(notebookName, encodedContent)
    return new Response('Saved!', { status: 200 })
  }

  return new Response('Method not allowed', { status: 405 })
}

function encodeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function decodeHtml(str) {
  return str.replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
}

function renderHtml(name, content) {
  const safeContent = encodeHtml(content);
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Notebook: ${name}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #editor { width: 100%; height: 80vh; margin-bottom: 10px; }
        #buttons { margin-bottom: 10px; }
        #save-status { margin-left: 10px; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Notebook: ${name}</h1>
      <div id="buttons">
        <button onclick="copyText()">Copy</button>
        <button onclick="saveText()">Save</button>
        <button onclick="clearText()">Clear</button>
        <span id="save-status"></span>
      </div>
      <textarea id="editor">${safeContent}</textarea>

      <script>
        function copyText() {
          const editor = document.getElementById('editor');
          editor.select();
          document.execCommand('copy');
        }

        function clearText() {
          document.getElementById('editor').value = '';
        }

        async function saveText() {
          const editor = document.getElementById('editor');
          const content = editor.value;
          
          const timestamp = new Date().getTime();  // 获取当前时间戳
          const urlWithTimestamp = new URL(window.location.pathname, window.location.origin);
          urlWithTimestamp.searchParams.set('t', timestamp);  // 添加时间戳查询参数

          const response = await fetch(urlWithTimestamp, {
            method: 'POST',
            body: new URLSearchParams({ content })
          });

          if (response.ok) {
            const now = new Date();
            const formattedTime = now.toLocaleTimeString();
            document.getElementById('save-status').textContent = 'Saved at: ' + formattedTime;
          } else {
            document.getElementById('save-status').textContent = 'Save failed';
          }
        }
      </script>
    </body>
    </html>
  `;
}
