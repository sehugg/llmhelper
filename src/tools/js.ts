import vm from 'node:vm';
import { LLMToolImpl, LLMToolSideEffects } from '../types.js';
import { z } from 'zod';

export const JSInputSchema = z.object({
    expression: z.string().describe("The JavaScript expression to eval(). Runs in an isolated environment.")
});

export const JSOutputSchema = z.object({
    js_result: z.any().describe("The result of the expression")
});

class JSConsole {
    stdout = '';
    stderr = '';

    log(...args: any[]) {
        this.stdout += args.map(o => JSON.stringify(o)).join(' ') + '\n';
    }
    error(...args: any[]) {
        this.stderr += args.map(o => JSON.stringify(o)).join(' ') + '\n';
    }
    
}

export class JSTool extends LLMToolImpl<typeof JSInputSchema, typeof JSOutputSchema> {
    inputSchema = JSInputSchema;
    name = 'JSTool';
    description = 'Evaluates a JavaScript expression';
    sideEffects : LLMToolSideEffects = 'pure';

    async toolCallback(params: z.infer<typeof JSInputSchema>) : Promise<z.infer<typeof JSOutputSchema>> {
        return this.runSync(params.expression);
    }

    runSync(expression: string) {
        const console = new JSConsole();
        const context = vm.createContext({
            console
        });
        try {
            const script = new vm.Script(expression);
            const t1 = Date.now();
            const js_result = script.runInContext(context);
            const msec = Date.now() - t1;
            return { success: true, js_result, msec, stdout: console.stdout, stderr: console.stderr };
        } catch (e) {
            return { success: false, error: e+"", stdout: console.stdout, stderr: console.stderr };
        }
    }
}
