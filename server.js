require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// 🟢 Serve file tĩnh (Frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Lưu OTP tạm (trong RAM - sẽ mất khi restart server)
const otpStore = {};

// Cấu hình gửi email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================ API ================

// 🟢 API gửi OTP
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email là bắt buộc' });
  }

  // Tạo OTP 6 chữ số
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

  // Lưu OTP
  otpStore[email] = { otp, expiresAt };
  console.log(`📝 OTP cho ${email}: ${otp} (hết hạn sau 5 phút)`);

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

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ 
      message: 'OTP đã được gửi thành công!',
      email: email 
    });
  } catch (error) {
    console.error('❌ Lỗi gửi email:', error);
    res.status(500).json({ 
      message: 'Gửi OTP thất bại. Vui lòng kiểm tra email và thử lại.' 
    });
  }
});

// 🟢 API xác thực OTP
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email và OTP là bắt buộc' });
  }

  const record = otpStore[email];

  if (!record) {
    return res.status(400).json({ 
      message: '❌ Không tìm thấy OTP. Vui lòng yêu cầu mã mới.' 
    });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[email];
    return res.status(400).json({ 
      message: '⏰ OTP đã hết hạn. Vui lòng yêu cầu mã mới.' 
    });
  }

  if (record.otp !== otp) {
    return res.status(400).json({ 
      message: '❌ OTP không chính xác. Vui lòng thử lại.' 
    });
  }

  // Xác thực thành công
  delete otpStore[email];
  console.log(`✅ Xác thực thành công cho ${email}`);

  res.status(200).json({ 
    message: '🎉 Xác thực thành công!',
    success: true 
  });
});

// 🟢 Route mặc định: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================ Khởi động server ================

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại:`);
  console.log(`   🌐 Local: http://localhost:${PORT}`);
  console.log(`   📧 Email: ${process.env.EMAIL_USER}`);
  console.log(`   ⏰ OTP hết hạn sau 5 phút`);
});