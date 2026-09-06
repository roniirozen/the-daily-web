const path = require('path');
const express = require('express');
const connectDB = require('./config/db');
const indexRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send('Internal server error');
});

async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
