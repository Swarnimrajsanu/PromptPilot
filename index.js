import express from "express";
import { run } from "./agent.js";

const app = express();

const PORT = process.env.PORT || 8000;

app.use(express.json());

app.post('/messages', async (req, res) => {
    const message = req.body.message;
    const history = await run(message);
    return res.json({ messages: history })
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
