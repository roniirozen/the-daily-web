
const commentForm = document.getElementById('comment-form');

if (commentForm) {
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const articleId = commentForm.dataset.articleId;

    const authorNameInput =
      document.getElementById('authorName');

    const contentInput =
      document.getElementById('content');

    const messageElement =
      document.getElementById('comment-message');

    const submitButton =
      commentForm.querySelector('button[type="submit"]');

    const authorName = authorNameInput.value.trim();
    const content = contentInput.value.trim();

    if (!authorName || !content) {
      messageElement.textContent =
        'Please enter your name and a comment.';
      return;
    }

    submitButton.disabled = true;
    messageElement.textContent = '';

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

      const result = await response.json();

      if (!response.ok) {
        messageElement.textContent =
          result.message || 'Unable to post comment.';
        return;
      }

      const commentsList =
        document.getElementById('comments-list');

      const noCommentsMessage =
        document.getElementById('no-comments-message');

      if (noCommentsMessage) {
        noCommentsMessage.remove();
      }

      const commentElement =
        document.createElement('article');

      commentElement.className = 'comment';
      commentElement.dataset.commentId = result.comment._id;

      const commentHeader =
        document.createElement('div');

      commentHeader.className = 'comment-header';

      const authorElement =
        document.createElement('strong');

      authorElement.textContent =
        result.comment.authorName;

      const timeElement =
        document.createElement('time');

      timeElement.textContent =
        new Date(
          result.comment.createdAt
        ).toLocaleString();

      commentHeader.append(
        authorElement,
        timeElement
      );

      const contentElement =
        document.createElement('p');

      contentElement.textContent =
        result.comment.content;

      commentElement.append(
        commentHeader,
        contentElement
      );

      commentsList.prepend(commentElement);

      commentForm.reset();

      messageElement.textContent =
        'Comment posted successfully.';
    } catch (error) {
      messageElement.textContent =
        'Unable to connect to the server.';
    } finally {
      submitButton.disabled = false;
    }
  });
}