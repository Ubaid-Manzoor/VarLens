const fetchSerializerFunction = (variableName) => {
  return `
                            const serializeValue = function(value, depth = 0, maxDepth = 3, seen = new WeakSet()) {
                                // Handle max depth
                                if (depth > maxDepth) return '...';
    
                                // Handle primitives
                                if (value === null) return null;
                                if (value === undefined) return undefined;
                                if (typeof value !== 'object' && typeof value !== 'function') {
                                    return value;
                                }
    
                                // Handle circular references
                                if (value && typeof value === 'object') {
                                    if (seen.has(value)) return '[Circular]';
                                    seen.add(value);
                                }
    
                                // Handle Date
                                if (value instanceof Date) {
                                    return {
                                        __type: 'Date',
                                        value: value.toISOString()
                                    };
                                }
    
                                // Handle arrays
                                if (Array.isArray(value)) {
                                    return value.map(item => serializeValue(item, depth + 1, maxDepth, seen));
                                }
    
                                // Handle Map
                                if (value instanceof Map) {
                                    return {
                                        __type: 'Map',
                                        value: Object.fromEntries(
                                            Array.from(value.entries()).map(([k, v]) => [
                                                serializeValue(k, depth + 1, maxDepth, seen),
                                                serializeValue(v, depth + 1, maxDepth, seen)
                                            ])
                                        )
                                    };
                                }
    
                                // Handle Set
                                if (value instanceof Set) {
                                    return {
                                        __type: 'Set',
                                        value: Array.from(value).map(item => 
                                            serializeValue(item, depth + 1, maxDepth, seen)
                                        )
                                    };
                                }
    
                                // Handle functions
                                if (typeof value === 'function') {
                                    return {
                                        __type: 'Function',
                                        value: value.toString()
                                    }
                                }
    
                                // Handle regular objects and class instances
                                const result = {};
                                const isClass = value.constructor && value.constructor.name !== 'Object';
                                if (isClass) {
                                    result.__info = {
                                        type: 'Class',
                                        class: value.constructor.name
                                    }
                                }
    
                                const props = Object.getOwnPropertyNames(value);
                                for (const prop of props) {
                                    try {
                                        const descriptor = Object.getOwnPropertyDescriptor(value, prop);
                                        if (descriptor.get || descriptor.set) {
                                            result[prop] = '<getter/setter>';
                                        } else {
                                            result[prop] = serializeValue(value[prop], depth + 1, maxDepth, seen);
                                        }
                                    } catch (error) {
                                        result[prop] = '<error>';
                                    }
                                }
                                return result;
                            }
                            JSON.stringify(serializeValue(${variableName}));
    `;
};

module.exports = {
  fetchSerializerFunction,
};
