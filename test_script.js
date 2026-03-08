import { run } from "./agent.js";

async function main() {
    console.log("Starting agent...");
    const history = await run("who is Elon Musk");
    console.log("Agent finished.");
    console.log(JSON.stringify(history, null, 2));
}

main();
