const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const Article = require('../models/Article');
const { hashPassword } = require('../utils/password');

const publicFields = '_id username role createdAt updatedAt';

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function validateInput(body, creating) {
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  if (!/^[a-z0-9_.-]{3,60}$/.test(username)) {
    fail(400, 'Username must be 3–60 characters: letters, numbers, dots, underscores or hyphens.');
  }
  if (!['reporter', 'editor'].includes(body?.role)) fail(400, 'Choose Reporter or Editor.');
  const password = body.password === undefined ? '' : body.password;
  if (typeof password !== 'string' || ((creating || password !== '') &&
      (password.length < 8 || password.length > 128 || !password.trim()))) {
    fail(400, 'New passwords must contain 8–128 characters and cannot be blank.');
  }
  return { username, role: body.role, password };
}

async function getUser(id) {
  if (!mongoose.isObjectIdOrHexString(id)) fail(400, 'Invalid user ID.');
  const user = await User.findById(id).select(publicFields).lean();
  if (!user) fail(404, 'User not found.');
  return user;
}

async function protectEditor(user, actorId, removingEditor) {
  if (!removingEditor) return;
  if (String(user._id) === String(actorId)) {
    fail(409, 'You cannot delete or demote your own active account.');
  }
  // This guard protects normal administration. A count across documents is
  // not a transaction; concurrent administration needs integration testing.
  if (user.role === 'editor' && await User.countDocuments({ role: 'editor' }) <= 1) {
    fail(409, 'The last remaining Editor cannot be deleted or demoted.');
  }
}

async function passwordFields(password) {
  if (!password) return {};
  const { hash, salt } = await hashPassword(password);
  return { passwordHash: hash, passwordSalt: salt };
}

exports.getUser = getUser;

exports.listUsers = async (query) => {
  const search = query.search ?? '';
  const pageValue = query.page ?? '1';
  if (typeof search !== 'string' || search.length > 60) fail(400, 'Search must be at most 60 characters.');
  if (typeof pageValue !== 'string' || !/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(Number(pageValue))) {
    fail(400, 'Invalid page number.');
  }
  const normalized = search.trim().toLowerCase();
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Prefix search uses the existing normalized username index.
  const filter = normalized ? { username: { $regex: '^' + escaped } } : {};
  const total = await User.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(Number(pageValue), totalPages);
  const users = await User.find(filter).select(publicFields).sort({ username: 1 })
    .skip((page - 1) * 20).limit(20).lean();
  return { users, search, page, totalPages, total };
};

exports.createUser = async (body) => {
  const input = validateInput(body, true);
  const user = await User.create({ username: input.username, role: input.role,
    ...await passwordFields(input.password) });
  return user._id;
};

exports.updateUser = async (id, body, actorId) => {
  const input = validateInput(body, false);
  const user = await getUser(id);
  await protectEditor(user, actorId, user.role === 'editor' && input.role !== 'editor');
  if (body.revision !== user.updatedAt.toISOString()) fail(409, 'This account changed. Reload before saving.');
  const changes = { username: input.username, role: input.role, ...await passwordFields(input.password) };
  // Revoke sessions before a password/role change, so a cleanup failure cannot
  // leave the change applied with old sessions still active.
  if (input.password || user.role !== input.role) await Session.deleteMany({ user: user._id });
  const updated = await User.findOneAndUpdate({ _id: id, updatedAt: user.updatedAt },
    { $set: changes }, { new: true, runValidators: true }).select(publicFields).lean();
  if (!updated) fail(409, 'This account changed. Reload before saving.');
  return updated;
};

exports.deleteUser = async (id, body, actorId) => {
  const user = await getUser(id);
  await protectEditor(user, actorId, true);
  if (body?.confirmation !== user.username) fail(400, 'Type the exact username to confirm deletion.');
  if (body.revision !== user.updatedAt.toISOString()) fail(409, 'This account changed. Reload before deleting.');
  if (await Article.exists({ $or: [{ reporter: user._id }, { 'publicationHistory.editor': user._id }] })) {
    fail(409, 'This user is referenced by articles or publication history and cannot be deleted.');
  }
  await Session.deleteMany({ user: user._id });
  const result = await User.deleteOne({ _id: id, updatedAt: user.updatedAt });
  if (!result.deletedCount) fail(409, 'This account changed. Reload before deleting.');
};
