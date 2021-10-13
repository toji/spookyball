import path from 'path';
import fs from 'fs/promises';

const isBare = (str) => {
    if (str.startsWith('/') || str.startsWith('./') || str.startsWith('../') || str.substr(0, 7) === 'http://' || str.substr(0, 8) === 'https://') {
        return false;
    }
    return true;
};

const isString = (str) => typeof str === 'string';

const validate = (map) => Object.keys(map.imports).map((key) => {
    const value = map.imports[key];

    if (isBare(value)) {
        throw Error(`Import specifier can NOT be mapped to a bare import statement. Import specifier "${key}" is being wrongly mapped to "${value}"`);
    }

    return { key, value };
});

const fileReader = (pathname = '') => new Promise((resolve, reject) => {
    const filepath = path.normalize(pathname);
    fs.readFile(filepath).then((file) => {
        try {
            const obj = JSON.parse(file);
            resolve(validate(obj));
        } catch (error) {
            reject(error);
        }
    }).catch(reject);
});


const CACHE = new Map();

export async function load(importMaps = []) {
    const maps = Array.isArray(importMaps) ? importMaps : [importMaps];

    const mappings = maps.map((item) => {
        if (isString(item)) {
            return fileReader(item);
        }
        return validate(item);
    });

    await Promise.all(mappings).then((items) => {
        items.forEach((item) => {
            item.forEach((obj) => {
                CACHE.set(obj.key, obj.value);
            });
        });
    });
}

export function clear() {
    CACHE.clear();
}

export function plugin() {
    return {
        name: 'importMap',
        setup(build) {
            build.onResolve({ filter: /.*?/ }, (args) => {
                if (CACHE.has(args.path)) {
                    return {
                        path: CACHE.get(args.path),
                        namespace: args.path,
                        external: true
                    };
                }
                return {};
            });
        },
    };
}
