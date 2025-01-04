const express = require('express');
const pool = require('../db');
const router = express.Router();

// Получение текущей даты
router.get('/current', async (req, res) => {
  try {
    // Получаем текущую дату из БД
    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDay = new Date(currentDayResult.rows[0].date);

    // Увеличиваем дату на 1 день
    currentDay.setDate(currentDay.getDate() + 1); // Увеличиваем дату на 1

    // Форматируем дату в строку для отправки
    res.json({ date: currentDay.toISOString().split('T')[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка получения текущей даты.');
  }
});


// Переключение текущей даты
router.post('/next', async (req, res) => {
  try {
    // Получаем текущую дату из БД
    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDay = new Date(currentDayResult.rows[0].date);

    // Увеличиваем дату на 1 день
    currentDay.setDate(currentDay.getDate() + 1); // Увеличиваем дату на 1

    // Обновляем текущую дату в БД
    await pool.query('UPDATE current_day SET date = $1 WHERE id = 1', [currentDay]);

    // Удаляем заказы старой даты (меньше текущей)
    await pool.query('DELETE FROM orders WHERE date < $1', [currentDay]);

    // Обновляем остатки препаратов случайным образом
    const drugs = await pool.query('SELECT id, stock FROM drugs');
    for (const drug of drugs.rows) {
      const restockAmount = Math.floor(Math.random() * 20) + 5; // Случайное пополнение
      await pool.query('UPDATE drugs SET stock = stock + $1 WHERE id = $2', [restockAmount, drug.id]);
    }

    res.send('День успешно изменен');
  } catch (err) {
    console.error(err);
    res.status(500).send('ОШибка преключения дня');
  }
});

module.exports = router;