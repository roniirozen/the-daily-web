// HTML forms can only send GET or POST. A hidden _method field turns a form
// POST into PATCH, PUT or DELETE.
const OVERRIDABLE_METHODS = ['PATCH', 'PUT', 'DELETE'];

function methodOverride(req, res, next) {
  if (req.method === 'POST' && req.is('urlencoded') && typeof req.body?._method === 'string') {
    const method = req.body._method.toUpperCase();
    if (OVERRIDABLE_METHODS.includes(method)) req.method = method;
    delete req.body._method;
  }
  next();
}

module.exports = { methodOverride };
