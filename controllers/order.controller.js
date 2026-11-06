const { createOrderService, getOrdersService, getOrderByIdService, updateOrderStatusService, deleteOrderService, getSalesSummaryService, getCustomerOrderHistoryService } = require('../services/order.service');
exports.createOrder = async (req, res, next) => {
  try {
    const { customerId, items } = req.body;

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid payload: customerId and non-empty items array are required' });
    }

    for (const item of items) {
      if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
         return res.status(400).json({ success: false, message: 'Every item must have a productId and a positive integer quantity' });
      }
    }

    const newOrder = await createOrderService(customerId, items);

    res.status(201).json({ success: true, message: 'Order created successfully', data: newOrder });

  } catch (error) {
    next(error);
  }
};

exports.getOrders = async (req, res, next) => {
  try {
    const data = await getOrdersService(req.query);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const order = await getOrderByIdService(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const result = await updateOrderStatusService(req.params.id, status);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

exports.deleteOrder = async (req, res, next) => {
  try {
    await deleteOrderService(req.params.id);
    res.status(200).json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    next(error);
  }
};

exports.getSalesSummary = async (req, res, next) => {
  try {
    const data = await getSalesSummaryService();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getCustomerOrderHistory = async (req, res, next) => {
  try {
    const data = await getCustomerOrderHistoryService(req.params.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};