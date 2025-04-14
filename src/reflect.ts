import 'reflect-metadata';

const METHOD_DESCRIPTIONS = Symbol('methodDescriptions');
const PARAM_DESCRIPTIONS = Symbol('paramDescriptions');
const OPTIONAL_PARAMS = Symbol('optionalParams');

// Decorator for describing methods
export function Method(description: string) {
    return (target: Object, propertyKey: string | symbol) => {
        Reflect.defineMetadata(METHOD_DESCRIPTIONS, description, target.constructor, propertyKey);
    };
}

// Decorator for describing parameters
export function Param(description: string) {
    return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
        const existingDescriptions: Record<number, string> = Reflect.getMetadata(PARAM_DESCRIPTIONS, target.constructor, propertyKey) || {};
        existingDescriptions[parameterIndex] = description;
        Reflect.defineMetadata(PARAM_DESCRIPTIONS, existingDescriptions, target.constructor, propertyKey);
    };
}

export function Optional() {    
    return (target: Object, propertyKey: string | symbol, parameterIndex: number) => {
        const optionals: Record<number, boolean> = Reflect.getMetadata(OPTIONAL_PARAMS, target.constructor, propertyKey) || {};
        optionals[parameterIndex] = true;
        Reflect.defineMetadata(OPTIONAL_PARAMS, optionals, target.constructor, propertyKey);
    };
}

// Helper types
type PrimitiveType = 'string' | 'number' | 'boolean';

type PropertyDescription = {
    type: PrimitiveType | 'object' | 'array';
    description?: string;
    items?: PropertyDescription;
    properties?: Record<string, PropertyDescription>;
    optional?: boolean;
};

type FunctionReflection = {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, PropertyDescription>;
        required: string[];
    };
};

// Function to get parameter descriptions
function getParameterDescriptions(target: any, propertyKey: string | symbol): Record<number, string> {
    return Reflect.getMetadata(PARAM_DESCRIPTIONS, target, propertyKey) || {};
}

// Function to get function description
function getFunctionDescription(target: any, propertyKey: string | symbol): string {
    return Reflect.getMetadata(METHOD_DESCRIPTIONS, target, propertyKey) || '';
}

function getOptionalParams(target: any, propertyKey: string | symbol): Record<number, boolean> {
    return Reflect.getMetadata(OPTIONAL_PARAMS, target, propertyKey) || {};
}

// Function to generate reflection structure
export function generateReflectionStructure(
    target: any,
    propertyKey: string
): FunctionReflection {
    const paramTypes = Reflect.getMetadata('design:paramtypes', target, propertyKey);
    const paramNames = getParameterNames(target[propertyKey]);
    const paramDescriptions = getParameterDescriptions(target.constructor, propertyKey);
    const functionDescription = getFunctionDescription(target.constructor, propertyKey);

    function getPropertyDescription(param: any, index: number): PropertyDescription {
        const description = paramDescriptions[index] || "";
        if (typeof param === 'function') {
            const paramType = param.name.toLowerCase();
            if (paramType === 'array') {
                return {
                    type: 'array',
                    items: {
                        type: 'string' // TODO
                    },
                    description
                };
            } else {
                return {
                    type: paramType as PrimitiveType,
                    description
                };
            }
        } else if (typeof param === 'object' && param !== null) {
            // TODO? enum?
            return {
                type: 'object',
                description
            };
        } else {
            throw new Error('Unsupported parameter type: ' + typeof param + " " + param);
        }
    }

    const properties: Record<string, PropertyDescription> = {};
    const required: string[] = [];
    const optionals = getOptionalParams(target.constructor, propertyKey);

    paramTypes.forEach((type: any, index: number) => {
        const pname = paramNames[index];
        properties[pname] = getPropertyDescription(type, index);
        if (!optionals[index]) {
            required.push(pname);
        }
    });

    const reflection: FunctionReflection = {
        name: propertyKey,
        description: functionDescription,
        parameters: {
            type: 'object',
            properties: properties,
            required: required
        }
    };

    return reflection;
}

// Helper function to get parameter names (this is a simple implementation and might not work for all cases)
function getParameterNames(func: Function): string[] {
    const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    const ARGUMENT_NAMES = /([^\s,]+)/g;
    const fnStr = func.toString().replace(STRIP_COMMENTS, '');
    const result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    return result || [];
}

// New utility function to call a function using the reflected structure
export function callFunctionWithReflection(
    instance: any,
    functionName: string,
    params: Record<string, any>,
    reflectionData: FunctionReflection
): any {
    // Verify that the function exists on the instance
    if (typeof instance[functionName] !== 'function') {
        throw new Error(`Function ${functionName} does not exist on the given instance`);
    }

    // Verify that the provided args match the reflection data
    const reflectedParams = reflectionData.parameters.properties;
    let args = [];
    for (const paramName in reflectedParams) {
        const required = reflectionData.parameters.required.includes(paramName);
        if (required && !(paramName in params)) {
            throw new Error(`Missing required parameter: ${paramName}`);
        }
        // TODO: You could add type checking here if needed
        args.push(params[paramName]);
    }

    // Call the function with the provided arguments
    return instance[functionName].apply(instance, args);
}

function getMethods(instance: object) {
    // Get the prototype of the instance
    const prototype = Object.getPrototypeOf(instance);

    // Get all property names of the prototype
    const propertyNames = Object.getOwnPropertyNames(prototype);

    // Filter out non-function properties and exclude 'constructor'
    return propertyNames.filter(prop => {
        return typeof prototype[prop] === 'function' && prop !== 'constructor' && !prop.startsWith('_');
    });
}
