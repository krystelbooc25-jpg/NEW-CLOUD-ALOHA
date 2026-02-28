import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS pre-flight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Parse the request body
    const { applicant_name, applicant_email, position } = await req.json()
    
    // 3. Get API Key from Environment Variables
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    if (!RESEND_API_KEY) {
      throw new Error('Missing RESEND_API_KEY')
    }

    // 4. Call Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Aloha Security <onboarding@resend.dev>',
        to: ['krystelbooc25@gmail.com'], 
        subject: `New Application: ${applicant_name}`,
        html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; color: #333;">
            <div style="background-color: #D2042D; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px; letter-spacing: 1px;">ALOHA SECURITY AGENCY</h1>
                <p style="color: #ffcccc; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase;">Recruitment Notification</p>
            </div>
            <div style="padding: 30px; background-color: #ffffff;">
                <h2 style="color: #D2042D; font-size: 20px; border-bottom: 2px solid #f4f4f4; padding-bottom: 10px;">New Job Application Received</h2>
                <p style="font-size: 16px; line-height: 1.6;">A new candidate has submitted their application summary:</p>
                <div style="background-color: #f9f9f9; border-radius: 6px; padding: 20px; margin-top: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #666; width: 150px;">Applicant Name:</td>
                            <td style="padding: 8px 0; font-size: 16px; color: #1a1a1a;">${applicant_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #666;">Email Address:</td>
                            <td style="padding: 8px 0; font-size: 16px; color: #1a1a1a;">${applicant_email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-weight: bold; color: #666;">Position Applied:</td>
                            <td style="padding: 8px 0;">
                                <span style="background-color: #D2042D; color: white; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold;">
                                    ${position}
                                </span>
                            </td>
                        </tr>
                    </table>
                </div>
                <div style="margin-top: 30px; text-align: center;">
                    <a href="https://your-admin-dashboard-link.com" 
                       style="background-color: #1a1a1a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 15px;">
                       Review Applicant Details
                    </a>
                </div>
            </div>
            <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #888;">
                <p style="margin: 0;">This is an automated message from the Aloha Security Management System.</p>
                <p style="margin: 5px 0 0 0;">&copy; 2025 Aloha Security Agency. All Rights Reserved.</p>
            </div>
        </div>
        `,
      }),
    })

    const data = await res.json()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})