// HTML forms can only send GET or POST. A form that updates or deletes a
// resource posts a hidden _method field (PATCH, PUT or DELETE), and the
// request is routed with that HTTP method. Only urlencoded form POSTs are
// converted, so a link or any other request can never change its method.
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
