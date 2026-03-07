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

/**
 * Send email notification to all branch-matched students when a new event is created.
 * @param {Object} opts
 * @param {string} opts.title - event title
 * @param {string} opts.description - event description
 * @param {string|Date} opts.date - event date
 * @param {string} opts.venue - event venue
 * @param {number} opts.registrationFee - registration fee (0 = free)
 * @param {string} opts.targetBranch - branch code or 'ALL'
 */
async function sendNewEventNotification({ title, description, date, venue, registrationFee, targetBranch }) {
    // Skip if SMTP not configured
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
        console.log('[Email] SMTP not configured — skipping new-event notifications');
        return;
    }

    const User = require('../models/User');

    // Build query: all students, filtered by branch if not 'ALL'
    const query = { role: 'student' };
    const branch = (targetBranch || 'ALL').toUpperCase();
    if (branch !== 'ALL') {
        query.branch = branch;
    }

    const students = await User.find(query).select('email name');
    if (students.length === 0) {
        console.log(`[Email] No ${branch} students found — skipping notifications`);
        return;
    }

    console.log(`[Email] Sending new event notification to ${students.length} ${branch} student(s)`);

    // Format the event date nicely
    const eventDate = new Date(date).toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    // Format the registration fee
    const feeDisplay = Number(registrationFee) > 0 ? `₹${registrationFee}` : 'Free';

    // Build one email per student and send in parallel
    const results = await Promise.allSettled(students.map(student => {
        const mailOptions = {
            from: `"CampusEvents" <${process.env.SMTP_EMAIL}>`,
            to: student.email,
            subject: `🎉 New Event: ${title}`,
            html: `
                <div style="font-family:'Inter',Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
                    <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:16px 16px 0 0;">
                        <h1 style="color:#fff;margin:0;font-size:22px;">🎉 New Event Available!</h1>
                    </div>
                    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
                        <p style="color:#374151;">Hi <strong>${student.name}</strong>,</p>
                        <p style="color:#374151;">A new event has been posted for your department. Check it out!</p>

                        <div style="background:#f3f4f6;border-radius:12px;padding:16px;margin:16px 0;">
                            <h2 style="margin:0 0 8px;color:#1f2937;font-size:18px;">${title}</h2>
                            <p style="margin:4px 0;color:#4b5563;"><strong>📅 Date:</strong> ${eventDate}</p>
                            <p style="margin:4px 0;color:#4b5563;"><strong>📍 Venue:</strong> ${venue}</p>
                            <p style="margin:4px 0;color:#4b5563;"><strong>💰 Registration Fee:</strong> ${feeDisplay}</p>
                        </div>

                        <div style="background:#f9fafb;border-radius:8px;padding:12px;margin:12px 0;">
                            <p style="color:#6b7280;font-size:14px;margin:0;"><strong>About:</strong></p>
                            <p style="color:#4b5563;font-size:14px;margin:4px 0 0;">${description}</p>
                        </div>

                        <div style="text-align:center;margin:20px 0;">
                            <p style="color:#6366f1;font-weight:600;font-size:15px;">Log in to CampusEvents to register now!</p>
                        </div>

                        <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:24px;">CampusEvents — Smart College Event Management</p>
                    </div>
                </div>
            `
        };
        return getTransporter().sendMail(mailOptions);
    }));

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[Email] New event notifications: ${sent} sent, ${failed} failed`);
}

module.exports = { sendRegistrationEmail, sendNewEventNotification };
