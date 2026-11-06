const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');

router.get('/:id/order-history', orderController.getCustomerOrderHistory);

module.exports = router;