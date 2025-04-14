import { LLMArtifactContent, LLMChatInput, LLMValidateResult } from "./types.js";
import { stripMarkdownCodeBlockDelimiters } from "./util.js";

export class TextValidator {

    getFormat() {
        return {
            format: 'string',
            formatPrompt: "In your response, output only text, with no Markdown or other delimiters."
        };
    }

    async prepareInput(prompt: LLMChatInput): Promise<LLMChatInput> {
        return prompt;
    }

    async validateOutput(content: LLMArtifactContent): Promise<LLMValidateResult> {
        if (typeof content !== 'string') {
            return { error: 'Expected string, not object.' };
        }
        content = stripMarkdownCodeBlockDelimiters(content);
        if (content.includes('\n```')) {
            return { error: 'Did not expect Markdown formatting.' };
        }
        return { content };
    }
}
