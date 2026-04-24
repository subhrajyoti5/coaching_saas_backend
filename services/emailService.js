const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends an email using the Resend API
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: to,
      subject: subject,
      html: html
    });
    return data;
  } catch (error) {
    console.error("Error sending email via Resend:", error);
    throw error;
  }
};

/**
 * Sends an OTP email
 */
const sendOtpEmail = async (to, otp) => {
  const subject = 'Your Verification Code - Shixa Coaching';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #333; margin-top: 0;">Verification Code</h2>
      <p style="color: #555; font-size: 16px;">Hello,</p>
      <p style="color: #555; font-size: 16px;">Your verification code is:</p>
      <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
        <strong style="font-size: 24px; letter-spacing: 5px; color: #333;">${otp}</strong>
      </div>
      <p style="color: #555; font-size: 14px;">Please enter this code to complete your verification process. This code will expire soon.</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this code, you can safely ignore this email.</p>
    </div>
  `;
  
  return sendEmail({ to, subject, html });
};

module.exports = {
  resend,
  sendEmail,
  sendOtpEmail
};
