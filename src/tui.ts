import { LLMMessage, LLMRunResult } from './types.js';

export class LLMTUI {
    constructor() {
    }
    async indefiniteTask<T>(promise: Promise<T>,
        message: string,
        finalCaption?: (result?: T) => string): Promise<T> {

        const Ora = await import('ora');
        const spinner = Ora.default({
            text: message,
            spinner: 'dots',
            hideCursor: false,
            discardStdin: false,
        }).start();
        try {
            const result = await promise;
            spinner.succeed(finalCaption && finalCaption(result));
            return result;
        } catch (e) {
            let errorMsg = message + ": " + e;
            errorMsg = errorMsg.split('\n')[0];
            errorMsg = errorMsg.slice(0, 100);
            spinner.fail(message + ": " + errorMsg);
            throw e;
        }
    }
    async log(message?: any, ...optionalParams: any[]) {
        console.log(message, ...optionalParams);
    }
    async logMessages(messages: LLMMessage[] | LLMMessage) {
        const chalk = (await import('chalk')).default;
        const colorMap = {
            'system': chalk.yellow,
            'user': chalk.green,
            'assistant': chalk.cyan,
            'tool': chalk.blue,
        }
        if (!Array.isArray(messages)) {
            messages = [messages];
        }
        for (let msg of messages) {
            this.log(colorMap[msg.role](msg.content));
        }
    }
}
