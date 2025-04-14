import { LLMMessage } from "./types.js";
import { estimateMessageTokens, tokenizer } from "./llm.js";

export class LLMChatContext {

    private readonly messages: LLMMessage[];

    constructor(
        readonly parent: LLMChatContext | null = null,
        messages: LLMMessage[] = []
    ) {
        this.messages = messages.slice(0);
    }

    getAllMessages(): LLMMessage[] {
        return this.parent ? [...this.parent.getAllMessages(), ...this.messages] : this.messages;
    }

    getAllMessagesUntil(context: LLMChatContext): LLMMessage[] {
        if (this === context) {
            return [];
        } else if (this.parent) {
            return [...this.parent.getAllMessagesUntil(context), ...this.messages];
        } else {
            throw new Error('getAllMessagesUntil(): Context not found in parent chain');
        }
    }

    newContext(messages: LLMMessage[] = []): LLMChatContext {
        return new LLMChatContext(this, messages);
    }

    reparent(split: LLMChatContext, connect: LLMChatContext): LLMChatContext {
        if (split === connect) {
            return connect;
        } else {
            return new LLMChatContext(connect, this.getAllMessagesUntil(split));
        }
    }

    estimateTokens(): number {
        return this.messages.reduce((acc, msg) => acc + estimateMessageTokens(msg), 0) 
            + (this.parent?.estimateTokens() || 0);
    }
}
