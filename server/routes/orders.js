const express = require('express');
const pool = require('../db');
const moment = require('moment-timezone');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDay = new Date(currentDayResult.rows[0].date);

    await pool.query('DELETE FROM orders WHERE date < $1', [currentDay]);

    const orders = await pool.query(`
      SELECT o.id, o.customer_name, o.date, o.prescription, 
             COALESCE(json_agg(jsonb_build_object('id', p.id, 'drug', p.drug, 'quantity', p.quantity)) 
                      FILTER (WHERE p.id IS NOT NULL), '[]') AS positions
      FROM orders o
      LEFT JOIN positions p ON o.id = p.order_id
      WHERE o.date <= $1  -- фильтруем заказы по дате
      GROUP BY o.id
      ORDER BY o.id ASC;
    `, [currentDay]);

    const ordersWithFormattedDate = orders.rows.map(order => ({
      ...order,
      date: moment(order.date).local().format('YYYY-MM-DD')
    }));

    res.json(ordersWithFormattedDate);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);

    if (!orderResult.rows.length) {
      return res.status(404).send('Заказ не найден');
    }

    const order = orderResult.rows[0];

    res.json(order);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


router.post('/', async (req, res) => {
  const { customerName, date, prescription } = req.body;

  const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
  const currentDay = currentDayResult.rows[0].date;
  currentDay.setDate(currentDay.getDate() + 1);
  const formattedCurrentDay = currentDay instanceof Date ? currentDay.toISOString().split('T')[0] : currentDay.trim();

  console.log('Formatted Current Day from DB:', formattedCurrentDay);
  console.log('Order Date received from client:', date);

  const normalizedOrderDate = date.trim();

  console.log('Normalized Order Date:', normalizedOrderDate);

  if (normalizedOrderDate !== formattedCurrentDay) {
    return res.status(400).send('Дата заказа должна быть текущей');
  }

  try {
    const existingOrder = await pool.query(
      'SELECT id FROM orders WHERE customer_name = $1 AND date = $2',
      [customerName, formattedCurrentDay]
    );

    if (existingOrder.rows.length > 0) {
      return res.status(400).json(`Заказ с таким именем уже существует на текущую дату`);
    }

    const newOrder = await pool.query(
      'INSERT INTO orders (customer_name, date, prescription) VALUES ($1, $2, $3) RETURNING *',
      [customerName, normalizedOrderDate, prescription]
    );
    res.status(201).json(newOrder.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const positionsResult = await pool.query(
      'SELECT drug, quantity FROM positions WHERE order_id = $1',
      [id]
    );

    const positions = positionsResult.rows;

    if (positions.length === 0) {
      await pool.query('DELETE FROM orders WHERE id = $1', [id]);
      return res.status(204).send();
    }

    for (const { drug, quantity } of positions) {
      await pool.query(
        'UPDATE drugs SET stock = stock + $1 WHERE name = $2',
        [quantity, drug]
      );
    }

    await pool.query('DELETE FROM positions WHERE order_id = $1', [id]);

    await pool.query('DELETE FROM orders WHERE id = $1', [id]);

    res.status(204).send();
  } catch (err) {
    res.status(500).send(err.message);
  }
});


module.exports = router;
