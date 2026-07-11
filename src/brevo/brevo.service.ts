import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class BrevoService {
  private readonly apiKey = process.env.BREVO_API_KEY!;
  private readonly senderEmail = process.env.BREVO_SENDER_EMAIL!;
  private readonly senderName = process.env.BREVO_SENDER_NAME || 'Popli';

  async sendEmailOtp(toEmail: string, otp: string): Promise<void> {
    const body = {
      sender: { name: this.senderName, email: this.senderEmail },
      to: [{ email: toEmail }],
      subject: `${otp} is your Popli verification code`,
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f0f;color:#fff;border-radius:12px;">
          <h2 style="color:#a855f7;margin-bottom:8px;">Verify your email</h2>
          <p style="color:#ccc;margin-bottom:24px;">Use the code below to verify your email address. It expires in <strong>5 minutes</strong>.</p>
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;text-align:center;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#a855f7;">${otp}</span>
          </div>
          <p style="color:#666;font-size:12px;margin-top:24px;">If you didn't request this, ignore this email. Do not share this code with anyone.</p>
        </div>
      `,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Brevo send failed:', err);
      throw new InternalServerErrorException('Failed to send verification email');
    }
  }
}