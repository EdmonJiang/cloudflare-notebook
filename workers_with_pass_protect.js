addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const notebookName = url.pathname.substring(1) || 'default';
  
  if (request.method === 'GET') {
    const encryptedPassword = url.searchParams.get('q');
    const isProtected = await isNotebookProtected(notebookName);

    if (isProtected) {
      if (encryptedPassword) {
        try {
          const password = decryptPassword(encryptedPassword);
          const isCorrect = await verifyPassword(notebookName, password);
          if (isCorrect) {
            const content = await NOTEBOOK_KV.get(notebookName);
            const decodedContent = decodeHtml(content || '');
            return new Response(renderHtml(notebookName, decodedContent, true), {
              headers: { 'content-type': 'text/html' },
            });
          } else {
            return new Response('', {
              status: 302,
              headers: {
                'Location': url.origin + url.pathname
              }
            });
          }
        } catch (e) {
          return new Response('', {
            status: 302,
            headers: {
              'Location': url.origin + url.pathname
            }
          });
        }
      } else {
        return new Response(renderPasswordPrompt(notebookName), {
          status: 302,
          headers: { 'content-type': 'text/html' },
        });
      }
    } else {
      const content = await NOTEBOOK_KV.get(notebookName);
      const decodedContent = decodeHtml(content || '');
      if (url.search){
        return new Response(renderHtml(notebookName, decodedContent, false), {
          status: 302,
          headers: { 'content-type': 'text/html', 'Location': url.origin + url.pathname },
        });
      } else {
        return new Response(renderHtml(notebookName, decodedContent, false), {
          headers: { 'content-type': 'text/html', 'Location': url.origin + url.pathname },
        });
      }
    }
  }

  if (request.method === 'POST') {
    const formData = await request.formData();
    const content = formData.get('content');
    const encodedContent = content ? encodeHtml(content) : '';
    const action = formData.get('action');
    const newPassword = formData.get('newPassword');
    
    if (action === 'setPassword' || action === 'updatePassword') {
      if (newPassword) {
        await setPassword(notebookName, newPassword);
        return new Response('Password set!', { status: 200 });
      } else if (action === 'updatePassword' && newPassword === '') {
        await removePassword(notebookName);
        return new Response('Password removed!', { status: 200 });
      }
    } else {
      await NOTEBOOK_KV.put(notebookName, encodedContent);
      return new Response('Saved!', { status: 200 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}

async function isNotebookProtected(notebookName) {
  const password = await NOTEBOOK_KV.get(notebookName + '_password');
  return password !== null;
}

async function setPassword(notebookName, password) {
  const hashedPassword = await hashPassword(password);
  await NOTEBOOK_KV.put(notebookName + '_password', hashedPassword);
}

async function removePassword(notebookName) {
  await NOTEBOOK_KV.delete(notebookName + '_password');
}

async function verifyPassword(notebookName, password) {
  const storedHashedPassword = await NOTEBOOK_KV.get(notebookName + '_password');
  if (!storedHashedPassword) return false;
  return await comparePassword(password, storedHashedPassword);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashed = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashed)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function comparePassword(password, hashedPassword) {
  const hashed = await hashPassword(password);
  return hashed === hashedPassword;
}

function encodeBase64WithoutPadding(str) {
  return btoa(str).replace(/=+$/, '');
}

function decodeBase64WithoutPadding(str) {
  let paddedStr = str;
  const padLength = (4 - (str.length % 4)) % 4;
  if (padLength > 0) {
    paddedStr += '='.repeat(padLength);
  }
  return atob(paddedStr);
}

function encryptPassword(password) {
  return encodeBase64WithoutPadding(password);
}

function decryptPassword(encryptedPassword) {
  try {
    return decodeBase64WithoutPadding(encryptedPassword);
  } catch (e) {
    throw new Error('Invalid password format');
  }
}

function encodeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function decodeHtml(str) {
  if (!str) return '';
  return str.replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
}

function renderPasswordPrompt(notebookName) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Notebook: ${notebookName}</title>
    </head>
    <body>
      <h1>Notebook: ${notebookName}</h1>
      <form method="GET">
        <label for="password">Password:</label>
        <input type="password" id="password" name="password" required>
        <button type="submit">Submit</button>
      </form>
      <script>
        document.querySelector('form').onsubmit = function(e) {
          e.preventDefault();
          const password = document.getElementById('password').value;
          const encryptedPassword = btoa(password).replace(/=+$/, '');
          const url = new URL(window.location.href);
          url.search = '';
          url.searchParams.set('q', encryptedPassword);
          window.location.href = url.toString();
        };
      </script>
    </body>
    </html>
  `;
}

function renderHtml(name, content, isProtected) {
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
        #password-status { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <h1>Notebook: ${name}</h1>
      <div id="password-status">
        <label>Password: </label>
        <a href="#" id="password-link">${isProtected ? 'Password set' : 'Not set'}</a>
      </div>
      <div id="buttons">
        <button onclick="copyText()">Copy</button>
        <button onclick="saveText()">Save</button>
        <button onclick="clearText()">Clear</button>
        <span id="save-status"></span>
      </div>
      <textarea id="editor">${content}</textarea>

      <script>
        document.getElementById('password-link').onclick = function() {
          const action = '${isProtected ? 'update' : 'set'}';
          const password = prompt('Enter new password:');
          if (password !== null) {
            if (password) {
              fetch(window.location.pathname, {
                method: 'POST',
                body: new URLSearchParams({ action: action + 'Password', newPassword: password })
              }).then(response => {
                if (response.ok) {
                  alert('Password set successfully');
                  location = new URL(window.location.pathname, window.location.origin);
                } else {
                  alert('Password set failed');
                }
              });
            } else if (action === 'update') {
              fetch(window.location.pathname, {
                method: 'POST',
                body: new URLSearchParams({ action: 'updatePassword', newPassword: '' })
              }).then(response => {
                if (response.ok) {
                  alert('Password removed successfully');
                  location = new URL(window.location.pathname, window.location.origin);
                } else {
                  alert('Password removal failed');
                }
              });
            }
          }
        };

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
          
          const timestamp = new Date().getTime();
          const urlWithTimestamp = new URL(window.location.pathname, window.location.origin);
          urlWithTimestamp.searchParams.set('t', timestamp);

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
