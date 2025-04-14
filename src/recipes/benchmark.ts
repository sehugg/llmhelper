import { LLMHelper } from "../llm.js";
import { LLMSchema } from "../types.js";
import { z } from 'zod';

// TODO: unify all tournament classes?

export type BenchmarkResult = {
    model: string;
    score: number;
}

// TODO: string result
export async function benchmarkModels<OutputSchema extends LLMSchema, OutputType = z.TypeOf<OutputSchema>>(
    llm: LLMHelper,
    models: string[],
    outputSchema: OutputSchema,
    evaluate: (output: OutputType, model?: string) => number | boolean
) {
    const promises = models.map(async (model) => {
        try {
            const result = await llm.model(model).generate(outputSchema);
            const score = result.runResult.errors.length ? 0 : evaluate(result.output as OutputType, model);
            return { model, result, score: Number(score) };
        } catch (e) {
            console.log(e);
            return { model, error: e + "", score: 0 };
        }
    });
    const results = (await Promise.all(promises)).filter(r => r !== null);
    results.sort((a, b) => b.score - a.score);
    return results;
}

export class EliminationTournament {
    round = 0;

    constructor(public models: string[]) { }

    winner() {
        return this.models.length === 1 ? this.models[0] : null;
    }

    submit(results: BenchmarkResult[]) {
        if (this.winner()) {
            throw new Error('Tournament is already done');
        }
        this.round++;
        const worst = results[results.length - 1];
        if (worst.score >= 1) {
            console.log(`Round ${this.round}: No elimination`);
        } else {
            console.log(`Round ${this.round}: Eliminating ${worst.model}`);
            this.eliminate(worst.model);
        }
    }

    eliminate(model: string) {
        this.models = this.models.filter(m => m !== model);
    }
}

// https://en.wikipedia.org/wiki/Sequential_probability_ratio_test

export interface SPRTResult {
    winner: string;
    loser: string;
    samplesTaken: number;
}

export abstract class SPRTEliminationTournament extends EliminationTournament {
    round = 0;
    iter = 0;
    alpha = 0.10;
    beta = 0.10;
    delta = 0.05;
    variance = 0.05;
    maxItersPerPair = 10;
    useCache = true;
    private _cachedResults = new Map<string, number>();

    async runTournament(): Promise<string> {
        while (!this.winner()) {
            await this.runRound();
        }
        const winner = this.winner()!;
        console.log(`Winner:`, winner);
        return winner;
    }

    private async runRound(): Promise<void> {
        this.round++;
        console.log(`Starting round ${this.round}`);

        const results: SPRTResult[] = [];
        for (let i = 0; i < this.models.length; i++) {
            for (let j = i + 1; j < this.models.length; j++) {
                const result = await this.runSPRT(this.models[i], this.models[j]);
                console.log(`Round ${this.round}: ${result.winner} (win) vs ${result.loser} took ${result.samplesTaken} samples`);
                results.push(result);
            }
        }

        const losses = new Map<string, number>();
        for (const result of results) {
            losses.set(result.loser, (losses.get(result.loser) || 0) + 1);
        }

        const worstModel = Array.from(losses.entries()).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        console.log(`Round ${this.round}: Eliminating ${worstModel}`);
        this.models = this.models.filter(m => m !== worstModel);
    }

    private async runSPRT(modelA: string, modelB: string): Promise<SPRTResult> {
        // Calculate SPRT thresholds (cumulative log likelihood ratio)
        const lower = Math.log(this.beta / (1 - this.alpha));
        const upper = Math.log((1 - this.beta) / this.alpha);
        console.log(`Running SPRT ${modelA} vs ${modelB}, lower=${lower}, upper=${upper}`);

        let s = 0;
        let n = 0;

        for (let i = 0; i < this.maxItersPerPair; i++) {
            this.iter = n++;
            
            let { scoreA, scoreB } = await this.runModelPair(modelA, modelB);
            if (isNaN(scoreA)) {
                return { winner: modelB, loser: modelA, samplesTaken: n };
            }
            if (isNaN(scoreB)) {
                return { winner: modelA, loser: modelB, samplesTaken: n };
            }
            // clamp scores to [0, 1]
            scoreA = Math.max(0, Math.min(1, scoreA));
            scoreB = Math.max(0, Math.min(1, scoreB));

            const likelihoodRatio = this.calculateLikelihoodRatio(scoreA, scoreB);
            s += Math.log(likelihoodRatio);
            console.log(`SPRT ${modelA} vs ${modelB}: ${scoreA} vs ${scoreB}, s=${s}, n=${n}`);

            if (s <= lower) {
                return { winner: modelB, loser: modelA, samplesTaken: n };
            } else if (s >= upper) {
                return { winner: modelA, loser: modelB, samplesTaken: n };
            }
        }
        if (s >= 0) {
            return { winner: modelA, loser: modelB, samplesTaken: n };
        } else {
            return { winner: modelB, loser: modelA, samplesTaken: n };
        }
    }

    private calculateLikelihoodRatio(scoreA: number, scoreB: number): number {
        // Assume normal distribution for scores
        const meanDiff = this.delta;

        const likelihoodH0 = Math.exp(-Math.pow(scoreA - scoreB, 2) / (4 * this.variance));
        const likelihoodH1 = Math.exp(-Math.pow((scoreA - scoreB) - meanDiff, 2) / (4 * this.variance));

        return likelihoodH1 / likelihoodH0;
    }

    private async runModelCached(model: string) {
        const key = `${this.round}-${this.iter}-${model}`;
        if (this.useCache && this._cachedResults.has(key)) {
            return this._cachedResults.get(key)!;
        }
        try {
            const score = await this.runModel(model);
            if (this.useCache) {
                this._cachedResults.set(key, score);
            }
            return score;
        } catch (e) {
            console.error(`Error running model ${model}: ${e}`);
            return NaN;
        }
    }

    async runModelPair(modelA: string, modelB: string) {
        const [scoreA, scoreB] = await Promise.all([
            this.runModelCached(modelA),
            this.runModelCached(modelB)
        ]);
        return { scoreA, scoreB };
    }

    // TODO: unify benchmark impls function vs method?
    abstract runModel(model: string): Promise<number>;
}
