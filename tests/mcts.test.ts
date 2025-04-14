import assert from 'node:assert';
import test from 'node:test';
import { MCTS } from '../src/mcts.js';

test('test mcts', async (t) => {
    let mcts = new MCTS();
    mcts.reset();
    let choice1 = mcts.choose();
    assert.equal(choice1.filename('code.js'), 'code.0.js');
    choice1.score(1.0);
    let choice2 = mcts.choose();
    assert.equal(choice2.filename('data.js'), 'data.0.0.js');
    choice2.score(0.00001);
    mcts.reset();
    // gotta have at least 2 choices
    let choice3 = mcts.choose();
    //assert.equal(choice3.filename('code.js'), 'code.js.1');
    let choice4 = mcts.choose();
    choice4.node.hints.push({ test_failures: [{ test: 'test1', result: 'fail' }] });
    //assert.equal(choice4.filename('data.js'), 'data.js.1.0');
    //console.log(flatted.stringify(mcts));
});

test('test mcts no score', async (t) => {
    let mcts = new MCTS();
    mcts.reset();
    let choice1 = mcts.choose();
    assert.equal(choice1.filename('code.js'), 'code.0.js');
    let choice2 = mcts.choose();
    assert.equal(choice2.filename('data.js'), 'data.0.0.js');
    // no score, so should ignore this branch
    mcts.reset();
    let choice3 = mcts.choose();
    assert.equal(choice3.filename('code.js'), 'code.1.js');
    let choice4 = mcts.choose();
    assert.equal(choice4.filename('data.js'), 'data.1.0.js');
    choice4.score(1);
    assert.equal(choice4.node.nodeChain().length, 2);
    for (let i=0; i<100; i++) {
        mcts.reset();
        let choice5 = mcts.choose();
        assert.notEqual(choice5.filename('code.js'), 'code.0.js');
    }
});

test('test mcts 2', async (t) => {
    let mcts = new MCTS();
    for (let i=0; i<100; i++) {
        mcts.reset();
        let choice = mcts.choose();
        for (let j=0; j<5; j++) {
            choice = mcts.choose();
        }
        if (Math.random() > 0.1) {
            choice.score(Math.random());
        }
        assert.ok(mcts.numExpands > 0);
    }
    const bestnodes = mcts.bestLeafNodes();
    const best = bestnodes[0];
    console.log(bestnodes.map(node => node.avgScore()));
    console.log(best.path(), best.visits, best.avgScore())
    assert.ok(best.avgScore() > 0.85);
});

