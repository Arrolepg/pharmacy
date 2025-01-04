const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const orderRoutes = require('./routes/orders'); // маршрут для заказов
const positionRoutes = require('./routes/positions'); // маршрут для позиций
const dayRoutes = require('./routes/day'); // маршрут для переключения дня

const app = express();

// Включаем CORS для разрешения междоменных запросов
app.use(cors());

// Подключаем middleware для обработки JSON-тел в запросах
app.use(bodyParser.json());

// Подключение маршрутов
app.use('/orders', orderRoutes);  // Заказы
app.use('/positions', positionRoutes);  // Позиции в заказах
app.use('/day', dayRoutes);  // Переключение дня

// Устанавливаем порт, на котором будет работать сервер
const PORT = 3000;

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});