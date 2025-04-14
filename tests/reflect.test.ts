import assert from 'node:assert';
import test from 'node:test';
import { Method, Param, callFunctionWithReflection, generateReflectionStructure } from '../src/reflect.js';

// TODO

// Example usage
class JSEvaluator {
    @Method('Evaluate a JavaScript expression')
    evalJS(
        @Param('The JavaScript expression to evaluate') expression: string,
        @Param('Safe mode?') safeMode: boolean,
        @Param('How many times') count: number,
        @Param('Arguments') args: string[]
    ) {
        return expression + "_" + safeMode + "_" + count + "_" + args.join(',');
    }
}

// Generate the reflection structure
test('generateReflectionStructure', (t) => {

    const reflectedStructure = generateReflectionStructure(JSEvaluator.prototype, 'evalJS');

    assert.deepStrictEqual(reflectedStructure, {
        name: 'evalJS',
        description: 'Evaluate a JavaScript expression',
        parameters: {
            type: 'object',
            properties: {
                args: {
                    description: 'Arguments',
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                count: {
                    description: 'How many times',
                    type: 'number'
                },
                expression: {
                    type: 'string',
                    description: 'The JavaScript expression to evaluate'
                },
                safeMode: {
                    description: 'Safe mode?',
                    type: 'boolean'
                },
            },
            required: ['expression', 'safeMode', 'count', 'args']
        }
    });

    const args = {
        expression: '1 + 1',
        safeMode: true,
        count: 3,
        args: ['foo','bar']
    };
    const result = callFunctionWithReflection(JSEvaluator.prototype, 'evalJS', args, reflectedStructure);
    assert.strictEqual(result, '1 + 1_true_3_foo,bar');
});
