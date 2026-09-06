
const commentForm = document.getElementById('comment-form');

if (commentForm) {
  const authorNameInput = document.getElementById('authorName');
  const contentInput = document.getElementById('content');
  const messageElement = document.getElementById('comment-message');
  const submitButton = commentForm.querySelector('button[type="submit"]');

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

      const commentsList =
        document.getElementById('comments-list');

      const noCommentsMessage =
        document.getElementById('no-comments-message');

      if (noCommentsMessage) {
        noCommentsMessage.remove();
      }

      const commentElement = document.createElement('article');

      commentElement.className = 'comment';
      commentElement.dataset.commentId = result.comment._id;

      const commentHeader = document.createElement('div');

      commentHeader.className = 'comment-header';

      const authorElement = document.createElement('strong');

      authorElement.textContent = result.comment.authorName;

      const timeElement = document.createElement('time');
      const createdAt = new Date(result.comment.createdAt);

      timeElement.dateTime = createdAt.toISOString();
      timeElement.textContent = createdAt.toLocaleString('en-GB');

      commentHeader.append(
        authorElement,
        timeElement
      );

      const contentElement = document.createElement('p');

      contentElement.className = 'comment-content';
      contentElement.textContent = result.comment.content;

      commentElement.append(
        commentHeader,
        contentElement
      );

      commentsList.prepend(commentElement);

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
