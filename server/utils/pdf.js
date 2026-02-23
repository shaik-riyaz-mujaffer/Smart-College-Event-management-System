const PDFDocument = require('pdfkit');

/**
 * Generate a PDF ticket with event details and QR code.
 * @param {Object} opts
 * @param {string} opts.studentName
 * @param {string} opts.eventTitle
 * @param {string} opts.eventDate
 * @param {string} opts.eventVenue
 * @param {string} opts.registrationId
 * @param {string} opts.qrDataUrl - base64 data URL of QR code
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateTicketPDF({ studentName, eventTitle, eventDate, eventVenue, registrationId, qrDataUrl }) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A5', margin: 40 });
            const chunks = [];

            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Header
            doc.rect(0, 0, doc.page.width, 80).fill('#6366f1');
            doc.fontSize(20).fillColor('#ffffff').text('🎟 Event Ticket', 40, 25, { align: 'center' });
            doc.fontSize(10).fillColor('#e0e7ff').text('CampusEvents', 40, 52, { align: 'center' });

            // Body
            doc.moveDown(3);
            doc.fillColor('#111827');

            // Event Title
            doc.fontSize(18).text(eventTitle, { align: 'center' });
            doc.moveDown(0.5);

            // Divider
            doc.strokeColor('#e5e7eb').moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
            doc.moveDown(0.8);

            // Details
            doc.fontSize(11).fillColor('#6b7280');
            doc.text('Student Name', { continued: false });
            doc.fontSize(13).fillColor('#111827').text(studentName);
            doc.moveDown(0.4);

            doc.fontSize(11).fillColor('#6b7280').text('Date & Time');
            doc.fontSize(13).fillColor('#111827').text(eventDate);
            doc.moveDown(0.4);

            doc.fontSize(11).fillColor('#6b7280').text('Venue');
            doc.fontSize(13).fillColor('#111827').text(eventVenue);
            doc.moveDown(0.4);

            doc.fontSize(11).fillColor('#6b7280').text('Registration ID');
            doc.fontSize(10).fillColor('#111827').text(registrationId);
            doc.moveDown(1);

            // QR Code
            doc.fontSize(10).fillColor('#6b7280').text('Scan this QR at the entrance:', { align: 'center' });
            doc.moveDown(0.3);

            // Convert data URL to buffer for PDFKit
            const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
            const qrBuffer = Buffer.from(base64, 'base64');
            const qrX = (doc.page.width - 150) / 2;
            doc.image(qrBuffer, qrX, doc.y, { width: 150, height: 150 });

            doc.moveDown(8);

            // Footer
            doc.fontSize(8).fillColor('#9ca3af').text(
                'This ticket is non-transferable. QR code can only be scanned once.',
                40, doc.page.height - 50,
                { align: 'center', width: doc.page.width - 80 }
            );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateTicketPDF };
