import "./utils/envocation.js";
import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { handleSessionCreate, messageWithSession, getMessages} from "./controllers/chat-api.js";
import { fileURLToPath } from "url";
import { createClient } from "chat-sdk-custom";
import { chatAnalyticsMiddleware } from "./middleware/sdkhandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../",'data')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../', 'data', 'index.html'));
});

app.get("/createsession", handleSessionCreate);
app.post("/chat/message", chatAnalyticsMiddleware, messageWithSession);
app.post("/messages", getMessages);

app.listen(process.env.PORT || 3000, ()=>{
    console.log("running the simple chat server.");
});
