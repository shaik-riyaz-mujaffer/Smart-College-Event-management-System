const nodemailer = require('nodemailer');

// Create reusable transporter
let transporter;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_EMAIL,
                pass: process.env.SMTP_PASSWORD
            }
        });
    }
    return transporter;
}

/**
 * Send registration confirmation email with QR code.
 * @param {Object} opts
 * @param {string} opts.to - recipient email
 * @param {string} opts.studentName - student name
 * @param {string} opts.eventTitle - event title
 * @param {string} opts.eventDate - formatted event date
 * @param {string} opts.eventVenue - venue string
 * @param {string} opts.qrDataUrl - base64 QR code data URL
 * @param {Buffer} opts.pdfBuffer - PDF ticket buffer
 */
async function sendRegistrationEmail({ to, studentName, eventTitle, eventDate, eventVenue, qrDataUrl, pdfBuffer }) {
    // Skip if SMTP not configured
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
        console.log('[Email] SMTP not configured — skipping email to', to);
        return;
    }

    // Extract base64 image from data URL
    const base64Image = qrDataUrl.replace(/^data:image\/png;base64,/, '');

    const mailOptions = {
        from: `"CampusEvents" <${process.env.SMTP_EMAIL}>`,
        to,
        subject: `🎟 Registration Confirmed — ${eventTitle}`,
        html: `
            <div style="font-family:'Inter',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px 16px 0 0;">
                    <h1 style="color:#fff;margin:0;font-size:22px;">🎉 Registration Confirmed</h1>
                </div>
                <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
                    <p style="color:#374151;">Hi <strong>${studentName}</strong>,</p>
                    <p style="color:#374151;">Your registration for <strong>${eventTitle}</strong> has been confirmed!</p>
                    
                    <div style="background:#f3f4f6;border-radius:12px;padding:16px;margin:16px 0;">
                        <p style="margin:4px 0;color:#4b5563;"><strong>📅 Date:</strong> ${eventDate}</p>
                        <p style="margin:4px 0;color:#4b5563;"><strong>📍 Venue:</strong> ${eventVenue}</p>
                    </div>

                    <div style="text-align:center;margin:24px 0;">
                        <p style="color:#6b7280;font-size:14px;margin-bottom:8px;">Your Attendance QR Code</p>
                        <img src="cid:qrcode" alt="QR Code" style="width:200px;height:200px;border-radius:12px;border:2px solid #e5e7eb;" />
                    </div>

                    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px;border-radius:8px;margin:16px 0;">
                        <p style="color:#92400e;margin:0;font-size:13px;">
                            ⚠ <strong>Important:</strong> Show this QR code at the entrance. Each QR can only be used once.
                        </p>
                    </div>

                    <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:24px;">CampusEvents — Smart College Event Management</p>
                </div>
            </div>
        `,
        attachments: [
            {
                filename: 'qrcode.png',
                content: base64Image,
                encoding: 'base64',
                cid: 'qrcode' // referenced in the HTML <img src="cid:qrcode">
            }
        ]
    };

    // Attach PDF if available
    if (pdfBuffer) {
        mailOptions.attachments.push({
            filename: `ticket_${eventTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        });
    }

    try {
        await getTransporter().sendMail(mailOptions);
        console.log('[Email] Sent registration confirmation to', to);
    } catch (error) {
        console.error('[Email] Failed to send email to', to, ':', error.message);
        // Don't throw — email failure shouldn't block registration
    }
}

module.exports = { sendRegistrationEmail };
