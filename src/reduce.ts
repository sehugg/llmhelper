
import { SorensenDiceSimilarity, DefaultTextParser, ConsoleLogger, RelativeSummarizerConfig, Summarizer, NullLogger, Sentence } from "ts-textrank";
import { LLMContextReducer, LLMMessage } from "./types.js";
import { estimateMessageTokens } from "./llm.js";

export class LogOutputReducer implements LLMContextReducer {

    async reduce(initialMsgs: LLMMessage[], targetTokens: number): Promise<LLMMessage[] | null> {
        const msgs = initialMsgs.map((m,i) => { return { tokens: estimateMessageTokens(m), msg: m, index: i } });
        let totalTokens = msgs.reduce((acc, cur) => acc + cur.tokens, 0);
        if (totalTokens <= targetTokens) {
            return null;
        }
        const reducer = new TextRankReducer();
        // estimate the ratio of the target tokens to the total tokens
        let estRatio = targetTokens / totalTokens / 2;
        console.log('Reducing messages from', totalTokens, 'to about', Math.round(totalTokens * estRatio), 'tokens');
        // sort by length
        msgs.sort((a, b) => b.tokens - a.tokens);
        for (let i=0; i<msgs.length; i++) {
            if (totalTokens <= targetTokens) {
                break;
            }
            totalTokens -= msgs[i].tokens;
            const content = msgs[i].msg.content;
            if (typeof content === 'string') {
                const newContent = await reducer.reduce(content, estRatio);
                msgs[i].msg = { role: msgs[i].msg.role, content: newContent };
                totalTokens += estimateMessageTokens(msgs[i].msg);
            }
        }
        // reorder by index
        msgs.sort((a, b) => a.index - b.index);
        return msgs.map(t => t.msg);
    }
}

export class TextRankReducer {

    errRegex = /(error|warning|fatal|fail|not.found|notfound|\bE[A-Z][A-Z]+:)/i;

    async reduce(text: string, ratio: number): Promise<string> {
        if (text.length == 0) return '';
        const lines = text.split('\n');
        const firstLines = lines.slice(0, Math.floor(lines.length * ratio * 0.25));
        const lastLines = lines.slice(lines.length - Math.floor(lines.length * ratio * 0.25));
        const middleLines = this._reduce(lines.slice(firstLines.length, lines.length-lastLines.length).join('\n'), ratio * 0.45);
        //const middleLines = lines.slice(firstLines.length, lines.length - lastLines.length);
        return firstLines.join('\n') + '\n...\n' + middleLines + '\n...\n' + lastLines.join('\n');
    }

    private _reduce(text: string, ratio: number) {

        // keep all lines with regex
        /*
        const lines = text.split('\n');
        const keepText = lines.filter(l => this.errRegex.test(l)).join('\n');
        const restOfText = lines.filter(l => !this.errRegex.test(l)).join('\n');
        ratio *= 1 - keepText.length / text.length;
        */

        //Only one similarity function implemented at this moment.
        //More could come in future versions.
        const sim = new SorensenDiceSimilarity()

        //Only one text parser available a this moment
        const parser = new DefaultTextParser()

        //Do you want logging?
        const logger = new ConsoleLogger()

        //You can implement LoggerInterface for different behavior,
        //or if you don't want logging, use this:
        //const logger = new NullLogger()

        //Set the summary length as a percentage of full text length

        //Damping factor. See "How it works" for more info.
        const d = .85

        //How do you want summary sentences to be sorted?
        //Get sentences in the order that they appear in text:
        const sorting = Summarizer.SORT_OCCURENCE
        //Or sort them by relevance:
        //const sorting = SORT_BY.SCORE
        const config = new RelativeSummarizerConfig(ratio, sim, parser, d, sorting)

        //Or, if you want a fixed number of sentences:
        //const number = 5
        //const config = new AbsoluteSummarizerConfig(number, sim, parser, d, sorting)    

        const summarizer = new Summarizer(config, logger)

        //Language is used for stopword removal.
        //See https://github.com/fergiemcdowall/stopword for supported languages
        const lang = "en"

        //summary will be an array of sentences summarizing text
        const summary = summarizer.summarize(text, lang)
        return summary.join('\n');  
    }
}
