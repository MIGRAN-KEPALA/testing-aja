const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();

const User = require('./models/User');
const paymentService = require('./services/paymentService');

const app = express();
const PORT = process.env.PORT || 3000;

// Regular middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Discord Key System Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Pakasir webhook endpoint
app.post('/webhook/pakasir', async (req, res) => {
  try {
    const signature = req.headers['x-pakasir-signature'];
    const webhookData = req.body;

    console.log('Received Pakasir webhook:', webhookData);

    // Verify webhook (optional, tergantung implementasi Pakasir)
    const verification = paymentService.verifyWebhook(webhookData, signature);
    
    if (!verification.valid) {
      console.error('Webhook verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Check if payment is successful
    if (webhookData.status === 'PAID' || webhookData.status === 'SETTLEMENT') {
      const paymentData = await paymentService.handleSuccessfulPayment(webhookData);
      
      if (paymentData.success) {
        try {
          const user = await User.findOne({ discordId: paymentData.discordId });
          
          if (user) {
            // Generate premium key
            const key = user.generateKey('paid');
            
            // Save payment record
            user.payments.push({
              pakasirInvoiceId: paymentData.invoiceId,
              orderId: paymentData.orderId,
              amount: paymentData.amount,
              status: 'completed',
              paidAt: paymentData.paidAt
            });
            
            await user.save();
            
            console.log(`✅ Premium key generated for user ${user.discordUsername}: ${key}`);
            
            // TODO: Send DM to user with their premium key
            // You can implement Discord DM sending here
          } else {
            console.error(`User not found for discordId: ${paymentData.discordId}`);
          }
        } catch (error) {
          console.error('Error processing payment:', error);
        }
      }
    }

    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('Error handling Pakasir webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint untuk validasi key
app.post('/api/validate-key', async (req, res) => {
  try {
    const { key, hwid } = req.body;

    if (!key) {
      return res.status(400).json({ 
        success: false, 
        message: 'Key is required' 
      });
    }

    // Find user with this key
    const user = await User.findOne({ 'keys.key': key });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Key not found' 
      });
    }

    // Validate key
    const validation = user.validateKey(key);

    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        message: validation.message 
      });
    }

    // Check HWID if provided
    if (hwid) {
      if (!user.hwid) {
        // First time using key, bind HWID
        user.hwid = hwid;
        validation.key.usedAt = new Date();
        await user.save();
      } else if (user.hwid !== hwid) {
        return res.status(403).json({ 
          success: false, 
          message: 'HWID mismatch' 
        });
      }
    }

    res.json({
      success: true,
      message: 'Key is valid',
      data: {
        type: validation.key.type,
        expiresAt: validation.key.expiresAt,
        robloxUsername: user.robloxUsername,
        robloxId: user.robloxId
      }
    });
  } catch (error) {
    console.error('Error validating key:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// API endpoint untuk cek user info
app.get('/api/user/:discordId', async (req, res) => {
  try {
    const { discordId } = req.params;

    const user = await User.findOne({ discordId });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Filter active keys only
    const activeKeys = user.keys.filter(k => 
      k.isActive && new Date() <= new Date(k.expiresAt)
    );

    res.json({
      success: true,
      data: {
        discordUsername: user.discordUsername,
        robloxUsername: user.robloxUsername,
        robloxId: user.robloxId,
        hwid: user.hwid ? 'Bound' : 'Not bound',
        activeKeys: activeKeys.length,
        keys: activeKeys.map(k => ({
          key: k.key,
          type: k.type,
          expiresAt: k.expiresAt
        }))
      }
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// API endpoint untuk cek status payment
app.get('/api/payment/status/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    
    const status = await paymentService.checkPaymentStatus(invoiceId);
    
    res.json(status);
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Payment success page
app.get('/payment/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Success</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
        }
        .success-icon {
          font-size: 80px;
          color: #4CAF50;
        }
        h1 { color: #333; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✅</div>
        <h1>Payment Successful!</h1>
        <p>Terima kasih atas pembelian kamu.</p>
        <p>Premium key sudah dikirim ke Discord kamu!</p>
        <p>Silakan cek DM atau gunakan command <code>/status</code> di server.</p>
      </div>
    </body>
    </html>
  `);
});

// Payment cancel page
app.get('/payment/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Payment Cancelled</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
        }
        .cancel-icon {
          font-size: 80px;
          color: #f44336;
        }
        h1 { color: #333; }
        p { color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="cancel-icon">❌</div>
        <h1>Payment Cancelled</h1>
        <p>Pembayaran kamu telah dibatalkan.</p>
        <p>Silakan coba lagi jika kamu berubah pikiran.</p>
      </div>
    </body>
    </html>
  `);
});

// Cron job untuk reset free keys (setiap hari jam 00:00)
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🔄 Running daily free key cleanup...');
    
    const result = await User.updateMany(
      { 'keys.type': 'free', 'keys.isActive': true },
      { 
        $set: { 
          'keys.$[elem].isActive': false 
        } 
      },
      {
        arrayFilters: [{ 
          'elem.type': 'free',
          'elem.expiresAt': { $lt: new Date() }
        }]
      }
    );
    
    console.log(`✅ Cleaned up ${result.modifiedCount} expired free keys`);
  } catch (error) {
    console.error('❌ Error cleaning up free keys:', error);
  }
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

module.exports = app;
