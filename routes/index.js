const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('public/home', {
    pageTitle: 'The Web Daily'
  });
});

module.exports = router;
