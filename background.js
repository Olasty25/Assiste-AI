// WARNING: It's better to ask the user for their key and store it in chrome.storage.
// For this simple example, we'll place it here.
// DO NOT PUBLISH AN EXTENSION WITH YOUR KEY HARDCODED.
const OPENAI_API_KEY = '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'; 
const GEMINI_API_KEY = 'AIzaSyDSucdMeCaKOAHVeCsVn_8mGWmxRldCAhA';


// =================================================================================
// MAIN MESSAGE LISTENER
// =================================================================================

// This is the main listener for all messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Note: No changes are needed here. The logic correctly passes the `model`
    // to the underlying fetch functions.
    if (request.action === "getSummary") {
        fetchSummary(request.text, request.model, sendResponse);
        return true; // IMPORTANT: This tells Chrome to wait for the async response.
    }
    else if (request.action === "getSearchResponse") {
        fetchSearchResponse(request.query, request.model, sendResponse);
        return true; // IMPORTANT: Also required for the search action.
    }
    else if (request.action === "findKeyInfo") {
        fetchKeyInfo(request.text, request.model, sendResponse);
        return true;
    }
    else if (request.action === "analyzePage") {
        fetchAnalysis(request.text, request.model, sendResponse);
        return true;
    }
});


// =================================================================================
// PROMPT-DEFINING FUNCTIONS (No changes needed here)
// =================================================================================

// Function to handle summarizing page content
async function fetchSummary(pageText, model, sendResponse) {
    const prompt = `Analyze the following website content. Provide a response formatted exactly as follows:
1. A single paragraph starting with the bolded word "**Summary:**".
2. A blank line.
3. A single paragraph starting with the bolded word "**Key Information:**".
4. A bulleted list using asterisks (*) for each key point.
Do not use any markdown headings (like '#').

Content:
${pageText}`;

    // We use the shared dispatcher function to make the actual API call
    await makeApiCall(prompt, model, sendResponse);
}

// Function to handle a user's direct search query
async function fetchSearchResponse(query, model, sendResponse) {
    const prompt = `You are a concise and helpful AI assistant. Answer the following user query. Format your response using simple markdown (bolding and bullet points). Query: "${query}"`;
    await makeApiCall(prompt, model, sendResponse);
}

// Function to extract key info as exact excerpts wrapped in <HIGHLIGHT> tags
async function fetchKeyInfo(pageText, model, sendResponse) {
    const prompt = `You are an assistant that extracts the most important exact excerpts from a website's text. Read the Content below and return up to 12 of the most relevant short excerpts (phrases or short sentences). IMPORTANT: Return only the excerpts wrapped EXACTLY in <HIGHLIGHT>...</HIGHLIGHT> tags, one after another with no extra commentary, numbering, or explanation. Each excerpt should be verbatim from the content provided. If none found, return an empty response.

Content:
${pageText}`;
    await makeApiCall(prompt, model, sendResponse);
}

// Analyze the page and produce flashcards (JSON array of {question, answer})
async function fetchAnalysis(pageText, model, sendResponse) {
    const prompt = `You are an assistant that reads website content and generates useful study flashcards.
IMPORTANT: Return ONLY valid JSON and NOTHING ELSE — no explanation, no markdown, no commentary, no code fences. The output must be a single JSON array (starts with '[' and ends with ']').
Produce an array with up to 5 flashcards. Each flashcard must be an object with exactly two string keys: "question" and "answer".
Example of the exact format required:
[{"question": "What is X?", "answer": "X is ..."}, {"question": "Why does Y happen?", "answer": "Because..."}]

Answers should be concise (1-3 sentences) and accurate based on the Content. If you cannot extract any flashcards, return an empty array: []

Content:
${pageText}`;
    await makeApiCall(prompt, model, sendResponse);
}


// =================================================================================
// API CALL LOGIC (This is where the major changes are)
// =================================================================================

/**
 * API Call Dispatcher
 * This function checks the model name and routes the request to the appropriate
 * API-specific function (OpenAI or Gemini).
 */
async function makeApiCall(prompt, model, sendResponse) {
    if (model.startsWith('gpt-')) {
        await makeOpenaiApiCall(prompt, model, sendResponse);
    } else if (model.startsWith('gemini-')) {
        await makeGeminiApiCall(prompt, model, sendResponse);
    } else {
        console.error("Unknown model provider for model:", model);
        sendResponse({ success: false, error: `Unknown or unsupported model: ${model}` });
    }
}

/**
 * Makes an API call to OpenAI.
 */
async function makeOpenaiApiCall(prompt, model, sendResponse) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 1024, // Increased for potentially longer pages
                temperature: 0.5
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API Error: ${errorData.error.message}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        sendResponse({ success: true, summary: content });

    } catch (error) {
        console.error("OpenAI API Call Failed:", error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Makes an API call to Google Gemini.
 */
async function makeGeminiApiCall(prompt, model, sendResponse) {
    // The Gemini API endpoint is structured differently
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // The request body format is also different for Gemini
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                // Configuration can be added here if needed
                "generationConfig": {
                    "temperature": 0.5,
                    "maxOutputTokens": 1024
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Error: ${errorData.error.message}`);
        }

        const data = await response.json();
        
        // The response structure is different. We need to check for safety blocks and extract the text.
        if (data.candidates && data.candidates.length > 0) {
            const content = data.candidates[0].content.parts[0].text.trim();
            sendResponse({ success: true, summary: content });
        } else {
            // This can happen if the content is blocked for safety reasons.
            throw new Error("Gemini API Error: No content was generated. It may have been blocked for safety reasons.");
        }

    } catch (error) {
        console.error("Gemini API Call Failed:", error);
        sendResponse({ success: false, error: error.message });
    }
}