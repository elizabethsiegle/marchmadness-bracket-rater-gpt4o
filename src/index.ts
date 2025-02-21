import html from '../static/index.html';
import OpenAI from 'openai';

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
		const openaiApiKey = env.OPENAI_API_KEY;

        if (request.method === 'GET' && url.pathname === '/') {
            return new Response(html, {
                headers: { 'Content-Type': 'text/html' },
            });
        } else if (request.method === 'POST' && url.pathname === '/analyze-image') {
            const formData = await request.formData();
            const imageFile = formData.get('image') as File;

            if (!imageFile) {
                return new Response('No image file uploaded', { status: 400 });
            }

            const arrayBuffer = await imageFile.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            // const base64Image = Buffer.from(uint8Array).toString('base64');
            // More efficient base64 conversion for large files
            const chunks = [];
            const chunkSize = 8192;
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                chunks.push(String.fromCharCode(...uint8Array.subarray(i, i + chunkSize)));
            }
            const base64Image = btoa(chunks.join(''));
            console.log("Image data length:", base64Image.length);
            console.log("Image data preview:", base64Image.substring(0, 100) + "...");

            const oai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
            console.log("Starting GPT-4V analysis...");
            
            const completion = await oai.beta.chat.completions.parse({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: "You are an expert at analyzing March Madness brackets. If the bracket is not complete, say who you think would win in some of the match-ups, helping the user decide how to fill it out based on who is playing who. If the bracket is complete, analyze this bracket and say if you agree with the user's predictions. Focus on the teams and who the user predicts will win. Return a grade of A, B, C, D, or F based on the user's predictions and why. Roast them."
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 500
            });

            const message = completion.choices[0].message.content;
            console.log("Message:", message);

            const response = new Response(JSON.stringify({ message }), {
                headers: { 'Content-Type': 'application/json' }
            });
            console.log("Sending response:", response);
            return response;
        }

        return new Response('Not found', { status: 404 });
    }
};

interface Env {
    AI: any;
	OPENAI_API_KEY: string;
}


