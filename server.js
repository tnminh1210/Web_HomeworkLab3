const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(err.status || 500).json({ 
    success: false, 
    message: err.message || 'Internal Server Error' 
  });
});

app.listen(PORT, () => {
  console.log(`E-commerce API is running on http://localhost:${PORT}`);
});

const orderRoutes = require('./routes/order.routes');
app.use('/api/v1/orders', orderRoutes);

const customerRoutes = require('./routes/customer.routes');
app.use('/api/v1/customers', customerRoutes);