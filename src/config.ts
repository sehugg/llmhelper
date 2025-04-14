
import syncfs from 'fs';
import yaml from 'yaml';
import { LLMApi, LLMModelConfig, ProgramConfig } from './types.js';
import { OllamaApiImpl } from './client/ollama.js';
import { OpenAIApiImpl } from './client/openai.js';
import { AnthropicApiImpl } from './client/anthropic.js';
import { GoogleApiImpl } from './client/google.js';
import { HuggingFaceAPIImpl } from './client/huggingface.js';

// Read the config.yml
export function readConfig(path = './config.yml') {
    const configContents = syncfs.readFileSync(path, 'utf8');
    const config = yaml.parse(configContents) as ProgramConfig;
    if (config.models.default === undefined) {
        throw new Error('Default model not found in config');
    }
    _mainConfig = config;
}

var _mainConfig: ProgramConfig | null = null;

export function getMainConfig() {
    if (!_mainConfig) {
        readConfig();
    }
    return _mainConfig!;
}

export function getModelConfig(model: string | undefined) {
    if (!model) {
        model = process.env.LLM_DEFAULT_MODEL || 'default';
    }
    const modelConfig = getMainConfig().models[model];
    if (!modelConfig) {
        throw new Error(`Model not found: "${model}"`);
    }
    // alias?
    if (typeof modelConfig === 'string') {
        return getModelConfig(modelConfig);
    }
    return modelConfig;
}

const _modelCache: Map<LLMModelConfig, LLMApi> = new Map();

function _getModelAPI(_modelConfig: LLMModelConfig): LLMApi {
    const type = _modelConfig.type;
    const apiKey = _modelConfig.apiKey || getMainConfig().secrets[type]?.apiKey;
    const modelConfig = { ..._modelConfig, apiKey };
    switch (type) {
        case 'ollama':
            return new OllamaApiImpl(modelConfig);
        case 'openai':
            return new OpenAIApiImpl(modelConfig);
        case 'anthropic':
            return new AnthropicApiImpl(modelConfig);
        case 'google':
            return new GoogleApiImpl(modelConfig);
        case 'huggingface':
            return new HuggingFaceAPIImpl(modelConfig);
        default:
            throw new Error(`Unsupported model type: ${type}`);
    }
}

export function getModelAPI(modelConfig: LLMModelConfig): LLMApi {
    let api = _modelCache.get(modelConfig);
    if (!api) {
        api = _getModelAPI(modelConfig);
        _modelCache.set(modelConfig, api);
    }
    return api;
}

export function getSecretsForURL(url: string) {
    const urlObj = new URL(url);
    return getSecretsForHostname(urlObj.hostname);
}

export function getSecretsForHostname(hostname: string) {
    const names = hostname.split('.');
    const hostname1 = names.slice(-3).join('.');
    const hostname2 = names.slice(-2).join('.');
    return getMainConfig().secrets[hostname1] || getMainConfig().secrets[hostname2];
}

export function addSecretsToQueryString(url: string) {
    const urlObj = new URL(url);
    const searchParams = new URLSearchParams(urlObj.search);
    const secrets = getSecretsForHostname(urlObj.hostname);
    if (!secrets) {
        return url;
    }
    for (const [key, value] of Object.entries(secrets)) {
        if (typeof value === 'string' && !key.startsWith('__')) {
            searchParams.set(key, value);
        }
    }
    urlObj.search = searchParams.toString();
    return urlObj.toString();
}

