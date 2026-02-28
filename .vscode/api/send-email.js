// api/send-email.js

export default async function handler(req, res) {
    // Payagan ang frontend na maka-connect dito (CORS Headers)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Kunin ang data mula sa application4.html
    const { name, email, position, phone } = req.body;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Kukunin nito ang API key na ilalagay natin sa Vercel mamaya
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}` 
            },
            body: JSON.stringify({
                from: 'onboarding@resend.dev', 
                // PALITAN ITO NG GMAIL MO NA GINAMIT MO PANG-REGISTER SA RESEND:
                to: 'krystelbooc25@gmail.com', 
                subject: '🚨 New ALOHA Security Applicant',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #D2042D;">New Applicant Alert</h2>
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Position:</strong> ${position}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Contact Number:</strong> ${phone}</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #888;">Log in to the ALOHA Admin Dashboard to review the full details, resume, and ID.</p>
                    </div>
                `
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