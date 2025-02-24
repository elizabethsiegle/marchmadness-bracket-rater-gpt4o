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

            const oai = new OpenAI({ apiKey:openaiApiKey });
            console.log("Starting GPT-4V analysis...");
            
            const completion = await oai.chat.completions.create({
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

            // Extract team names from the initial analysis
            const initialAnalysis = completion.choices[0].message.content || '';

            // Extract team names and get context for each
            const teamNames = extractTeamNames(initialAnalysis);
            const searchPromises = teamNames.slice(0, 5).map(async (team) => {
                const searchQuery = encodeURIComponent(`${team} march madness 2024 basketball recent performance stats news`);
                const url = `https://serpapi.com/search.json?api_key=${env.SERP_API_KEY}&q=${searchQuery}&engine=google&num=3&tbm=nws`;
                
                const response = await fetch(url);
                const result = await response.json() as { news_results?: { title: string; snippet: string }[] };
                
                // Log search results for debugging
                console.log(`Search results for ${team}:`, result.news_results);
                
                return `<div class="team-section">
                    <h2>${team}</h2>
                    ${result.news_results?.map((item) => 
                        `<div class="news-item">
                            <h3>${item.title}</h3>
                            <p>${item.snippet}</p>
                        </div>`
                    ).join('') || ''}
                </div>`;
            });

            const searchResults = await Promise.all(searchPromises);
            const searchContext = `<div class="search-results">
                ${searchResults.join('<hr>')}
            </div>`;
            console.log(`searchContext: ${searchContext}`);

            // Final analysis with RAG
            const finalCompletion = await oai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert basketball analyst. Format your response with HTML tags for better readability. Use <h2> for regions, <ul> for lists, and <br> for line breaks.'
                    },
                    {
                        role: 'user',
                        content: `Initial bracket analysis: ${initialAnalysis}\n\nRecent news and stats about top teams:\n${searchContext}\n\nProvide an enhanced analysis incorporating this recent information. Format with clear sections and spacing.`
                    }
                ],
                max_tokens: 1000
            });
            console.log(`finalCompletion: ${JSON.stringify(finalCompletion)}`);

            const enhancedMessage = finalCompletion.choices[0].message.content;
            console.log(`enhancedMessage: ${enhancedMessage}`);
            return new Response(JSON.stringify({ 
                message: `<div class="analysis">
                    ${searchContext}
                    <br><br>
                    <h2>Enhanced Bracket Analysis</h2>
                    ${enhancedMessage}
                </div>`
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Not found', { status: 404 });
    }
};

// Helper function to extract team names from the analysis
function extractTeamNames(analysis: string): string[] {
    // This is a simplified version. You might want to use more sophisticated NLP
    const commonTeamNames = [
        'Duke', 'Kentucky', 'Kansas', 'North Carolina', 'Gonzaga', 
        'Houston', 'Purdue', 'UConn', 'Tennessee', 'Arizona'
    ];
    
    return commonTeamNames.filter(team => 
        analysis.toLowerCase().includes(team.toLowerCase())
    );
}

interface Env {
    AI: any;
	OPENAI_API_KEY: string;
    SERP_API_KEY: string;
}


