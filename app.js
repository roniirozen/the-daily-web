const path = require('path');
const express = require('express');
const connectDB = require('./config/db');
const indexRoutes = require('./routes');
const authRoutes = require('./routes/authRoutes');
const reporterRoutes = require('./routes/reporterRoutes');
const { loadCurrentUser } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(loadCurrentUser);
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/reporter', reporterRoutes);

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

