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


// Добавление позиции в заказ
router.post('/', async (req, res) => {
  const { drug, quantity, orderId } = req.body;

  try {
    // Получаем информацию о препарате
    const drugInfo = await pool.query('SELECT * FROM drugs WHERE name = $1', [drug]);
    if (!drugInfo.rows.length) {
      return res.status(404).send('Препарат не найден');
    }
    const drugRequiresPrescription = drugInfo.rows[0].requires_prescription;

    // Получаем заказ и проверяем, установлен ли флаг рецепта
    const orderResult = await pool.query('SELECT prescription FROM orders WHERE id = $1', [orderId]);
    if (!orderResult.rows.length) {
      return res.status(404).send('Заказ не найден');
    }
    const orderRequiresPrescription = orderResult.rows[0].prescription;

    // Логируем данные для отладки
    console.log("Order Requires Prescription:", orderRequiresPrescription);
    console.log("Drug Requires Prescription:", drugRequiresPrescription);

    // Если препарат требует рецепт, но заказ не имеет флага рецепта
    if (drugRequiresPrescription && !orderRequiresPrescription) {
      return res.status(400).send('Данный заказ не может иметь рецептуальный препарат без рецепта');
    }

    // Проверяем наличие достаточного количества препарата на складе
    if (drugInfo.rows[0].stock < quantity) {
      return res.status(400).send('На складе недостаточное количество препарата');
    }

   // Проверяем, есть ли уже этот препарат в заказе
   const existingPosition = await pool.query(
    'SELECT id, quantity FROM positions WHERE drug = $1 AND order_id = $2',
    [drug, orderId]
  );

  if (existingPosition.rows.length > 0) {
    // Если препарат уже есть в заказе, обновляем его количество
    const newQuantity = existingPosition.rows[0].quantity + quantity;

    // Проверяем, достаточно ли препарата на складе для обновления
    if (drugInfo.rows[0].stock < quantity) {
      return res.status(400).send('На складе недостаточное количество препарата');
    }

    await pool.query(
      'UPDATE positions SET quantity = $1 WHERE id = $2',
      [newQuantity, existingPosition.rows[0].id]
    );

    // Обновляем остатки на складе
    await pool.query(
      'UPDATE drugs SET stock = stock - $1 WHERE name = $2',
      [quantity, drug]
    );

    return res.status(200).send('Позиция обновлена');
  }

  // Если препарата нет в заказе, добавляем новую позицию
  const newPosition = await pool.query(
    'INSERT INTO positions (drug, quantity, order_id) VALUES ($1, $2, $3) RETURNING *',
    [drug, quantity, orderId]
  );

  // Обновляем остатки на складе
  await pool.query('UPDATE drugs SET stock = stock - $1 WHERE name = $2', [quantity, drug]);

  res.status(201).json(newPosition.rows[0]);
  } catch (err) {
    console.error("Ошибка добавления позиции", err);
    res.status(500).send(err.message);
  }
});


// Удаление позиции
// router.delete('/:id', async (req, res) => {
//   const { id } = req.params;
//   try {
//     await pool.query('DELETE FROM positions WHERE id = $1', [id]);
//     res.status(204).send();
//   } catch (err) {
//     res.status(500).send(err.message);
//   }
// });

// Удаление позиции
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Получаем количество и ID препарата
    const result = await pool.query(
      'SELECT positions.drug, positions.quantity FROM positions WHERE positions.id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).send('Position not found');
    }

    const { drug, quantity } = result.rows[0];

    // Удаляем позицию из заказа
    await pool.query('DELETE FROM positions WHERE id = $1', [id]);

    // Обновляем количество препарата в базе данных
    await pool.query(
      'UPDATE drugs SET stock = stock + $1 WHERE drugs.name = $2',
      [quantity, drug]
    );

    res.status(204).send();
  } catch (err) {
    res.status(500).send(err.message);
  }
});



// **Маршрут для переноса позиции в предыдущий заказ**
router.post('/:id/back', async (req, res) => {
  const { id } = req.params;

  try {
    console.log('Request received to move position back with ID:', id);

    // Получаем текущую дату из базы данных
    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDate = new Date(currentDayResult.rows[0].date);
    

    console.log('Order Date received from DB:', currentDate); // Логируем дату, полученную от клиента

    // Получаем текущую позицию
    const positionResult = await pool.query('SELECT * FROM positions WHERE id = $1', [id]);
    if (!positionResult.rows.length) {
      return res.status(404).send('Позиция не найдена');
    }
    const position = positionResult.rows[0];
    const currentOrderId = position.order_id;

    // Находим все заказы за текущую дату
    const ordersResult = await pool.query(
      'SELECT id FROM orders WHERE date = $1 ORDER BY id ASC',
      [currentDate]
    );

    if (ordersResult.rows.length < 2) {
      return res.status(400).send('Недостаточно заказов на сегодня для перемещения');
    }

    const orders = ordersResult.rows.map((order) => order.id);
    const currentIndex = orders.indexOf(currentOrderId);

    // Находим предыдущий заказ
    const previousOrderId =
      currentIndex > 0 ? orders[currentIndex - 1] : orders[orders.length - 1]; // Предыдущий заказ или последний

    console.log('Previous order ID:', previousOrderId);

    // Проверяем, что предыдущий заказ удовлетворяет требованиям (например, рецепт)
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

    // Проверяем, есть ли препарат уже в предыдущем заказе
    const existingPositionResult = await pool.query(
      'SELECT * FROM positions WHERE order_id = $1 AND drug = $2',
      [previousOrderId, position.drug]
    );

    if (existingPositionResult.rows.length > 0) {
      // Препарат уже есть в предыдущем заказе, увеличиваем количество
      const existingPosition = existingPositionResult.rows[0];
      const newQuantity = existingPosition.quantity + position.quantity;

      await pool.query(
        'UPDATE positions SET quantity = $1 WHERE id = $2',
        [newQuantity, existingPosition.id]
      );

      // Удаляем оригинальную позицию из текущего заказа
      await pool.query('DELETE FROM positions WHERE id = $1', [id]);

      return res.send(`Position quantity updated in order ID ${previousOrderId}.`);
    }

    // Если препарата нет, переносим позицию в предыдущий заказ
    await pool.query('UPDATE positions SET order_id = $1 WHERE id = $2', [previousOrderId, id]);

    res.send(`Position moved to order ID ${previousOrderId}.`);
  } catch (err) {
    console.error('Error moving position:', err);
    res.status(500).send('Ошибка переноса позиции');
  }
});

// Перенос позиции в следующий заказ
router.post('/:id/move', async (req, res) => {
  const { id } = req.params;
  
  try {

    // Получаем текущую дату из базы данных
    const currentDayResult = await pool.query('SELECT date FROM current_day LIMIT 1');
    const currentDate = new Date(currentDayResult.rows[0].date);
    

    console.log('Order Date received from DB:', currentDate); // Логируем дату, полученную от клиента
    
    // Получаем текущую позицию
    const positionResult = await pool.query('SELECT * FROM positions WHERE id = $1', [id]);
    if (!positionResult.rows.length) {
      return res.status(404).send('Позиция не найдена');
    }
    const position = positionResult.rows[0];
    const currentOrderId = position.order_id;

    // Находим заказы, соответствующие текущей дате
    const ordersForToday = await pool.query(
      'SELECT id FROM orders WHERE date = $1 ORDER BY id ASC',
      [currentDate]
    );

    if (ordersForToday.rows.length < 2) {
      return res.status(400).send('Недостаточно заказов на сегодня для перемещения');
    }

    // Получаем массив ID заказов текущего дня
    const orderIds = ordersForToday.rows.map(order => order.id);

    // Определяем следующий заказ
    const currentOrderIndex = orderIds.indexOf(currentOrderId);
    let nextOrderId;

    if (currentOrderIndex === orderIds.length - 1) {
      // Если текущий заказ последний, выбираем первый заказ
      nextOrderId = orderIds[0];
    } else {
      // Иначе выбираем следующий заказ
      nextOrderId = orderIds[currentOrderIndex + 1];
    }

    // Проверяем, что следующий заказ удовлетворяет требованиям (например, рецепт)
    const nextOrder = await pool.query('SELECT * FROM orders WHERE id = $1', [nextOrderId]);
    const nextOrderData = nextOrder.rows[0];

    // Если позиция требует рецепт, проверяем, установлен ли флаг рецепта в следующем заказе
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

    // Проверяем, есть ли препарат уже в следующем заказе
    const existingPositionResult = await pool.query(
      'SELECT * FROM positions WHERE order_id = $1 AND drug = $2',
      [nextOrderId, position.drug]
    );

    if (existingPositionResult.rows.length > 0) {
      // Препарат уже есть в следующем заказе, увеличиваем количество
      const existingPosition = existingPositionResult.rows[0];
      const newQuantity = existingPosition.quantity + position.quantity;

      await pool.query(
        'UPDATE positions SET quantity = $1 WHERE id = $2',
        [newQuantity, existingPosition.id]
      );

      // Удаляем оригинальную позицию из текущего заказа
      await pool.query('DELETE FROM positions WHERE id = $1', [id]);

      return res.send(`Position quantity updated in order ID ${nextOrderId}.`);
    } else {
      // Если препарата нет, переносим позицию в следующий заказ
      await pool.query('UPDATE positions SET order_id = $1 WHERE id = $2', [nextOrderId, id]);

      return res.send(`Position moved to order ID ${nextOrderId}.`);
    }
  } catch (err) {
    console.error('Error moving position:', err);
    res.status(500).send('Ошибка переноса позиции');
  }
});



module.exports = router;
