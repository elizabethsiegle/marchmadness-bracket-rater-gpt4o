# NCAA Bracket Rater with OpenAI GPT-4o, Cloudflare Workers, SerpAPI

A Cloudflare Workers application that analyzes an input March Madness bracket. If the bracket is empty, it provides recommendations of how to fill out certain match-ups. If the bracket is not empty, it provides an analysis of the bracket, including a rating of the bracket and suggestions for improvement.

## Features

- AI-powered analysis of the bracket
- SERP API integration to get recent news and stats about top teams
- OpenAI API integration to provide the AI analysis given the input image of the bracket

## Tech Stack

- Cloudflare Workers
- SerpAPI
- OpenAI GPT-4 API

## Setup

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Clone the repository:
```bash
git clone https://github.com/elizabethsiegle/marchmadness-bracket-rater-gpt4o.git
cd marchmadness-bracket-rater-gpt4o
```

3. Configure Workers AI binding and nodejs_compat in `wrangler.jsonc`:
```json
 "compatibility_flags": [ "nodejs_compat" ],
  "ai": {
    "binding": "AI"
  }
```
4. Set your OpenAI and [SerpAPI](https://serpapi.com/dashboard) variables in a .dev.vars file for local development. For deployed Workers, run 
```bash
npx wrangler secret put <OPENAI_API_KEY>
``` 
and
```bash
npx wrangler secret put <SERPAPI_API_KEY>
```

5. Deploy:
```bash
wrangler deploy
```
Or run locally with
```bash
npx wrangler dev
```
