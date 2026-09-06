const userAdmin = require('../services/userAdminService');

// Explicit view data prevents passwords and database credentials reaching EJS.
function formValues(body = {}) {
  return {
    username: typeof body.username === 'string' ? body.username : '',
    role: typeof body.role === 'string' ? body.role : 'reporter',
    revision: typeof body.revision === 'string' ? body.revision : ''
  };
}

function expectedError(error) {
  if (error.code === 11000) return { status: 409, message: 'That username is already in use.' };
  if ([400, 403, 404, 409].includes(error.status)) return error;
  if (error.name === 'ValidationError') return { status: 400, message: 'Invalid account details.' };
  return null;
}

exports.listUsers = async (req, res, next) => {
  try {
    const data = await userAdmin.listUsers(req.query);
    res.render('editor/users', { pageTitle: 'User administration', ...data });
  } catch (error) {
    const known = expectedError(error);
    if (known) return res.status(known.status).send(known.message);
    next(error);
  }
};

exports.getCreateUser = (req, res) => res.render('editor/create-user', {
  pageTitle: 'Create user', values: formValues(), errorMessage: null
});

exports.createUser = async (req, res, next) => {
  try {
    const id = await userAdmin.createUser(req.body);
    res.redirect(303, `/editor/users/${id}/edit`);
  } catch (error) {
    const known = expectedError(error);
    if (!known) return next(error);
    res.status(known.status).render('editor/create-user', {
      pageTitle: 'Create user', values: formValues(req.body), errorMessage: known.message
    });
  }
};

async function renderEdit(req, res, next, error = null, preserveInput = false) {
  try {
    const user = await userAdmin.getUser(req.params.id);
    res.status(error?.status || 200).render('editor/edit-user', {
      pageTitle: 'Edit user', user,
      values: preserveInput ? formValues(req.body) : {
        username: user.username, role: user.role, revision: user.updatedAt.toISOString()
      },
      isSelf: String(user._id) === String(req.currentUser._id), errorMessage: error?.message || null
    });
  } catch (failure) {
    const known = expectedError(failure);
    if (known) return res.status(known.status).send(known.message);
    next(failure);
  }
}

exports.getEditUser = (req, res, next) => renderEdit(req, res, next);

exports.updateUser = async (req, res, next) => {
  try {
    await userAdmin.updateUser(req.params.id, req.body, req.currentUser._id);
    res.redirect(303, `/editor/users/${req.params.id}/edit`);
  } catch (error) {
    const known = expectedError(error);
    if (!known) return next(error);
    return renderEdit(req, res, next, known, true);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    await userAdmin.deleteUser(req.params.id, req.body, req.currentUser._id);
    res.redirect(303, '/editor/users');
  } catch (error) {
    const known = expectedError(error);
    if (!known) return next(error);
    return renderEdit(req, res, next, known);
  }
};
