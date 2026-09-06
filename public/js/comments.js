
const commentForm = document.getElementById('comment-form');

if (commentForm) {
  const authorNameInput = document.getElementById('authorName');
  const contentInput = document.getElementById('content');
  const messageElement = document.getElementById('comment-message');
  const submitButton = commentForm.querySelector('button[type="submit"]');
  const commentsList = document.getElementById('comments-list');
  const moreButton = document.getElementById('more-comments');

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
}
