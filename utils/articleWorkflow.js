// The complete list of article status changes. Any change that is not listed
// here is refused by the server, whoever requests it.
const STATUS_CHANGES = [
  { from: 'draft', to: 'pending', role: 'reporter' },
  { from: 'returned', to: 'pending', role: 'reporter' },
  { from: 'pending', to: 'published', role: 'editor' },
  { from: 'pending', to: 'returned', role: 'editor' },
  // Editing a published article starts a new version that goes through the
  // same approval process, while the approved version stays public.
  // A Reporter's new version is in preparation until they submit it.
  { from: 'published', to: 'draft', role: 'reporter' },
  // An Editor's own new version waits for approval like a submission.
  { from: 'published', to: 'pending', role: 'editor' }
];

const STATUS_LABELS = {
  draft: 'In preparation',
  pending: 'Awaiting editor approval',
  published: 'Published',
  returned: 'Returned for corrections'
};

function canChangeStatus(from, to, role) {
  return STATUS_CHANGES.some(change =>
    change.from === from && change.to === to && change.role === role
  );
}

// Statuses in which a Reporter may change the content of their own article.
function reporterCanEdit(status) {
  return status === 'draft' || status === 'returned' ||
    canChangeStatus(status, 'draft', 'reporter');
}

module.exports = { STATUS_CHANGES, STATUS_LABELS, canChangeStatus, reporterCanEdit };
