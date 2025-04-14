import Rand from "rand-seed";

export class MCTSNode {
    parent: MCTSNode | null;
    children: MCTSNode[];
    visits: number;
    totalScore: number;
    index: number;
    action: string | null;
    hints : any[] = [];
    privateInfo : any;

    constructor(parent: MCTSNode | null, index: number, action: string | null = null) {
        this.parent = parent;
        this.children = [];
        this.visits = 0;
        this.totalScore = 0;
        this.action = action;
        this.index = index;
    }

    addChild(action?: string): MCTSNode {
        const child = new MCTSNode(this, this.children.length, action);
        this.children.push(child);
        return child;
    }

    update(score: number) {
        this.visits += 1;
        this.totalScore += score;
    }

    UCB1(explorationConstant: number): number {
        if (this.visits === 0) {
            return 0;
        }
        const exploitation = this.totalScore / this.visits;
        const exploration = Math.sqrt(Math.log(this.parent!.visits || 1) / this.visits);
        return exploitation + explorationConstant * exploration;
    }

    // TODO???
    UCBnew(explorationConstant: number): number {
        return explorationConstant / Math.log(this.children.length + 1);
        /*
        const exploitation = 1 / (this.children.length + 1);
        const exploration = Math.sqrt(Math.log(this.visits || 1));
        //console.log(`UCBnew(): ${this.path()} exploitation ${exploitation}, exploration ${exploration}, visits ${this.visits}`);
        return exploitation + explorationConstant * exploration;
        */
    }

    avgScore() : number {
        return this.totalScore / (this.visits || 1);
    }

    avgChildrenScore() : number {
        return this.children.reduce((acc, child) => acc + child.avgScore(), 0) / (this.children.length || 1);
    }

    scoreParentRatio(): number {
        return this.avgScore() / (this.parent?.avgChildrenScore() || 1);
    }

    isLeafOrSinglePath(): boolean {
        if (this.children.length === 0) return true;
        if (this.children.length > 1) return false;
        return this.children[0].isLeafOrSinglePath();
    }

    computeTotalDescendantScore(): number {
        return (1 - this.avgScore()) + this.children.reduce((sum, child) => sum + child.computeTotalDescendantScore(), 0);
    }

    // TODO?
    computeExpansionProbability(): number {
        //return (1 - this.avgScore()) / this.computeTotalDescendantScore();
        //return this.children.length==0 ? 1 : this.children.reduce((sum, child) => sum * child.computeExpansionProbability(), this.avgScore())
        return 1 / this.countDescendants();
    }

    countDescendants(): number {
        return 1 + this.children.reduce((sum, child) => sum + child.countDescendants(), 0);
    }

    nodeChain() : MCTSNode[] {
        let node = this as MCTSNode;
        let parents = [];
        while (node.parent) {
            parents.unshift(node);
            node = node.parent;
        }
        return parents;
    }

    path() : string {
        return this.nodeChain().map(node => node.index).join('.');
    }

    actionPath() : string {
        return this.nodeChain().map(node => node.action || node.index).join('.');
    }
}

export class MCTS {
    root: MCTSNode;
    current : MCTSNode;
    explorationConstant: number;
    numExpands: number = 0; // TODO: use these to decrease exploration constant
    rand: Rand;

    logDebug = true;
    debug(message?: any, ...optionalParams: any[]) {
        if (this.logDebug) {
            console.log(message, ...optionalParams);
        }
    }

    constructor(explorationConstant: number = Math.sqrt(1)) {
        this.root = this.current = new MCTSNode(null, -1);
        this.explorationConstant = explorationConstant;
        this.rand = new Rand(explorationConstant.toString());
    }

    reset() {
        this.current = this.root;
        this.numExpands = 0;
    }

    choose(actions?: string[]): MCTSChoice {
        let selectedNode = this.selectBestChild(this.current);
        let newNodeBetterScore = false;
        let expandSinglePath = false;
        let fullyExpanded = actions && this.current.children.length == actions?.length;
        if (selectedNode) {
            let score = selectedNode?.UCB1(this.explorationConstant) / (this.explorationConstant + 1);
            let newScore = 2 / (this.current.children.length + 1); // TODO?
            //let newScore = this.rand.next(); // this.current.UCBnew(this.explorationConstant) / (this.explorationConstant + 1);
            this.debug(`choose(): select ${selectedNode.path()}, score: ${score}, newScore: ${newScore}`);
            newNodeBetterScore = newScore > score;
            
            if (this.numExpands == 0 && selectedNode.isLeafOrSinglePath()) {
                let expansionProbability = selectedNode.computeExpansionProbability();
                expandSinglePath = this.rand.next() < expansionProbability;
                this.debug(`choose(): expandSinglePath ${selectedNode.path()} ${expandSinglePath}, expansionProbability: ${expansionProbability}`);
            }
        }
        if (!selectedNode || newNodeBetterScore || expandSinglePath) {
            if (fullyExpanded) {
                if (!selectedNode) throw new Error('Fully expanded but no selected node');
            } else {
                selectedNode = this.expand(this.current, actions ? actions[this.current.children.length] : undefined);
                this.debug(`choose(): expand ${selectedNode.path()}`);
            }
        }
        if (selectedNode.parent !== this.current) throw new Error('Parent mismatch');
        this.current = selectedNode;
        return new MCTSChoice(this, selectedNode);
    }

    selectBestChild(node: MCTSNode): MCTSNode | null {
        let best : MCTSNode | null = null;
        for (let child of node.children) {
            if (best === null || child.UCB1(this.explorationConstant) > best.UCB1(this.explorationConstant)) {
                best = child;
            }
        }
        return best;
    }

    expand(node: MCTSNode, action?: string): MCTSNode {
        this.numExpands++;
        return node.addChild(action);
    }

    backpropagate(node: MCTSNode, score: number) {
        while (node !== null) {
            node.update(score);
            node = node.parent!;
        }
    }

    allLeafNodes() : MCTSNode[] {
        let nodes = [];
        let stack = [this.root];
        while (stack.length > 0) {
            let node = stack.pop()!;
            if (node.children.length === 0) {
                nodes.push(node);
            } else {
                stack.push(...node.children);
            }
        }
        return nodes;
    }

    bestLeafNodes() {
        const all = this.allLeafNodes().filter(node => node.visits > 0);
        all.sort((a, b) => b.avgScore() - a.avgScore());
        return all;
    }

    score(score: number) {
        this.backpropagate(this.current, score);
    }
}

export class MCTSChoice {
    readonly mcts: MCTS;
    readonly node: MCTSNode;
    readonly action: string | null;

    constructor(mcts: MCTS, node: MCTSNode) {
        this.mcts = mcts;
        this.node = node;
        this.action = node.action;
    }

    filename(name: string): string {
        if (!this.node.parent) {
            return name; // Root node case
        }
        // extract file + ext
        const parts = name.split('.', 2);
        if (parts.length == 2) {
            return `${parts[0]}.${this.node.path()}.${parts[1]}`;
        } else {
            return `${name}.${this.node.path()}`;
        }
    }

    score(score: number) {
        this.mcts.backpropagate(this.node, score);
    }

    estimate(score: number) {
        if (this.node.visits === 0) {
            this.mcts.backpropagate(this.node, score);
        }
    }
}
