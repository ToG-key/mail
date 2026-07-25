// ============================================
// BACKEND CHO VERCEL - SERVERLESS FUNCTIONS
// ============================================

const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Lưu OTP tạm (trong RAM - sẽ mất khi cold start)
const otpStore = {};

// Kiểm tra cấu hình email
let transporter;
let emailConfigured = false;

try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    emailConfigured = true;
    console.log('✅ Email configured successfully');
  } else {
    console.warn('⚠️ Email credentials missing!');
  }
} catch (error) {
  console.error('❌ Email config error:', error);
}

// ================ HEALTH CHECK ================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    emailConfigured: emailConfigured,
    env: {
      EMAIL_USER: process.env.EMAIL_USER ? '✅ Set' : '❌ Missing',
      EMAIL_PASS: process.env.EMAIL_PASS ? '✅ Set' : '❌ Missing',
    }
  });
});

// ================ API GỬI OTP ================

app.post('/api/send-otp', async (req, res) => {
  console.log('📨 Received /api/send-otp request:', req.body);

  const { email } = req.body;

  // Validate email
  if (!email) {
    return res.status(400).json({ 
      success: false,
      message: 'Email là bắt buộc' 
    });
  }

  // Kiểm tra cấu hình email
  if (!emailConfigured || !transporter) {
    console.error('❌ Email not configured!');
    return res.status(500).json({
      success: false,
      message: 'Lỗi cấu hình email. Vui lòng kiểm tra biến môi trường.'
    });
  }

  try {
    // Tạo OTP 6 chữ số
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

    // Lưu OTP
    otpStore[email] = { otp, expiresAt };
    console.log(`📝 OTP for ${email}: ${otp}`);

    // Nội dung email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🔐 Mã xác thực OTP của bạn',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #2563eb;">🔐 Xác thực tài khoản</h2>
          <p>Chào bạn,</p>
          <p>Mã OTP của bạn là:</p>
          <div style="font-size: 32px; font-weight: bold; background: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; letter-spacing: 6px;">
            ${otp}
          </div>
          <p style="color: #6b7280; font-size: 14px;">⏰ Mã có hiệu lực trong <strong>5 phút</strong>. Vui lòng không chia sẻ với ai.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af;">📧 Đây là email tự động, vui lòng không trả lời.</p>
        </div>
      `,
    };

    // Gửi email
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}`);

    res.status(200).json({
      success: true,
      message: 'OTP đã được gửi thành công!',
      email: email
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: `Gửi OTP thất bại: ${error.message || 'Lỗi không xác định'}`
    });
  }
});

// ================ API XÁC THỰC OTP ================

app.post('/api/verify-otp', (req, res) => {
  console.log('🔍 Received /api/verify-otp request:', req.body);

  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: 'Email và OTP là bắt buộc'
    });
  }

  const record = otpStore[email];

  if (!record) {
    return res.status(400).json({
      success: false,
      message: '❌ Không tìm thấy OTP. Vui lòng yêu cầu mã mới.'
    });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({
      success: false,
      message: '⏰ OTP đã hết hạn. Vui lòng yêu cầu mã mới.'
    });
  }

  if (record.otp !== otp) {
    return res.status(400).json({
      success: false,
      message: '❌ OTP không chính xác. Vui lòng thử lại.'
    });
  }

  // Xác thực thành công
  delete otpStore[email];
  console.log(`✅ Verified ${email}`);

  res.status(200).json({
    success: true,
    message: '🎉 Xác thực thành công!'
  });
});

// ================ SERVE FRONTEND ================

// Serve index.html (nếu có thư mục public)
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch (error) {
    res.status(200).json({
      message: '🚀 OTP API Server is running!',
      endpoints: {
        health: '/health',
        sendOTP: '/api/send-otp (POST)',
        verifyOTP: '/api/verify-otp (POST)'
      }
    });
  }
});

// Catch-all: serve index.html hoặc JSON
app.get('*', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } catch (error) {
    res.status(200).json({
      message: '🚀 OTP API Server is running!',
      endpoints: {
        health: '/health',
        sendOTP: '/api/send-otp (POST)',
        verifyOTP: '/api/verify-otp (POST)'
      }
    });
  }
});

// ================ EXPORT CHO VERCEL ================
// ⚠️ QUAN TRỌNG: KHÔNG dùng app.listen()
// Export app để Vercel chạy Serverless Function

module.exports = app;
