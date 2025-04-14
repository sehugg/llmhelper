import assert from 'node:assert';
import test from 'node:test';
import { LLMHelper } from '../src/llm.js';
import { loadImageToBase64Url } from '../src/util.js';

const IMAGE_MODELS = ['gemini', 'mini', 'minicpm-v'];

test('image 1', async (t) => {
    for (let model of IMAGE_MODELS) {
        const helper = new LLMHelper().model(model);
        const out1 = await helper
            .prompt('What is the make, model, and color of this car?')
            .image(await loadImageToBase64Url('../tests/images/car.jpeg'))
            .run();
        console.log(out1.output);
        assert.ok(out1.output.includes('red'));
        assert.ok(out1.output.includes('Mitsubishi'));
        assert.ok(out1.output.includes('Eclipse'));
    }
});
test('image ocr', async (t) => {
    for (let model of IMAGE_MODELS) {
        const helper = new LLMHelper().model(model);
        const out1 = await helper
            .prompt('Read all of the text from this image')
            .image(await loadImageToBase64Url('../tests/images/receipt2.jpeg'))
            .run();
        console.log(out1.output);
        assert.ok(out1.output.includes('SUBTOTAL'));
        assert.ok(out1.output.includes('224.99'));
        assert.ok(out1.output.includes('INVOICE 16993'));
    }
});
test('image multiple', async (t) => {
    for (let model of IMAGE_MODELS) {
        const helper = new LLMHelper().model(model);
        const out1 = await helper
            .prompt('The person in the first image is Albert Einstein. Describe the second image.')
            .image(await loadImageToBase64Url('../tests/images/einstein_head.jpg'))
            .image(await loadImageToBase64Url('../tests/images/einstein_group.jpg'))
            .run();
        console.log(out1.output);
    }
});
