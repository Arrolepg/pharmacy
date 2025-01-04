const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/drugs/:name', async (req, res) => {
  const { name } = req.params;

  try {
    const drugResult = await pool.query('SELECT * FROM drugs WHERE name = $1', [name]);

    if (!drugResult.rows.length) {
      return res.status(404).send('Препарат не найден');
    }

    res.json(drugResult.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/', async (req, res) => {
  const { drug, quantity, orderId } = req.body;

  try {
    const drugInfo = await pool.query('SELECT * FROM drugs WHERE name = $1', [drug]);
    if (!drugInfo.rows.length) {
      return res.status(404).send('Препарат не найден');
    }
    const drugRequiresPrescription = drugInfo.rows[0].requires_prescription;

    const orderResult = await pool.query('SELECT prescription FROM orders WHERE id = $1', [orderId]);
    if (!orderResult.rows.length) {
      return res.status(404).send('Заказ не найден');
    }
    const orderRequiresPrescription = orderResult.rows[0].prescription;

    console.log("Order Requires Prescription:", orderRequiresPrescription);
    console.log("Drug Requires Prescription:", drugRequiresPrescription);

    if (drugRequiresPrescription && !orderRequiresPrescription) {
      return res.status(400).send('Данный заказ не может иметь рецептуальный препарат без рецепта');
    }

    if (drugInfo.rows[0].stock < quantity) {
      return res.status(400).send('На складе недостаточное количество препарата');
    }

   const existingPosition = await pool.query(
    'SELECT id, quantity FROM positions WHERE drug = $1 AND order_id = $2',
    [drug, orderId]
  );

  if (existingPosition.rows.length > 0) {
    const newQuantity = existingPosition.rows[0].quantity + quantity;

    if (drugInfo.rows[0].stock < quantity) {
      return res.status(400).send('На складе недостаточное количество препарата');
    }

    await pool.query(
      'UPDATE positions SET quantity = $1 WHERE id = $2',
      [newQuantity, existingPosition.rows[0].id]
    );

    await pool.query(
      'UPDATE drugs SET stock = stock - $1 WHERE name = $2',
      [quantity, drug]
    );

    return res.status(200).send('Позиция обновлена');
  }

  const newPosition = await pool.query(
    'INSERT INTO positions (drug, quantity, order_id) VALUES ($1, $2, $3) RETURNING *',
    [drug, quantity, orderId]
  );

  await pool.query('UPDATE drugs SET stock = stock - $1 WHERE name = $2', [quantity, drug]);

  res.status(201).json(newPosition.rows[0]);
  } catch (err) {
    console.error("Ошибка добавления позиции", err);
    res.status(500).send(err.message);
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT positions.drug, positions.quantity FROM positions WHERE positions.id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send('Position not found');
    }

    const { drug, quantity } = result.rows[0];

    await pool.query('DELETE FROM positions WHERE id = $1', [id]);

    await pool.query(
      'UPDATE drugs SET stock = stock + $1 WHERE drugs.name = $2',
      [quantity, drug]
    );

    res.status(204).send();
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/:id/back', async (req, res) => {
  const { id } = req.params;

  try {
    console.log('Request received to move position back with ID:', id);

    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDate = new Date(currentDayResult.rows[0].date);
    

    console.log('Order Date received from DB:', currentDate);

    const positionResult = await pool.query('SELECT * FROM positions WHERE id = $1', [id]);
    if (!positionResult.rows.length) {
      return res.status(404).send('Позиция не найдена');
    }
    const position = positionResult.rows[0];
    const currentOrderId = position.order_id;

    const ordersResult = await pool.query(
      'SELECT id FROM orders WHERE date = $1 ORDER BY id ASC',
      [currentDate]
    );

    if (ordersResult.rows.length < 2) {
      return res.status(400).send('Недостаточно заказов на сегодня для перемещения');
    }

    const orders = ordersResult.rows.map((order) => order.id);
    const currentIndex = orders.indexOf(currentOrderId);

    const previousOrderId =
      currentIndex > 0 ? orders[currentIndex - 1] : orders[orders.length - 1];

    console.log('Previous order ID:', previousOrderId);

    const previousOrder = await pool.query('SELECT * FROM orders WHERE id = $1', [previousOrderId]);
    const previousOrderData = previousOrder.rows[0];

    const drugInfo = await pool.query('SELECT * FROM drugs WHERE name = $1', [position.drug]);
    if (drugInfo.rows.length === 0) {
      return res.status(400).send('Препарат не найден');
    }
    const drugRequiresPrescription = drugInfo.rows[0].requires_prescription;

    if (drugRequiresPrescription && !previousOrderData.prescription) {
      return res
        .status(400)
        .send('Данный заказ не может иметь рецептуальный препарат без рецепта');
    }

    const existingPositionResult = await pool.query(
      'SELECT * FROM positions WHERE order_id = $1 AND drug = $2',
      [previousOrderId, position.drug]
    );

    if (existingPositionResult.rows.length > 0) {
      const existingPosition = existingPositionResult.rows[0];
      const newQuantity = existingPosition.quantity + position.quantity;

      await pool.query(
        'UPDATE positions SET quantity = $1 WHERE id = $2',
        [newQuantity, existingPosition.id]
      );

      await pool.query('DELETE FROM positions WHERE id = $1', [id]);

      return res.send(`Position quantity updated in order ID ${previousOrderId}.`);
    }

    await pool.query('UPDATE positions SET order_id = $1 WHERE id = $2', [previousOrderId, id]);

    res.send(`Position moved to order ID ${previousOrderId}.`);
  } catch (err) {
    console.error('Error moving position:', err);
    res.status(500).send('Ошибка переноса позиции');
  }
});

router.post('/:id/move', async (req, res) => {
  const { id } = req.params;
  
  try {

    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDate = new Date(currentDayResult.rows[0].date);
    

    console.log('Order Date received from DB:', currentDate);
    
    const positionResult = await pool.query('SELECT * FROM positions WHERE id = $1', [id]);
    if (!positionResult.rows.length) {
      return res.status(404).send('Позиция не найдена');
    }
    const position = positionResult.rows[0];
    const currentOrderId = position.order_id;

    const ordersForToday = await pool.query(
      'SELECT id FROM orders WHERE date = $1 ORDER BY id ASC',
      [currentDate]
    );

    if (ordersForToday.rows.length < 2) {
      return res.status(400).send('Недостаточно заказов на сегодня для перемещения');
    }

    const orderIds = ordersForToday.rows.map(order => order.id);

    const currentOrderIndex = orderIds.indexOf(currentOrderId);
    let nextOrderId;

    if (currentOrderIndex === orderIds.length - 1) {
      nextOrderId = orderIds[0];
    } else {
      nextOrderId = orderIds[currentOrderIndex + 1];
    }

    const nextOrder = await pool.query('SELECT * FROM orders WHERE id = $1', [nextOrderId]);
    const nextOrderData = nextOrder.rows[0];

    const drugInfo = await pool.query('SELECT * FROM drugs WHERE name = $1', [position.drug]);
    if (drugInfo.rows.length === 0) {
      return res.status(400).send('Препарат не найден');
    }
    const drugRequiresPrescription = drugInfo.rows[0].requires_prescription;

    if (drugRequiresPrescription && !nextOrderData.prescription) {
      return res
        .status(400)
        .send('Данный заказ не может иметь рецептуальный препарат без рецепта');
    }

    const existingPositionResult = await pool.query(
      'SELECT * FROM positions WHERE order_id = $1 AND drug = $2',
      [nextOrderId, position.drug]
    );

    if (existingPositionResult.rows.length > 0) {
      const existingPosition = existingPositionResult.rows[0];
      const newQuantity = existingPosition.quantity + position.quantity;

      await pool.query(
        'UPDATE positions SET quantity = $1 WHERE id = $2',
        [newQuantity, existingPosition.id]
      );

      await pool.query('DELETE FROM positions WHERE id = $1', [id]);

      return res.send(`Position quantity updated in order ID ${nextOrderId}.`);
    } else {
      await pool.query('UPDATE positions SET order_id = $1 WHERE id = $2', [nextOrderId, id]);

      return res.send(`Position moved to order ID ${nextOrderId}.`);
    }
  } catch (err) {
    console.error('Error moving position:', err);
    res.status(500).send('Ошибка переноса позиции');
  }
});



module.exports = router;
