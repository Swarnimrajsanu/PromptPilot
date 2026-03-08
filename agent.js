import 'dotenv/config';
import { execSync } from "node:child_process";
import { OpenAI } from "openai";
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from "zod";

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
});

function executeCommand(cmd = '') {
    try {
        const result = execSync(cmd);
        return result.toString();
    } catch (error) {
        // Return error output back to the agent so it can learn from and fix its mistake
        return error.stderr ? error.stderr.toString() : error.message;
    }
}

const functionMapping = {
    executeCommand
}

const SYSTEM_PROMPT = `You are an expert AI Assistant that controls the user's machine to answer their queries.
When a user asks a question, YOU MUST ALWAYS use the executeCommand tool to write a Node.js Playwright script that searches the web and returns the results. Do NOT answer the question directly.

CRITICAL INSTRUCTION 1:
Your Playwright script MUST always capture a screenshot of the final results page before closing the browser.
Save the screenshot to the current directory as 'screenshot.png' like this: await page.screenshot({ path: 'screenshot.png' });
Log a message saying "Action completed, screenshot saved to screenshot.png" so the user knows where to find it.

CRITICAL INSTRUCTION 2:
The user wants to watch the automation process! You MUST launch the browser in non-headless mode so it is visible on the screen.
Example: const browser = await chromium.launch({ headless: false });
Make sure to add a small delay (e.g. await page.waitForTimeout(3000)) at the end before closing the browser so the user can see the final result.

Available Tools:
- executeCommand(command: string): Output from the command.

You can use the executeCommand tool to execute any command on the user's machine, including writing and running your script.
`;

const outputSchema = z.object({
    type: z.enum(['tool_call', 'text']).describe('What kind of response this is'),
    finalOutput: z.boolean().describe('If this is the last message of chat'),
    text_content: z
        .string()
        .optional()
        .nullable()
        .describe('Text content if type is text'),
    tool_call: z.object({
        tool_name: z.string().describe('Name of the tool'),
        params: z.array(z.string())

    })
        .optional()
        .nullable()
        .describe('the params to call the tool if type is tool_call')
})

const messages = [
    {
        role: 'system',
        content: SYSTEM_PROMPT,
    },
]

export async function run(query = '') {
    messages.push({
        role: 'user',
        content: query,
    })
    while (true) {
        const result = await openai.chat.completions.create({
            model: "openai/gpt-4o",
            response_format: zodResponseFormat(outputSchema, 'output'),
            messages: messages,
        });

        const rawOutput = result.choices[0].message.content;
        const { jsonrepair } = await import('jsonrepair');
        let parsedOutput;
        try {
            parsedOutput = JSON.parse(rawOutput);
        } catch (e) {
            console.log("Failed to parse JSON, attempting repair...");
            parsedOutput = JSON.parse(jsonrepair(rawOutput));
        }

        messages.push({
            role: 'assistant',
            content: rawOutput
        });

        switch (parsedOutput.type) {
            case 'tool_call':
                {
                    if (parsedOutput.tool_call) {
                        const { params, tool_name } = parsedOutput.tool_call;
                        console.log(`Tool Call: ${tool_name}: ${params}`)
                        if (functionMapping[tool_name]) {
                            const toolOutput = functionMapping[tool_name](...params);
                            console.log(`Tool Output (${tool_name})`, toolOutput)
                            messages.push({
                                role: 'developer',
                                content: JSON.stringify({
                                    tool_name,
                                    params,
                                    output: toolOutput
                                }),
                            });
                        }

                    }

                }
                break;
            case 'text':
                {
                    console.log('Text', parsedOutput.text_content)
                    break;
                }
        }
        if (parsedOutput.finalOutput) {
            return messages;
        }
    }
}

//run('Make a folder named test')
