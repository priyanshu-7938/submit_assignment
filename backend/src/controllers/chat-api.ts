import { Response, Request } from "express";
import Guards, { ValidationResult } from "../services/guards/index.js";
import LLM, { ChatMessage } from "../services/llm/index.js";
import DataLayer, { Message } from "../services/data/index.js";
import { Role } from "../../generated/prisma/client.js"; 


const handleSessionCreate = async (req: Request, res: Response) =>{
    // pinging the data layer to create an session..
    const sessionId = await DataLayer.createSession();
    res.status(200).json({
        message: "Create a session for the chat",
        sessionId 
    });
};

const messageWithSession = async (req: Request, res: Response) => {
    const { sessionId, message } = req.body;
    if(!sessionId || !message){
        // there is an error.....
        res.status(400).json("failed to validate body");
        return;
    }
    try{
        // path uses should be 
        // guards first then
        // data layer
        // knowledge layer is required via data layer...
        // llm 
        // Guards validation
        // const guardDetails: ValidationResult = await Guards.validate(message, sessionId).catch((e)=>{
        //     console.error("[messageWithSession] Guard failed to validate the result.", e);
        //     throw Error("Guard Validation failed with error.");
        // })
        // if(!guardDetails.isValid){
        //     console.error("[messageWithSession] Guard fail error: ", guardDetails.error, ", reason: ", guardDetails.reason);
        //     res.status(200).json({status: true, messsage: "Guard failed, contain malecious text or reaced limit. Cant reply to the mesage",});
        //     return;
        // }
        const chatHistroy: Message[] = await DataLayer.getChatHistory(sessionId);

        const response: string = await LLM.generateReply(chatHistroy as ChatMessage[], "", message);
        // Add messages to chat
        await DataLayer.addChatMessages(sessionId, [
            { role: Role.USER, content: message },
            { role: Role.BOT, content: response }
        ]);

        res.status(200).json({ status: true, response });
    }catch(e:any){
        res.status(401).json({status: false, message: "failed to validate or generate a res.", error: e});
    }
}

const getMessages = async (req: Request, res: Response )=>{
    // well man..
    const { sessionId } = req.body;
    if(!sessionId){
        // there is an error.....
        res.status(400).json("failed to validate body");
        return;
    }
    try{
        const chatHistroy: Message[] = await DataLayer.getChatHistory(sessionId);
        res.status(200).json({ status: true, messages: chatHistroy });
    }catch(err){
        res.status(500).json({ status: false, message: "Failed to fetch messages.", error: err instanceof Error ? err.message : err });
    }

}

export {
    handleSessionCreate,
    messageWithSession,
    getMessages
}