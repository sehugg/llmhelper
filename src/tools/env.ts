import { newArtifact } from "../env.js";
import { LLMEnvironment, LLMToolImpl, LLMToolSideEffects } from "../types.js";
import { z } from "zod";

const InputSchema = z.object({
    path: z.string().describe("The path to the file, relative to the workspace."),
    writeContents: z.string().optional().describe("The contents to write to the file."),
});

const OutputSchema = z.object({
    path: z.string(),
    success: z.boolean(),
});

export class EnvironmentTool extends LLMToolImpl<typeof InputSchema, typeof OutputSchema> {
    inputSchema = InputSchema;
    name = 'EnvironmentTool';
    description = 'Manipulate files in the workspace.';
    sideEffects : LLMToolSideEffects = 'stateful';

    constructor(readonly env: LLMEnvironment) {
        super();
    }

    async toolCallback(params: z.infer<typeof InputSchema>): Promise<z.infer<typeof OutputSchema>> {
        let path = params.path;
        if (params.writeContents != null) {
            if (path.startsWith('./')) path = path.substring(2);
            if (path.startsWith('/')) path = path.substring(1);
            await this.env.saveArtifact(newArtifact(path, params.writeContents));
            return { path, success: true };
        } else
            return { path, success: false };
    }
}
