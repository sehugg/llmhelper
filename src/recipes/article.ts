import { newArtifact } from "../env.js";
import { LLMHelper } from "../llm.js";
import matter from 'gray-matter';
import { z } from "zod";

function cleanMarkdown(s: string) {
    s = s.replace(/```(markdown|yaml)\n---/, '---');
    s = s.replace(/---\n```\n/, '---\n');
    return s.trim();
}

// TODO: other kinds of articles besides tech blog posts?
export async function writeArticle(llm: LLMHelper, subject: string, projectInfo: any, references?: any) {
    // prompt for blog post
    const result = await llm
        .format('markdown')
        .outputFile('article.md')
        .addObject(projectInfo, 'projectInfo')
        .prompt(`Write a detailed blog post about "${subject}".
Create a front matter section with title, description, filename (.md), and tags (only lowercase).
Be sure to cover all the topics listed.
Describe each section of the code in detail and include expected outputs.
Use ## sections.
If relevant, you can link to files or include images described in the "workspaceFiles" array.
Do not make up code, use what is provided in the "projectInfo" object.`)
        .prompt(references && `Link to these posts as examples, but do not repeat information in them: ${JSON.stringify(references)}`)
        .run();

    // TODO: how do we link to other blog posts?

    // modify front matter and write final post
    let frontMatter = matter(cleanMarkdown(result.output));
    if (!frontMatter.data.filename) {
        console.warn('No filename found in front matter, prompting again');
        const result2 = await result.continue()
            .outputFile('article-fm.md')
            .prompt('You forgot the front matter section and/or filename. Just output the front matter, please.')
            .run();
        frontMatter.data = matter(cleanMarkdown(result2.output)).data;
    }
    if (frontMatter.data.filename) {
        frontMatter.data.date = new Date();
        try {
            if (Array.isArray(frontMatter.data.tags) && frontMatter.data.tags.length) {
                frontMatter.data.tags = frontMatter.data.tags.map((t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
            }
        } catch (e) {
            console.log('Could not reformat tags:', e);
        }
        // YAMLException: unacceptable kind of an object to dump [object Undefined] ?
        frontMatter.data.project = projectInfo;
        const newContent = matter.stringify(frontMatter.content, frontMatter.data);
        // TODO: dest filename path
        const finalPost = await llm.env.saveArtifact(newArtifact('final/' + frontMatter.data.filename, newContent));
        result.runResult.artifacts.push(finalPost); // TODO?
    } else {
        console.warn('No filename found in front matter, not saving article');
    }
    return result;
}
