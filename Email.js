const nodemailer = require('nodemailer');
require('dotenv').config()
const smtpTransport = require('nodemailer-smtp-transport');
const SendEmail = (To, CC, Sub, HTML, Attachments = []) => {
    return new Promise((resolve, reject) => {
        const transporter = nodemailer.createTransport(
            smtpTransport({
                host: 'smtp.office365.com',
                port: 587,
                secure: false,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_APP_PASSWORD
                },
                tls: {
                    ciphers: 'SSLv3',
                    rejectUnauthorized: false // This is important for self-signed certificates
                }
            })
        );
        HTML+='<small><i>Note: This is an automated message. Please do not reply to this email.<i/></small>';
        const mailOptions = {
            from: process.env.SERVER_EMAIL,
            to: To,
            cc: CC,
            subject: Sub,
            html: HTML
        };
        if (Attachments.length > 0) {
            mailOptions.attachments = Attachments;
        }
        resolve(true)
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error on sending email:', error);
                reject(error);
            } else {
                console.log("EmailSent" + info);
                resolve(info);
            }
        });
    });
}
module.exports = SendEmail;