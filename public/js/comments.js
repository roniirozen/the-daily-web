
const commentForm = document.getElementById('comment-form');

if (commentForm) {
  const authorNameInput = document.getElementById('authorName');
  const contentInput = document.getElementById('content');
  const messageElement = document.getElementById('comment-message');
  const submitButton = commentForm.querySelector('button[type="submit"]');
  const commentsList = document.getElementById('comments-list');
  const moreButton = document.getElementById('more-comments');
  const canModerate = commentForm.dataset.canModerate === 'true';

  async function moderationRequest(commentId, method, body) {
    const response = await fetch(`/api/comments/${commentId}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'The comment could not be updated.');
    return result;
  }

  function showCommentsEmptyState() {
    if (commentsList.querySelector('.comment')) return;
    const empty = document.createElement('p');
    empty.id = 'no-comments-message';
    empty.className = 'empty-message';
    empty.textContent = 'No comments yet. Be the first to join the discussion.';
    commentsList.appendChild(empty);
  }

  function startEditing(element, actions) {
    const content = element.querySelector('.comment-content');
    const editor = document.createElement('form');
    editor.className = 'comment-edit-form';
    const label = document.createElement('label');
    label.className = 'visually-hidden';
    label.htmlFor = `edit-${element.dataset.commentId}`;
    label.textContent = 'Edit comment';
    const textarea = document.createElement('textarea');
    textarea.id = label.htmlFor;
    textarea.rows = 3;
    textarea.maxLength = 1000;
    textarea.required = true;
    textarea.value = content.textContent;
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'comment-action';
    save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'comment-action';
    cancel.textContent = 'Cancel';
    editor.append(label, textarea, save, cancel);

    content.hidden = true;
    actions.hidden = true;
    element.appendChild(editor);
    textarea.focus();

    function finish() {
      editor.remove();
      content.hidden = false;
      actions.hidden = false;
    }

    cancel.addEventListener('click', finish);
    editor.addEventListener('submit', async event => {
      event.preventDefault();
      if (!textarea.value.trim()) return;
      save.disabled = true;
      try {
        const result = await moderationRequest(element.dataset.commentId, 'PATCH', { content: textarea.value });
        content.textContent = result.comment.content;
        finish();
        showMessage('Comment updated.', 'success');
      } catch (error) {
        save.disabled = false;
        showMessage(error.message, 'error');
      }
    });
  }

  // Shown only to Editors. The API checks the role as well.
  function addModerationControls(element) {
    if (!canModerate || element.querySelector('.comment-actions')) return;
    const actions = document.createElement('div');
    actions.className = 'comment-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'comment-action';
    edit.textContent = 'Edit';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'comment-action comment-action-danger';
    remove.textContent = 'Delete';
    actions.append(edit, remove);
    element.appendChild(actions);

    edit.addEventListener('click', () => startEditing(element, actions));
    remove.addEventListener('click', async () => {
      if (!window.confirm('Delete this comment permanently?')) return;
      remove.disabled = true;
      try {
        await moderationRequest(element.dataset.commentId, 'DELETE');
        element.remove();
        showCommentsEmptyState();
        showMessage('Comment deleted.', 'success');
      } catch (error) {
        remove.disabled = false;
        showMessage(error.message, 'error');
      }
    });
  }

  function commentElement(comment) {
    const element = document.createElement('article');
    element.className = 'comment';
    element.dataset.commentId = comment._id;
    const header = document.createElement('div');
    header.className = 'comment-header';
    const author = document.createElement('strong');
    author.textContent = comment.authorName;
    const time = document.createElement('time');
    time.dateTime = new Date(comment.createdAt).toISOString();
    time.textContent = new Date(comment.createdAt).toLocaleString('en-GB');
    header.append(author, time);
    const content = document.createElement('p');
    content.className = 'comment-content';
    content.textContent = comment.content;
    element.append(header, content);
    addModerationControls(element);
    return element;
  }

  moreButton.addEventListener('click', async () => {
    moreButton.disabled = true;
    try {
      const response = await fetch(`/api/articles/${commentForm.dataset.articleId}/comments?cursor=${encodeURIComponent(moreButton.dataset.cursor)}`);
      if (!response.ok) throw new Error('Unable to load older comments. Please retry.');
      const page = await response.json();
      const existing = new Set(Array.from(commentsList.children, element => element.dataset.commentId));
      for (const comment of page.comments) {
        if (!existing.has(comment._id)) commentsList.appendChild(commentElement(comment));
      }
      moreButton.dataset.cursor = page.nextCursor || '';
      moreButton.hidden = !page.hasMore;
    } catch (error) { showMessage(error.message, 'error'); }
    finally { moreButton.disabled = false; }
  });

  function showMessage(message, state) {
    messageElement.textContent = message;
    if (state) {
      messageElement.dataset.state = state;
    } else {
      delete messageElement.dataset.state;
    }
  }

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const articleId = commentForm.dataset.articleId;
    const authorName = authorNameInput.value.trim();
    const content = contentInput.value.trim();

    if (!authorName || !content) {
      showMessage('Please enter your name and a comment.', 'error');
      return;
    }

    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Posting...';
    commentForm.setAttribute('aria-busy', 'true');
    showMessage('', null);

    try {
      const response = await fetch(
        `/api/articles/${articleId}/comments`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            authorName,
            content
          })
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fallbackMessage = response.status === 429
          ? 'You have reached the comment limit. Please wait a minute and try again.'
          : 'Unable to post comment.';
        showMessage(result.message || fallbackMessage, 'error');
        return;
      }

      const noCommentsMessage =
        document.getElementById('no-comments-message');

      if (noCommentsMessage) {
        noCommentsMessage.remove();
      }

      commentsList.prepend(commentElement(result.comment));

      commentForm.reset();
      showMessage('Comment posted successfully.', 'success');
    } catch (error) {
      showMessage('Unable to connect to the server.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
      commentForm.removeAttribute('aria-busy');
    }
  });

  commentsList.querySelectorAll('.comment').forEach(addModerationControls);
}
