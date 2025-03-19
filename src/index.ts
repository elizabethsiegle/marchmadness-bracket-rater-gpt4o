import html from '../static/index.html';
import OpenAI from 'openai';

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
		const openaiApiKey = env.OPENAI_API_KEY;
        // handle root route -> serve html page
        if (request.method === 'GET' && url.pathname === '/') {
            return new Response(html, {
                headers: { 'Content-Type': 'text/html' },
            });
        } 
        // handle image upload -> analyze image and return response
        else if (request.method === 'POST' && url.pathname === '/analyze-image') {
            //  Extract the uploaded image from form data
            const formData = await request.formData();
            const imageFile = formData.get('image') as File;
            const bracketType = formData.get('bracketType') as string || 'mens';
            
            // check if image file is present
            if (!imageFile) {
                return new Response('No image file uploaded', { status: 400 });
            }
            // Convert the uploaded image to base64 format for API consumption
            const arrayBuffer = await imageFile.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // More efficient base64 conversion for large files w/ chunking
            const chunks = [];
            const chunkSize = 8192; // Process 8KB chunks at a time
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                chunks.push(String.fromCharCode(...uint8Array.subarray(i, i + chunkSize)));
            }
            const base64Image = btoa(chunks.join(''));
            console.log("Image data length:", base64Image.length);
            console.log("Image data preview:", base64Image.substring(0, 100) + "...");

            const oai = new OpenAI({ apiKey:openaiApiKey }); //initialize OpenAI client
            console.log("Starting GPT-4V analysis...");
            // First API call: Analyze the bracket image using GPT-4 Vision
            const completion = await oai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `You are an expert at analyzing ${bracketType === 'mens' ? "Men's" : "Women's"} March Madness brackets. If the bracket is not complete, say who you think would win in some of the match-ups, helping the user decide how to fill it out based on who is playing who. If the bracket is complete, analyze this bracket and say if you agree with the user's predictions. Focus on the teams and who the user predicts will win. Return a grade of A, B, C, D, or F based on the user's predictions and why. Roast them.`
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

            console.log(`initialAnalysis ${initialAnalysis}`);

            // Extract team names and get context for each
            const teamNames = await extractTeamNames(initialAnalysis, base64Image, oai);
            // Create promises for fetching news about top 5 teams
            const searchPromises = teamNames.slice(0, 5).map(async (team) => {
                // More specific search query focused on team, players, and coaches
                const searchQuery = encodeURIComponent(`"${team} basketball" (players OR coach OR roster OR "march madness" OR ncaa OR tournament) ${new Date().getFullYear()}`);
                const url = `https://serpapi.com/search.json?api_key=${env.SERP_API_KEY}&q=${searchQuery}&engine=google&num=8&tbm=nws`;
                
                try {
                    const response = await fetch(url);
                    const result = await response.json() as { 
                        news_results?: { 
                            title: string;
                            link: string;
                            source: string;
                            snippet: string;
                        }[] 
                    };

                    if (!result.news_results) {
                        return `<div class="team-section">
                            <h2>${team}</h2>
                            <p>No recent news found for ${team}</p>
                        </div>`;
                    }

                    // Enhanced filtering for more relevant results
                    const filteredResults = result.news_results.filter(item => {
                        const lowercaseTitle = item.title.toLowerCase();
                        const lowercaseSnippet = item.snippet.toLowerCase();
                        const teamLower = team.toLowerCase();
                        
                        // Must contain team name
                        if (!lowercaseTitle.includes(teamLower) && !lowercaseSnippet.includes(teamLower)) {
                            return false;
                        }

                        // Must contain at least one relevant keyword
                        const relevantKeywords = [
                            'player', 'coach', 'roster', 'tournament', 'march madness', 
                            'ncaa', 'final four', 'sweet sixteen', 'elite eight',
                            'bracket', 'seed', 'ranking', 'conference'
                        ];
                        
                        return relevantKeywords.some(keyword => 
                            lowercaseTitle.includes(keyword) || lowercaseSnippet.includes(keyword)
                        );
                    });

                    // Sort results by relevance
                    const sortedResults = filteredResults.sort((a, b) => {
                        const aScore = getRelevanceScore(a, team);
                        const bScore = getRelevanceScore(b, team);
                        return bScore - aScore;
                    });

                    // Take top 3 most relevant results
                    const topResults = sortedResults.slice(0, 3);

                    // Format as simple HTML with just links
                    return `<div class="team-section">
                        <h2>${team}</h2>
                        ${topResults.length > 0 ? 
                            `<ul class="news-links">
                                ${topResults.map(item => {
                                    const relevanceScore = getRelevanceScore(item, team);
                                    return `<li class="${relevanceScore > 2 ? 'team-in-title' : ''}">
                                        <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                                            ${item.title} (${item.source})
                                            ${relevanceScore > 2 ? '⭐' : ''}
                                        </a>
                                    </li>`;
                                }).join('')}
                            </ul>` :
                            `<p>No team-specific news found for ${team}</p>`
                        }
                    </div>`;
                } catch (error) {
                    console.error(`Error fetching news for ${team}:`, error);
                    return `<div class="team-section">
                        <h2>${team}</h2>
                        <p>Error fetching news</p>
                    </div>`;
                }
            });

            // Helper function to calculate article relevance score
            function getRelevanceScore(article: { title: string; snippet: string }, team: string): number {
                let score = 0;
                const lowercaseTitle = article.title.toLowerCase();
                const lowercaseSnippet = article.snippet.toLowerCase();
                const teamLower = team.toLowerCase();

                // Title relevance
                if (lowercaseTitle.includes(teamLower)) score += 2;
                if (lowercaseTitle.includes('march madness') || lowercaseTitle.includes('tournament')) score += 1;
                if (lowercaseTitle.includes('player') || lowercaseTitle.includes('coach')) score += 1;

                // Snippet relevance
                if (lowercaseSnippet.includes(teamLower)) score += 1;
                if (lowercaseSnippet.includes('march madness') || lowercaseSnippet.includes('tournament')) score += 0.5;
                if (lowercaseSnippet.includes('player') || lowercaseSnippet.includes('coach')) score += 0.5;

                return score;
            }

            // Combine all search results
            const searchResults = await Promise.all(searchPromises);
            const searchContext = `<div class="search-results">
                <h2>Latest News for Each Team</h2>
                ${searchResults.join('<hr class="team-divider">')}
            </div>`;
            console.log(`searchContext: ${searchContext}`);

            // Final analysis/second API call: Enhanced analysis/RAG using GPT-4 with recent news context 
            const finalCompletion = await oai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert ${bracketType === 'mens' ? "men's" : "women's"} basketball analyst. Format your response with HTML tags for better readability. Use <ul> for lists and <br> for line breaks. Do not include any heading tags (h1, h2, etc) in your response as headers will be added separately.`
                    },
                    {
                        role: 'user',
                        content: `Initial bracket analysis: ${initialAnalysis}\n\nRecent news and stats about top teams:\n${searchContext}\n\nAnalyze this ${bracketType === 'mens' ? "men's" : "women's"} bracket incorporating the recent information. Relate it to the input bracket. Roast them, return a grade and detailed analysis of the bracket choices. Do not add any headers or titles to your response.`
                    }
                ],
                max_tokens: 1000
            });
            console.log(`finalCompletion: ${JSON.stringify(finalCompletion)}`);
            
            // Format and return the final enhanced analysis
            const enhancedMessage = finalCompletion.choices[0].message.content;
            console.log(`enhancedMessage: ${enhancedMessage}`);
            return new Response(JSON.stringify({ 
                message: `<div class="analysis">
                    <h2>Team News</h2>
                    ${searchContext}
                    <br><br>
                    <h2>Bracket Analysis</h2>
                    ${enhancedMessage}
                </div>`
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Handle unknown routes
        return new Response('Not found', { status: 404 });
    }
};

// Helper function to extract team names from the image using GPT-4V
async function extractTeamNames(analysis: string, base64Image: string, oai: OpenAI): Promise<string[]> {
    // Make API call to GPT-4V to extract team names from the image
    const teamExtraction = await oai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: "Look at this March Madness bracket image. Return ONLY an array of school names that you can see in the bracket. Format your response as a valid JSON array of strings, with no markdown formatting, no code blocks, and no additional text."
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

    try {
        let content = teamExtraction.choices[0].message.content || '[]';
        
        // Clean up the response by removing markdown formatting
        content = content.replace(/```json\n?/g, ''); // Remove ```json
        content = content.replace(/```\n?/g, '');     // Remove closing ```
        content = content.trim();                     // Remove whitespace
        
        console.log('Cleaned content for parsing:', content);
        
        // Parse the response as JSON array
        const teamList = JSON.parse(content);
        
        // Validate that we got an array of strings
        if (!Array.isArray(teamList)) {
            console.error('Response is not an array:', teamList);
            return [];
        }

        // Filter out any non-string values and empty strings
        return teamList.filter(team => typeof team === 'string' && team.trim().length > 0);
    } catch (e) {
        console.error('Failed to parse team names from GPT response:', e);
        console.error('Raw response:', teamExtraction.choices[0].message.content);
        return [];
    }
}

interface Env {
    AI: any;
	OPENAI_API_KEY: string;
    SERP_API_KEY: string;
}


