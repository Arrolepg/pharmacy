const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const orderRoutes = require('./routes/orders');
const positionRoutes = require('./routes/positions');
const dayRoutes = require('./routes/day');

const app = express();

app.use(cors());

app.use(bodyParser.json());

app.use('/orders', orderRoutes);
app.use('/positions', positionRoutes);
app.use('/day', dayRoutes);

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});