const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

router.post('/', orderController.createOrder);
router.get('/', orderController.getOrders);

router.get('/analytics/sales-summary', orderController.getSalesSummary);

router.get('/:id', orderController.getOrderById);
router.patch('/:id/status', orderController.updateOrderStatus);
router.delete('/:id', orderController.deleteOrder);

module.exports = router;