const editorForm = document.getElementById('article-editor');

if (editorForm) {
  const fields = document.getElementById('article-fields');
  const saveMessage = document.getElementById('save-message');
  const submitMessage = document.getElementById('submit-message');
  const submitButton = document.getElementById('submit-article');
  const statusLabel = document.getElementById('article-status');
  let articleId = editorForm.dataset.articleId;
  let blocked = editorForm.dataset.status === 'pending';
  let dirty = false;
  let saving = null;
  let submitting = false;
  let timer;
  let unprotectedRequest = false;

  function showStatus(status, label) {
    statusLabel.dataset.status = status;
    statusLabel.className = 'status-badge status-' + status;
    statusLabel.textContent = label;
  }

  function readFields() {
    const values = {};
    for (const name of ['title', 'summary', 'content', 'imageUrl', 'category']) {
      values[name] = editorForm.elements.namedItem(name).value;
    }
    return values;
  }

  async function request(url, method, body = {}) {
    const json = JSON.stringify(body);
    const keepalive = new Blob([json]).size < 60000;
    unprotectedRequest = !keepalive;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: json,
      // A keepalive request still reaches the server if the page closes
      // mid-save. Browsers allow it only for bodies under 64 KB.
      keepalive
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || response.redirected) {
      const error = new Error(result.message || 'Request failed. Check your login and try again.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  // One request at a time: edits made during a save are sent by the next loop.
  function saveChanges() {
    if (saving) return saving;
    if (blocked || (!dirty && articleId)) return Promise.resolve();

    saving = (async () => {
      do {
        dirty = false;
        saveMessage.textContent = 'Saving...';
        try {
          const result = articleId
            ? await request('/reporter/articles/' + articleId + '/autosave', 'PATCH', readFields())
            : await request('/reporter/articles', 'POST', readFields());
          if (!articleId) {
            articleId = result.articleId;
            editorForm.dataset.articleId = articleId;
            history.replaceState(null, '', '/reporter/articles/' + articleId + '/edit');
          }
          showStatus(result.status, result.statusLabel);
          saveMessage.textContent = 'Saved';
        } catch (error) {
          dirty = true;
          saveMessage.textContent = 'Error saving: ' + error.message;
          if (error.status === 409) {
            blocked = true;
            submitButton.disabled = true;
            saveMessage.textContent += ' Copy any unsaved text before reloading.';
          }
          throw error;
        }
      } while (dirty && !blocked);
    })().finally(() => { saving = null; });
    return saving;
  }

  editorForm.addEventListener('input', () => {
    if (blocked || submitting) return;
    dirty = true;
    saveMessage.textContent = 'Unsaved changes';
    clearTimeout(timer);
    timer = setTimeout(() => {
      saveChanges().catch(() => { /* The save status already explains the error. */ });
    }, 800);
  });

  editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (blocked || submitting) return;
    clearTimeout(timer);
    submitting = true;
    fields.disabled = true;
    submitButton.disabled = true;
    submitMessage.textContent = 'Saving and submitting...';
    try {
      // Flush the last debounce and wait for all edits before changing status.
      await saveChanges();
      const result = await request('/reporter/articles/' + articleId + '/submit', 'POST');
      blocked = true;
      showStatus(result.status, result.statusLabel);
      document.getElementById('pending-notice').hidden = false;
      saveMessage.textContent = 'Saved';
      submitMessage.textContent = 'Submitted for editor approval.';
    } catch (error) {
      submitMessage.textContent = 'Unable to submit: ' + error.message;
    } finally {
      submitting = false;
      fields.disabled = blocked;
      submitButton.disabled = blocked;
    }
  });

  // Closing, reloading or hiding the page saves at once instead of waiting
  // for the typing pause, so the last words are not lost.
  function saveNow() {
    if (blocked || submitting || !dirty) return;
    clearTimeout(timer);
    saveChanges().catch(() => { /* The save status already explains the error. */ });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);

  window.addEventListener('beforeunload', (event) => {
    saveNow();
    // Warn only when text is still waiting behind a running save, or when a
    // very large save could be cancelled by closing the page.
    if (dirty || submitting || (saving && unprotectedRequest)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
