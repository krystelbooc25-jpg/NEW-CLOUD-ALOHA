// api/admin-email.js

export default async function handler(req, res) {
    // CORS Headers to allow frontend requests
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { applicantEmail, applicantName, status, branch } = req.body;

    let subject = '';
    let htmlContent = '';

    // Dynamic Email Content based on Admin Action
    if (status === 'Approved') {
        subject = '🎉 Application Approved - ALOHA Security';
        htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #10b981;">Application Approved!</h2>
                <p>Dear <strong>${applicantName}</strong>,</p>
                <p>Congratulations! Your application to ALOHA Security has been officially approved.</p>
                <p><strong>Deployment Branch:</strong> ${branch}</p>
                <p>Please report to the main office for your final briefing, uniform measurement, and schedule.</p>
                <br>
                <p>Welcome to the Elite Team!</p>
            </div>
        `;
    } else if (status === 'Rejected') {
        subject = 'Application Update - ALOHA Security';
        htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #D2042D;">Application Update</h2>
                <p>Dear <strong>${applicantName}</strong>,</p>
                <p>Thank you for your interest in joining ALOHA Security. After careful review, we regret to inform you that we will not be moving forward with your application at this time.</p>
                <p>We wish you the best in your future endeavors.</p>
            </div>
        `;
    } else if (status === 'Terminated') {
        subject = 'Employment Notice - ALOHA Security';
        htmlContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #D2042D;">Notice of Termination</h2>
                <p>Dear <strong>${applicantName}</strong>,</p>
                <p>This email serves as official notice that your deployment and employment have been terminated.</p>
                <p>Please coordinate with the HR Department within 48 hours for your final clearance and turnover of equipment.</p>
            </div>
        `;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}` 
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev', // Note: Must be your verified domain for production
                to: applicantEmail, 
                subject: subject,
                html: htmlContent
            })
        });

        const data = await response.json();

        if (response.ok) {
            res.status(200).json({ success: true, data });
        } else {
            res.status(400).json({ success: false, error: data });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}