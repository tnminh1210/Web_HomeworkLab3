const pool = require('../config/db');

exports.createOrderService = async (customerId, items) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [customers] = await conn.query('SELECT id FROM customers WHERE id = ?', [customerId]);
    if (customers.length === 0) {
      const error = new Error('Customer not found');
      error.status = 404;
      throw error;
    }

    const productIds = items.map(item => item.productId);
    
    const [products] = await conn.query(
      'SELECT id, price, stock, product_name FROM products WHERE id IN (?) FOR UPDATE',
      [productIds]
    );

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      
      if (!product) {
        const error = new Error(`Product ID ${item.productId} not found`);
        error.status = 404;
        throw error;
      }
      
      if (product.stock < item.quantity) {
        const error = new Error(`Product '${product.product_name}' is out of stock (Requested: ${item.quantity}, Available: ${product.stock})`);
        error.status = 400;
        throw error;
      }

      totalAmount += parseFloat(product.price) * item.quantity;
      
      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price
      });
      
      product.stock -= item.quantity;
    }

    const [orderResult] = await conn.query(
      "INSERT INTO orders (customer_id, status, total_amount) VALUES (?, 'pending', ?)",
      [customerId, totalAmount]
    );
    const orderId = orderResult.insertId;

    for (const item of orderItemsData) {
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, item.unitPrice]
      );
      
      const currentProduct = products.find(p => p.id === item.productId);
      await conn.query(
        'UPDATE products SET stock = ? WHERE id = ?',
        [currentProduct.stock, item.productId]
      );
    }

    await conn.commit();
    return { orderId, customerId, totalAmount, status: 'pending', items: orderItemsData };

  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

exports.getOrdersService = async (query) => {
  const { status, customerId, page = 1, limit = 5 } = query;
  const skip = (Number(page) - 1) * Number(limit);
  let whereClauses = [];
  let queryParams = [];

  if (status) {
    whereClauses.push('o.status = ?');
    queryParams.push(status);
  }
  if (customerId) {
    whereClauses.push('o.customer_id = ?');
    queryParams.push(customerId);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM orders o ${whereSql}`, queryParams);
  const totalOrders = countResult[0].total;

  const sql = `
    SELECT 
      o.id as order_id, c.full_name as customer_name, c.email, 
      o.status, o.total_amount, 
      COALESCE(SUM(oi.quantity), 0) as total_items_count, o.created_at
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    ${whereSql}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `;
  const [orders] = await pool.query(sql, [...queryParams, Number(limit), Number(skip)]);

  return {
    orders,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders
    }
  };
};

exports.getOrderByIdService = async (orderId) => {
  const [orders] = await pool.query(`
    SELECT o.*, c.full_name, c.email, c.phone
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
  `, [orderId]);

  if (orders.length === 0) return null;

  const [items] = await pool.query(`
    SELECT p.product_name, oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) as subtotal
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `, [orderId]);

  return { ...orders[0], items };
};

exports.updateOrderStatusService = async (orderId, newStatus) => {
  const allowedStatuses = ['pending', 'completed', 'cancelled'];
  if (!allowedStatuses.includes(newStatus)) {
    const error = new Error("Invalid status. Allowed values: 'pending', 'completed', 'cancelled'");
    error.status = 400;
    throw error;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (orders.length === 0) {
      const error = new Error('Order not found');
      error.status = 404;
      throw error;
    }

    const currentStatus = orders[0].status;

    if (currentStatus === 'cancelled') {
      const error = new Error('Order is already cancelled and cannot be changed');
      error.status = 400;
      throw error;
    }

    if (newStatus === 'cancelled') {
      const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
      for (const item of items) {
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
    
    await conn.commit();
    return { orderId, newStatus, message: 'Order status updated successfully' };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

exports.deleteOrderService = async (orderId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (orders.length === 0) {
      const error = new Error('Order not found');
      error.status = 404;
      throw error;
    }

    const currentStatus = orders[0].status;

    if (currentStatus !== 'cancelled') {
      const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
      for (const item of items) {
        await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
      }
    }

    await conn.query('DELETE FROM orders WHERE id = ?', [orderId]);

    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

exports.getSalesSummaryService = async () => {
  const [summary] = await pool.query(`
    SELECT 
      COALESCE(SUM(total_amount), 0) as totalRevenue,
      COUNT(id) as completedOrdersCount,
      COALESCE(SUM(total_amount) / NULLIF(COUNT(id), 0), 0) as averageOrderValue
    FROM orders
    WHERE status = 'completed'
  `);

  const [topSellingProducts] = await pool.query(`
    SELECT p.product_name, SUM(oi.quantity) as total_sold
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE o.status = 'completed'
    GROUP BY p.id
    ORDER BY total_sold DESC
    LIMIT 3
  `);

  return { ...summary[0], topSellingProducts };
};

exports.getCustomerOrderHistoryService = async (customerId) => {
  const [customers] = await pool.query('SELECT id, full_name, email FROM customers WHERE id = ?', [customerId]);
  
  if (customers.length === 0) {
    const error = new Error('Customer not found');
    error.status = 404;
    throw error;
  }

  const [orders] = await pool.query('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [customerId]);
  
  const [spent] = await pool.query(`
    SELECT COALESCE(SUM(total_amount), 0) as totalLifetimeSpent 
    FROM orders 
    WHERE customer_id = ? AND status = 'completed'
  `, [customerId]);

  return { 
    customer: customers[0], 
    totalLifetimeSpent: spent[0].totalLifetimeSpent,
    orders 
  };
};