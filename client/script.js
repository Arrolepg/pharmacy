const API_URL = "http://localhost:3000";

function showError(message, isSuccess = false) {
  const errorMessage = document.getElementById("error-message");
  const errorText = document.getElementById("error-text");

  // Устанавливаем текст сообщения
  errorText.textContent = message;

  // Убираем скрытие сообщения, если оно есть
  errorMessage.classList.remove("hidden");

  // Убираем старые классы (успех или ошибка)
  errorMessage.classList.remove("success", "error");

  // Добавляем нужный класс в зависимости от типа сообщения
  if (isSuccess) {
    errorMessage.classList.add("success");  // Зеленый для успеха
  } else {
    errorMessage.classList.add("error");    // Красный для ошибки
  }

  // Закрываем сообщение через 2 секунды
  setTimeout(() => {
    errorMessage.classList.add("hidden");
  }, 2000);
}

function hideError() {
  const errorMessage = document.getElementById("error-message");
  errorMessage.classList.add("hidden"); // Прячем сообщение
}

// Скрываем сообщение при нажатии на кнопку закрытия
document.getElementById("close-error").addEventListener("click", hideError);




// Функция для получения текущей даты из БД
async function fetchCurrentDate() {
  try {
    const response = await fetch(`${API_URL}/day/current`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById("currentDate").textContent = `Текущая дата: ${data.date}`;
    } else {
      showError("Не удалось получить текущую дату");
    }
  } catch (error) {
    showError("Не удалось получить текущую дату");
  }
}

// Функция для получения всех заказов
async function fetchOrders() {
  const response = await fetch(`${API_URL}/orders`);
  const orders = await response.json();
  renderOrders(orders);
}

// Отображение всех заказов
function renderOrders(orders) {
  const ordersDiv = document.getElementById("orders");
  ordersDiv.innerHTML = orders
    .map(
      (order) => `
    <div class="order-card">
      <h3 class="order-title">${order.customer_name} (${order.date})</h3>
      <p class="prescription-status">Рецепты предоставлены: ${order.prescription}</p>
      <ul class="positions-list">
        ${order.positions
          .map(
            (position) => `
              <li class="position-item">
                <span class="position-text">${position.drug} - ${position.quantity} pcs</span>
                <div class="position-buttons">
                  <button class="icon-button delete-button" onclick="deletePosition(${position.id})" title="Удалить позицию">
                    <img src="../assets/delete-button.svg" alt="Delete" class="button-icon" />
                  </button>
                  <button class="icon-button delete-button" onclick="movePositionToBack(${position.id})" title="Переместить позицию влево">
                    <img src="../assets/left-arrow.svg" alt="Back" class="button-icon" />
                  </button>
                  <button class="icon-button delete-button" onclick="movePositionToNext(${position.id})" title="Переместить позицию вправо">
                    <img src="../assets/right-arrow.svg" alt="Next" class="button-icon" />
                  </button>
                </div>
              </li>`
          )
          .join("")}
      </ul>
      <div class="order-buttons">
        <button class="oval-button" onclick="deleteOrder(${order.id})">Удалить заказ</button>
        <button class="oval-button" onclick="openAddPositionForm(${order.id})">Добавить</button>
      </div>
    </div>
  `
    )
    .join("");
}


// Удаление заказа
async function deleteOrder(id) {
  try {
  const response = await fetch(`${API_URL}/orders/${id}`, { method: "DELETE" });
  if (!response.ok) {
    showError("Не удалось удалить заказ");
  }
  fetchOrders();
  showError("Заказ успешно удален", true);
  } catch (error) {
    showError("Не удалось удалить заказ");
  }
}

// Удаление позиции
async function deletePosition(id) {
  try {
    const response = await fetch(`${API_URL}/positions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      showError("Не удалось удалить позицию заказа");
    }
    fetchOrders();
    showError("Позиция заказа успешно удалена", true);
    } catch (error) {
      showError("Не удалось удалить позицию заказа");
    }
}

// Перенос позиции в предыдущий заказ
async function movePositionToBack(positionId) {
  try {
    const response = await fetch(`${API_URL}/positions/${positionId}/back`, {
      method: 'POST',
    });
    if (response.ok) {
      showError("Позиция заказа перемещена в предыдущий заказ", true);
      fetchOrders();
    } else {
      const errorMessage = await response.text();
      showError(errorMessage); // Показываем ошибку от сервера
    }
  } catch (error) {
    showError("Перемещение не удалось");
  }
}

// Перенос позиции в следующий заказ
async function movePositionToNext(positionId) {
  try {
    const response = await fetch(`${API_URL}/positions/${positionId}/move`, {
      method: 'POST',
    });
    if (response.ok) {
      showError("Позиция заказа перемещена в следующий заказ", true);
      fetchOrders();
    } else {
      const errorMessage = await response.text();
      showError(errorMessage); // Показываем ошибку от сервера
    }
  } catch (error) {
    showError("Перемещение не удалось");
  }
}

// Открытие формы для добавления позиции в заказ
// function openAddPositionForm(orderId) {
//   const drug = prompt("Enter drug name:");
//   const quantity = parseInt(prompt("Enter quantity:"), 10);

//   if (!drug || isNaN(quantity) || quantity <= 0) {
//     alert("Invalid input!");
//     return;
//   }

//   addPositionToOrder(orderId, drug, quantity);
// }

function openAddPositionForm(orderId) {
  const modal = document.getElementById("addPositionModal");
  const closeModal = document.getElementById("closeModal");
  const cancelBtn = document.getElementById("cancelBtn");
  const form = document.getElementById("addPositionForm");

  // Open modal
  modal.style.display = "block";

  // Close modal
  function closeForm() {
    modal.style.display = "none";
    form.reset();
  }

  closeModal.addEventListener("click", closeForm);
  cancelBtn.addEventListener("click", closeForm);

  // Handle form submission
  form.onsubmit = function (e) {
    e.preventDefault();
    const drug = form.drugName.value.trim();
    const quantity = parseInt(form.quantity.value, 10);

    if (!drug || isNaN(quantity) || quantity <= 0) {
      showError("Некорректный ввод");
      return;
    }

    addPositionToOrder(orderId, drug, quantity);
    closeForm();
  };
}

// Добавление позиции в заказ с проверкой на рецепт
async function addPositionToOrder(orderId, drug, quantity) {
  // Получаем информацию о заказе
  const response = await fetch(`${API_URL}/orders/${orderId}`);
  const order = await response.json();

  // Получаем информацию о препарате (нужно, чтобы знать, требует ли он рецепт)
  const drugInfo = await fetch(`${API_URL}/positions/drugs/${drug}`);
  const drugData = await drugInfo.json();

  // Логируем полученную информацию о препарате
  console.log("Drug Data:", drugData); // Выведем все данные о препарате для отладки

  // Если в заказе нет рецепта, но препарат требует рецепт, выводим ошибку
  if (!order.prescription && drugData.requires_prescription) {
    showError("Данный заказ не может иметь рецептуальный препарат без рецепта");
    return;
  }

  // Логируем перед отправкой запроса на сервер
  console.log("Sending position to add:", { drug, quantity, orderId });

  // Если все проверки пройдены, добавляем позицию в заказ
  const positionResponse = await fetch(`${API_URL}/positions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ drug, quantity, orderId }),
  });

  if (positionResponse.ok) {
    showError("Позиция добавлена в заказ", true);
    fetchOrders();
  } else {
    showError("Невозможно добавить позицию в заказ");
    const errorMessage = await positionResponse.text();
    showError(errorMessage); // Показываем ошибку от сервера
  }
}

// Форма для создания нового заказа
document.getElementById("createOrderForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const customerName = document.getElementById("customerName").value;
  let orderDate = document.getElementById("orderDate").value;
  const prescription = document.getElementById("prescription").checked;

  if (!customerName || !orderDate) {
    showError("Все поля обязательны");
    return;
  }

  // Преобразуем строку даты в объект Date
  const dateObject = new Date(orderDate);

  // Преобразуем объект Date в строку в формате ISO (UTC)
  orderDate = dateObject.toISOString().split('T')[0]; // Извлекаем только дату (без времени)

  // Логируем перед отправкой на сервер
  console.log('Processed Order Date:', orderDate); // Логируем дату, отправляемую на сервер

  try {
    const response = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerName,
        date: orderDate,
        prescription,
      }),
    });

    if (response.ok) {
      fetchOrders(); // Обновляем список заказов
      showError("Новый заказ создан", true);
      document.getElementById("createOrderForm").reset();
    } else {
      const errorMessage = await response.text();
      showError(errorMessage); // Показываем ошибку от сервера
    }
  } catch (error) {
    showError("Ошибка при создании заказа");
  }
});

// Переключение дня
async function switchDay() {
  const response = await fetch(`${API_URL}/day/next`, { method: "POST" });
  if (response.ok) {
    showError("Дата изменена на следующий день", true);
    fetchOrders();
    fetchCurrentDate();
  } else {
    showError("Ошибка изменения даты");
  }
}

// Инициализация
fetchOrders();
fetchCurrentDate();

// was 129